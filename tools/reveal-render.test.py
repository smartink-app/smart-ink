"""Real HTTP motion lifecycle tests with isolated fake Blender and real FFmpeg."""
import copy
import http.client
import importlib.util
import json
import os
from pathlib import Path
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('render_tests', ROOT / 'tools/render-server.test.py')
helpers = importlib.util.module_from_spec(spec); spec.loader.exec_module(helpers)
from server.video_jobs import validate_reveal, recover_store
from fastapi import HTTPException


def shot(width=64):
    value = helpers.contract(width)
    value['camera']['preserveFraming'] = True
    value['output'].update(qualityTier='final', samples=64)
    value['reveal'] = {'version': 1, 'preset': 'reveal', 'durationSeconds': 4, 'fps': 24}
    return value


class MotionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='smartink-motion-test-'); cls.root = Path(cls.temp.name)
        for asset in ('sceneImporter.py', 'body_male_realistic.glb', 'body_female_realistic.glb'): (cls.root / asset).touch()
        (cls.root / 'fixture.png').write_bytes(helpers.png(64, 64))
        script = cls.root / 'fake.py'
        script.write_text('''import json, pathlib, signal, sys, time
p = pathlib.Path(sys.argv[sys.argv.index('--') + 1]); value = json.loads(p.read_text())
if value['output']['width'] == 66: time.sleep(30)
out = p.parent / 'frames'; out.mkdir()
fixture = pathlib.Path(__file__).parent / 'fixture.png'
for i in range(1,97):
 (out / ('frame-%04d.png' % i)).write_bytes(fixture.read_bytes())
 print('SMARTINK_VIDEO_FRAME %d/96' % i, flush=True)
''')
        fake = cls.root / 'blender'; fake.write_text('#!/bin/sh\nexec ' + shlex.quote(sys.executable) + ' ' + shlex.quote(str(script)) + ' "$@"\n'); fake.chmod(0o755)
        with socket.socket() as sock: sock.bind(('127.0.0.1', 0)); cls.port = sock.getsockname()[1]
        cls.env = {**os.environ, 'BLENDER': str(fake), 'SMARTINK_LIVE_DIR': str(cls.root), 'SMARTINK_VIDEO_DIR': str(cls.root / 'jobs'), 'PYTHONDONTWRITEBYTECODE': '1'}
        cls.log = (cls.root / 'server.log').open('w+')
        cls.start()

    @classmethod
    def start(cls):
        cls.server = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'server.app:app', '--app-dir', str(ROOT), '--host', '127.0.0.1', '--port', str(cls.port)], env=cls.env, stdout=cls.log, stderr=cls.log)
        for _ in range(100):
            try:
                if cls.request('/health')[0] == 200: return
            except OSError: pass
            time.sleep(.05)
        cls.log.seek(0); raise RuntimeError(cls.log.read())

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate(); cls.server.wait(timeout=10); cls.log.close(); cls.temp.cleanup()

    @classmethod
    def request(cls, path, value=None, method='GET'):
        connection = http.client.HTTPConnection('127.0.0.1', cls.port, timeout=10)
        try:
            if value is None: connection.request(method, path)
            else:
                body, content_type = helpers.multipart(value); connection.request('POST', path, body, {'Content-Type': content_type})
            response = connection.getresponse(); return response.status, response.read()
        finally: connection.close()

    def await_terminal(self, identifier):
        for _ in range(120):
            state = json.loads(self.request('/video-jobs/' + identifier)[1])
            if state['status'] in ('failed', 'complete', 'cancelled'): return state
            time.sleep(.05)
        self.fail('Motion did not finish')

    def test_01_bounds_and_still_rejection(self):
        validate_reveal(shot())
        for key, value in [('fps', 30), ('durationSeconds', 10), ('version', True), ('preset', 'free')]:
            invalid = shot(); invalid['reveal'][key] = value
            self.assertEqual(self.request('/video-jobs', invalid)[0], 422)
        invalid = shot(); invalid['output']['width'] = 2048
        self.assertEqual(self.request('/video-jobs', invalid)[0], 422)
        self.assertEqual(self.request('/render-v2', shot())[0], 422)
        self.assertEqual(self.request('/video-jobs/bad-id')[0], 404)

    def test_02_complete_and_reload(self):
        code, data = self.request('/video-jobs', shot()); self.assertEqual(code, 202, data)
        identifier = json.loads(data)['id']; state = self.await_terminal(identifier)
        self.assertEqual(state['status'], 'complete', state); self.assertEqual(state['frame'], 96)
        code, video = self.request('/video-jobs/' + identifier + '/output'); self.assertEqual(code, 200); self.assertEqual(video[4:8], b'ftyp')
        self.server.terminate(); self.server.wait(timeout=10); self.start()
        self.assertEqual(json.loads(self.request('/video-jobs/' + identifier)[1])['status'], 'complete')

    def test_03_cancel_and_capacity(self):
        code, data = self.request('/video-jobs', shot(66)); self.assertEqual(code, 202)
        identifier = json.loads(data)['id']
        self.assertEqual(self.request('/video-jobs', shot())[0], 429)
        code, data = self.request('/video-jobs/' + identifier + '/cancel', method='POST')
        self.assertEqual(code, 200); self.assertEqual(json.loads(data)['status'], 'cancelled')
        self.assertEqual(self.request('/video-jobs/' + identifier + '/output')[0], 409)
        self.assertEqual(json.loads(self.request('/health')[1])['active_renders'], 0)

    def test_04_restart_marks_interrupted(self):
        folder = self.root / 'jobs' / ('a' * 32); folder.mkdir()
        (folder / 'status.json').write_text(json.dumps({'status': 'rendering', 'id': 'a' * 32}))
        self.server.terminate(); self.server.wait(timeout=10); self.start()
        self.assertEqual(json.loads(self.request('/video-jobs/' + 'a' * 32)[1])['status'], 'failed')


if __name__ == '__main__': unittest.main(verbosity=2)
