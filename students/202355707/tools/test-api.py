"""실제 HTTP로 저장, 인증, 재시작 후 유지 여부를 검증합니다. 클러스터는 변경하지 않습니다."""
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('arm_api', root/'backend/server.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class APITest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=root / 'tools')
        self.data = Path(self.temp.name)
        self.token = self.data/'token'
        self.token.write_text('test-admin', encoding='utf-8')
        self.start()

    def start(self):
        self.server = api.make_server('127.0.0.1', 0, api.Store(self.data/'poses.sqlite3'), self.token)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def tearDown(self):
        self.stop()
        self.temp.cleanup()

    def call(self, method='GET', path='/api/poses', data=None, token=None):
        headers = {'Content-Type': 'application/json'}
        if token is not None:
            headers['Authorization'] = 'Bearer ' + token
        req = Request(self.base+path, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method)
        try:
            with urlopen(req, timeout=5) as response:
                return response.status, json.load(response)
        except HTTPError as response:
            return response.code, json.load(response)

    def test_save_restart_auth_and_rotation(self):
        self.assertEqual(self.call(path='/api/health')[0], 200)
        status, item = self.call('POST', data={'name': '아리 <test>', 'angles': [25, 60, 75]})
        self.assertEqual(status, 201)
        self.stop()
        self.start()
        self.assertEqual(self.call()[1]['poses'], [item])
        path = '/api/poses/' + item['id']
        self.assertEqual(self.call('DELETE', path)[0], 401)
        self.assertEqual(self.call('DELETE', path, token='wrong')[0], 401)
        self.assertEqual(len(self.call()[1]['poses']), 1)
        self.token.write_text('rotated-admin', encoding='utf-8')
        self.assertEqual(self.call('DELETE', path, token='test-admin')[0], 401)
        self.assertEqual(self.call('DELETE', path, token='rotated-admin')[0], 200)
        self.assertEqual(self.call()[1]['poses'], [])

    def test_invalid_and_concurrent_saves(self):
        for data in [[], {}, {'name': '', 'angles': [0, 60, 75]}, {'name': 'x'*41, 'angles': [0, 60, 75]}, {'name': 'x', 'angles': [True, 60, 75]}, {'name': 'x', 'angles': [181, 60, 75]}, {'name': 'x', 'angles': [float('nan'), 60, 75]}]:
            self.assertEqual(self.call('POST', data=data)[0], 400)
        def save(i):
            return self.call('POST', data={'name': f'pose {i}', 'angles': [25, 60, 75]})[0]
        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertTrue(all(status == 201 for status in pool.map(save, range(12))))
        self.assertEqual(len(self.call()[1]['poses']), 12)
        self.assertNotIn('test-admin', json.dumps(self.call()[1]))

    def test_capacity_and_missing_pose(self):
        store = api.Store(self.data/'poses.sqlite3')
        for i in range(100):
            store.add(str(i), [25, 60, 75])
        self.assertEqual(self.call('POST', data={'name':'full', 'angles':[25,60,75]})[0], 409)
        self.assertEqual(self.call('DELETE', '/api/poses/'+'0'*32, token='test-admin')[0], 404)


if __name__ == '__main__':
    unittest.main(verbosity=2)
