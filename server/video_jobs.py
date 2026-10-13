"""Local-only durable motion jobs. Remote workers intentionally lack this API.

One process owns this store. A server restart marks unfinished jobs interrupted;
completed files remain downloadable. Jobs survive browser navigation/disconnect.
"""
import asyncio
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import time
import uuid

from fastapi import File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

ROOT = Path(__file__).resolve().parents[1]
STORE = Path(os.environ.get('SMARTINK_VIDEO_DIR', Path(tempfile.gettempdir()) / ('smartink-video-' + hashlib.sha256(str(ROOT).encode()).hexdigest()[:12])))
TERMINAL = {'complete', 'failed', 'cancelled'}
TIMEOUT = max(60, min(7200, int(os.environ.get('SMARTINK_VIDEO_TIMEOUT', '3600'))))
TASKS = {}
CANCELLATIONS = {}


def capabilities():
    available = bool(shutil.which(os.environ.get('FFMPEG', 'ffmpeg')))
    return {'supported': available, 'message': 'Local four-second motion export' if available else 'Install FFmpeg to enable local motion export.',
            'durationSeconds': 4, 'fps': 24, 'maxDimension': 1280, 'presets': ['reveal', 'orbit']}


def validate_reveal(contract):
    value = contract.get('reveal')
    if not isinstance(value, dict) or set(value) != {'version', 'preset', 'durationSeconds', 'fps'}:
        raise HTTPException(422, 'Motion requires the versioned reveal settings.')
    if type(value['version']) is not int or value['version'] != 1 or value['preset'] not in ('reveal', 'orbit') or type(value['durationSeconds']) is not int or value['durationSeconds'] != 4 or type(value['fps']) is not int or value['fps'] != 24:
        raise HTTPException(422, 'Choose a four-second, 24 fps Slow reveal or Small orbit preset.')
    output = contract['output']
    if any(output[key] < 64 or output[key] > 1280 or output[key] % 2 for key in ('width', 'height')):
        raise HTTPException(422, 'Motion dimensions must be even numbers from 64 to 1280.')
    if output.get('samples') != 64 or output.get('qualityTier') != 'final':
        raise HTTPException(422, 'Local motion export uses 64 samples per frame.')
    if contract['camera'].get('preserveFraming') is not True:
        raise HTTPException(422, 'Motion must preserve the composed camera.')


def _local(request):
    if not request.client or request.client.host not in ('127.0.0.1', '::1', 'localhost', 'testclient'):
        raise HTTPException(403, 'Motion jobs are available on the local renderer only.')


def _folder(identifier):
    if not re.fullmatch('[a-f0-9]{32}', identifier): raise HTTPException(404, 'Motion job not found.')
    folder = STORE / identifier
    if not (folder / 'status.json').is_file(): raise HTTPException(404, 'Motion job not found.')
    return folder


def read_status(folder):
    return json.loads((folder / 'status.json').read_text())


def save_status(folder, **changes):
    status = read_status(folder) if (folder / 'status.json').exists() else {}
    status.update(changes); status['updatedAt'] = datetime.now(timezone.utc).isoformat()
    path = folder / 'status.next'; path.write_text(json.dumps(status)); path.replace(folder / 'status.json')
    return status


def recover_store():
    STORE.mkdir(parents=True, exist_ok=True)
    for path in STORE.glob('*/status.json'):
        try:
            if read_status(path.parent)['status'] not in TERMINAL:
                save_status(path.parent, status='failed', message='The renderer restarted before this motion finished. Please try again.')
        except (ValueError, KeyError, OSError):
            continue


async def _process(command, folder, cancellation, api, on_poll=None):
    process = None; log_path = folder / ('encode.log' if on_poll is None else 'blender.log')
    try:
        with log_path.open('wb') as log:
            process = await asyncio.create_subprocess_exec(*command, stdout=log, stderr=log, cwd=str(api.LIVE_DIR), start_new_session=os.name == 'posix')
            started = time.monotonic()
            while process.returncode is None:
                if cancellation.is_set(): raise asyncio.CancelledError()
                if time.monotonic() - started > TIMEOUT: raise RuntimeError('Motion exceeded the local render time limit. Try a smaller output.')
                if on_poll: on_poll(log_path)
                try: await asyncio.wait_for(process.wait(), .25)
                except asyncio.TimeoutError: pass
        if on_poll: on_poll(log_path)
        if process.returncode:
            tail = log_path.read_text(errors='replace')[-2000:]
            print('[motion-renderer] ' + tail, file=sys.stderr)
            if 'motion path passes' in tail: raise RuntimeError('The motion path passes behind the model. Choose a clearer angle or Slow reveal.')
            raise RuntimeError('The motion renderer could not finish. Details are in its local log.')
    finally:
        if process and process.returncode is None: await asyncio.shield(api._stop_process(process))


async def run_job(identifier, folder, api):
    cancel = CANCELLATIONS[identifier]
    offset = 0; pending = ''
    def progress(path):
        nonlocal offset, pending
        with path.open('rb') as log:
            log.seek(offset); chunk = log.read(256 * 1024); offset = log.tell()
        lines = (pending + chunk.decode(errors='replace')).split('\n'); pending = lines.pop()[-4096:]
        for line in lines:
            match = re.search(r'SMARTINK_VIDEO_FRAME (\d+)/(\d+)', line)
            if match:
                frame, total = map(int, match.groups())
                if total == 96 and 0 <= frame <= total:
                    save_status(folder, status='rendering', frame=frame, message=f'Rendered frame {frame} of {total}')
    try:
        command = [api.BLENDER, '--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', str(ROOT / 'smartink-live/revealRender.py'), '--', str(folder / 'contract.json')]
        await _process(command, folder, cancel, api, progress)
        frames = sorted((folder / 'frames').glob('frame-*.png'))
        if len(frames) != 96: raise RuntimeError('The motion render did not produce all 96 frames.')
        for path in frames:
            if cancel.is_set(): raise asyncio.CancelledError()
            await asyncio.to_thread(lambda p=path: api.validate_png(p.read_bytes()))
        save_status(folder, status='encoding', frame=96, message='Preparing your MP4')
        command = [os.environ.get('FFMPEG', 'ffmpeg'), '-nostdin', '-y', '-framerate', '24', '-i', str(folder / 'frames/frame-%04d.png'), '-frames:v', '96', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(folder / 'output.mp4')]
        await _process(command, folder, cancel, api)
        output = folder / 'output.mp4'
        if not output.exists() or output.stat().st_size < 24 or output.stat().st_size > 256 * 1024 * 1024 or output.read_bytes()[4:8] != b'ftyp':
            raise RuntimeError('Encoding did not produce a valid MP4.')
        save_status(folder, status='complete', frame=96, message='Your motion is ready', downloadUrl=f'/video-jobs/{identifier}/output')
        shutil.rmtree(folder / 'frames', ignore_errors=True)
    except asyncio.CancelledError:
        save_status(folder, status='cancelled', message='Motion cancelled')
    except Exception as exc:
        save_status(folder, status='failed', message=str(exc))
    finally:
        # Preserve output/status, not dozens of partial frame files or uploaded art.
        shutil.rmtree(folder / 'frames', ignore_errors=True)
        for name in ('ink.png', 'contract.json'):
            (folder / name).unlink(missing_ok=True)
        api._active_renders -= 1
        TASKS.pop(identifier, None); CANCELLATIONS.pop(identifier, None)


def install_video_routes(app, api):
    @app.on_event('startup')
    async def startup(): recover_store()

    @app.on_event('shutdown')
    async def shutdown():
        for cancellation in CANCELLATIONS.values(): cancellation.set()
        if TASKS: await asyncio.gather(*list(TASKS.values()), return_exceptions=True)

    @app.post('/video-jobs', status_code=202)
    async def submit(request: Request, contract: UploadFile = File(...), ink_layer: UploadFile = File(...)):
        _local(request)
        _, ink, parsed = await api._read_shot_uploads(contract, ink_layer)
        validate_reveal(parsed)
        if not capabilities()['supported'] or not api.readiness()['ready']: raise HTTPException(503, 'The local motion renderer is not ready.')
        if api._active_renders >= api.MAX_CONCURRENT_RENDERS or TASKS: raise HTTPException(429, 'The local renderer is busy. Wait or cancel its current render.')
        STORE.mkdir(parents=True, exist_ok=True)
        if sum(p.stat().st_size for p in STORE.glob('*/*') if p.is_file()) > 2 * 1024**3:
            raise HTTPException(507, 'The local motion cache is full. Save and remove old local motion files before rendering more.')
        identifier = uuid.uuid4().hex; folder = STORE / identifier; folder.mkdir()
        api.dump_to_dir(folder, json.dumps(parsed).encode(), ink)
        status = save_status(folder, id=identifier, status='preparing', frame=0, totalFrames=96, preset=parsed['reveal']['preset'], createdAt=datetime.now(timezone.utc).isoformat(), message='Preparing the scene')
        api._active_renders += 1; CANCELLATIONS[identifier] = asyncio.Event()
        TASKS[identifier] = asyncio.create_task(run_job(identifier, folder, api))
        return JSONResponse(status, status_code=202)

    @app.get('/video-jobs/{identifier}')
    async def status(identifier: str, request: Request):
        _local(request); return JSONResponse(read_status(_folder(identifier)), headers={'Cache-Control': 'no-store'})

    @app.post('/video-jobs/{identifier}/cancel')
    async def cancel(identifier: str, request: Request):
        _local(request); folder = _folder(identifier)
        if identifier in CANCELLATIONS:
            CANCELLATIONS[identifier].set()
            await asyncio.shield(TASKS[identifier])
        return read_status(folder)

    @app.get('/video-jobs/{identifier}/output')
    async def output(identifier: str, request: Request):
        _local(request); folder = _folder(identifier)
        if read_status(folder)['status'] != 'complete' or not (folder / 'output.mp4').is_file(): raise HTTPException(409, 'This motion is not ready.')
        return FileResponse(folder / 'output.mp4', media_type='video/mp4', filename='smart-ink-motion.mp4')
