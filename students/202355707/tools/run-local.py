"""웹페이지와 API를 같은 주소에서 미리 봅니다. 로컬 데이터는 .local/에 보관합니다."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
local = root / '.local'
local.mkdir(exist_ok=True)
token = local / 'admin-token'
if not token.exists():
    token.write_text('arm-lab-demo-202355707', encoding='utf-8')
print('http://127.0.0.1:8765 에서 확인하세요. 종료: Ctrl+C', flush=True)
subprocess.run([sys.executable, '-B', str(root/'backend/server.py'), '--host', '127.0.0.1', '--port', '8765', '--data-dir', str(local), '--token-file', str(token), '--web-root', str(root/'web')], check=True)
