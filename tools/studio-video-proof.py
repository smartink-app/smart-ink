"""Exercise the real local API/Blender/FFmpeg pipeline on an isolated loopback port.

python tools/studio-video-proof.py /absolute/path/to/proof/contract.json
Writes a four-second MP4 and verification JSON beside the supplied contract.
"""
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[1]
path = Path(sys.argv[1]).resolve(); folder = path.parent
with socket.socket() as sock: sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
environment = {**os.environ, 'SMARTINK_VIDEO_DIR': str(folder / 'api-jobs'), 'SMARTINK_LIVE_DIR': str(root / 'smartink-live'), 'PYTHONDONTWRITEBYTECODE': '1'}
log = (folder / 'api-proof.log').open('w')
process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'server.app:app', '--app-dir', str(root), '--host', '127.0.0.1', '--port', str(port)], env=environment, stdout=log, stderr=log)
def request(route, method='GET', body=None, headers=None):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=20)
    try:
        connection.request(method, route, body, headers or {}); response = connection.getresponse(); result = response.read()
        if response.status >= 400: raise RuntimeError(result.decode())
        return result
    finally: connection.close()
try:
    for _ in range(100):
        try: health = json.loads(request('/health')); break
        except OSError: time.sleep(.1)
    else: raise RuntimeError('Proof server did not start')
    assert health['ready'] and health['capabilities']['video']['supported'], health
    boundary = 'StudioProofBoundary'
    chunks = []
    for name, filename, content in [('contract', 'contract.json', path.read_bytes()), ('ink_layer', 'ink.png', (folder / 'ink.png').read_bytes())]:
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n\r\n'.encode() + content + b'\r\n')
    body = b''.join(chunks) + f'--{boundary}--\r\n'.encode()
    state = json.loads(request('/video-jobs', 'POST', body, {'Content-Type': 'multipart/form-data; boundary=' + boundary}))
    identifier = state['id']; started = time.monotonic(); previous = None
    while state['status'] not in ('complete', 'failed', 'cancelled'):
        if time.monotonic() - started > 600: raise RuntimeError('Proof timed out')
        marker = (state['status'], state['frame'])
        if marker != previous: print(state['message'], flush=True); previous = marker
        time.sleep(.5); state = json.loads(request('/video-jobs/' + identifier))
    assert state['status'] == 'complete', state
    output = folder / 'reveal-four-seconds.mp4'; output.write_bytes(request('/video-jobs/' + identifier + '/output'))
    report = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,width,height,nb_frames,r_frame_rate,duration', '-of', 'json', str(output)]))
    stream = report['streams'][0]
    assert stream['codec_name'] == 'h264' and stream['nb_frames'] == '96' and stream['r_frame_rate'] == '24/1' and float(stream['duration']) == 4, stream
    report.update(job=state, elapsedSeconds=round(time.monotonic() - started, 2), verifiedHttpPipeline=True)
    (folder / 'video-verification.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report), flush=True)
finally:
    process.terminate(); process.wait(timeout=15); log.close()
