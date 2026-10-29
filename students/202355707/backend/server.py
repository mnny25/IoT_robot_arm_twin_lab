"""자세 보관 API. 표준 라이브러리와 SQLite만 사용함"""
import argparse
from contextlib import contextmanager
import hmac
import json
import logging
import math
import os
from pathlib import Path
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import uuid
from datetime import datetime, timezone


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS poses (id TEXT PRIMARY KEY, name TEXT NOT NULL, angles TEXT NOT NULL, created_at TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def list(self):
        with self.connect() as db:
            return [dict(row, angles=json.loads(row['angles'])) for row in db.execute('SELECT * FROM poses ORDER BY created_at DESC, id')]

    def add(self, name, angles):
        item = dict(id=uuid.uuid4().hex, name=name, angles=angles, created_at=datetime.now(timezone.utc).isoformat())
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT COUNT(*) FROM poses').fetchone()[0] >= 100:
                raise OverflowError('보관함이 가득 찼습니다. 관리자에게 삭제를 요청하세요.')
            db.execute('INSERT INTO poses VALUES (?, ?, ?, ?)', (item['id'], name, json.dumps(angles), item['created_at']))
        return item

    def delete(self, pose_id):
        with self.connect() as db:
            return db.execute('DELETE FROM poses WHERE id = ?', (pose_id,)).rowcount > 0


def make_server(host, port, store, token_file, web_root=None):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'ArmLabAPI'

        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def reply(self, status, body):
            data = json.dumps(body, ensure_ascii=False, allow_nan=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            try:
                path = urlsplit(self.path).path
                if path == '/healthz':
                    self.reply(200, {'status': 'ok'})
                elif path == '/api/health':
                    with store.connect() as db:
                        db.execute('SELECT COUNT(*) FROM poses').fetchone()
                    self.reply(200, {'status': 'ok'})
                elif path == '/api/poses':
                    self.reply(200, {'poses': store.list()})
                elif web_root and path in ('/', '/index.html', '/style.css', '/playground.css', '/app.js', '/config.js', '/library.css', '/library.js'):
                    name = 'index.html' if path == '/' else path[1:]
                    data = (Path(web_root) / name).read_bytes()
                    mime = {'html': 'text/html', 'css': 'text/css', 'js': 'application/javascript'}[name.rsplit('.', 1)[1]]
                    self.send_response(200)
                    self.send_header('Content-Type', mime + '; charset=utf-8')
                    self.send_header('Content-Length', str(len(data)))
                    self.send_header('Cache-Control', 'no-cache')
                    self.end_headers()
                    self.wfile.write(data)
                else:
                    self.reply(404, {'error': '요청한 경로가 없습니다.'})
            except (OSError, sqlite3.Error):
                logging.exception('GET failed')
                self.reply(503, {'error': '저장소를 확인할 수 없습니다. 잠시 후 다시 시도하세요.'})

        def do_POST(self):
            if self.path != '/api/poses':
                return self.reply(404, {'error': '요청한 경로가 없습니다.'})
            try:
                if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
                    return self.reply(415, {'error': 'JSON 형식으로 전송하세요.'})
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 4096:
                    return self.reply(413, {'error': '요청 크기를 확인하세요.'})
                item = json.loads(self.rfile.read(size))
                if not isinstance(item, dict):
                    raise ValueError()
                name, angles = item.get('name'), item.get('angles')
                if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40 or any(ord(c) < 32 for c in name):
                    raise ValueError()
                limits = [(-180, 180), (-20, 110), (0, 150)]
                if not isinstance(angles, list) or len(angles) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) or not lo <= v <= hi for v, (lo, hi) in zip(angles, limits)):
                    raise ValueError()
                self.reply(201, store.add(name.strip(), angles))
            except (ValueError, UnicodeError):
                self.reply(400, {'error': '이름은 1~40자, 관절 각도는 허용 범위의 숫자 3개로 입력하세요.'})
            except OverflowError as error:
                self.reply(409, {'error': str(error)})
            except (sqlite3.Error, OSError):
                logging.exception('Save failed')
                self.reply(503, {'error': '저장하지 못했습니다. 잠시 후 다시 시도하세요.'})

        def do_DELETE(self):
            match = re.fullmatch(r'/api/poses/([a-f0-9]{32})', self.path)
            if not match:
                return self.reply(404, {'error': '요청한 경로가 없습니다.'})
            try:
                token = Path(token_file).read_text(encoding='utf-8').strip()
                supplied = self.headers.get('Authorization', '')
                if not token or not hmac.compare_digest(supplied.encode(), ('Bearer ' + token).encode()):
                    return self.reply(401, {'error': '관리자 키가 올바르지 않습니다.'})
                if store.delete(match[1]):
                    self.reply(200, {'deleted': match[1]})
                else:
                    self.reply(404, {'error': '이미 삭제되었거나 존재하지 않는 자세입니다.'})
            except (OSError, sqlite3.Error):
                logging.exception('Delete failed')
                self.reply(503, {'error': '삭제하지 못했습니다. 관리자 설정과 저장소를 확인하세요.'})

    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8081)
    parser.add_argument('--data-dir', default=os.getenv('DATA_DIR', '/data'))
    parser.add_argument('--token-file', default=os.getenv('ADMIN_TOKEN_FILE', '/etc/arm-lab-auth/admin-token'))
    parser.add_argument('--web-root', help='로컬 통합 미리보기용 웹 폴더. 배포에서는 Nginx를 사용합니다.')
    args = parser.parse_args()
    if not Path(args.token_file).read_text(encoding='utf-8').strip():
        parser.error('관리자 키 파일이 비어 있습니다.')
    make_server(args.host, args.port, Store(Path(args.data_dir) / 'poses.sqlite3'), args.token_file, args.web_root).serve_forever()
