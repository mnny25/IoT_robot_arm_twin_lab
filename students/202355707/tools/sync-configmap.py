"""화면 파일과 모델 설정을 별도 ConfigMap으로 생성합니다. 표준 라이브러리만 사용합니다."""
from pathlib import Path
from hashlib import sha256
import re

root = Path(__file__).resolve().parents[1]
groups = [
    ("configmap.yaml", "content", ["index.html", "style.css", "playground.css", "app.js", "nginx.conf"]),
    ("model-configmap.yaml", "model", ["config.js"]),
]
outputs = {}
for filename, suffix, files in groups:
    header = f"""# tools/sync-configmap.py로 생성. 원본은 web/에서 수정하세요.
apiVersion: v1
kind: ConfigMap
metadata:
  name: arm-lab-202355707-{suffix}
  labels:
    app: arm-lab-202355707
    app.kubernetes.io/name: arm-lab
    app.kubernetes.io/instance: arm-lab-202355707
    app.kubernetes.io/component: web
    app.kubernetes.io/part-of: robot-arm-twin
data:
"""
    parts = [header]
    for name in files:
        content = (root / "web" / name).read_text(encoding="utf-8")
        parts.append(f"  {name}: |\n")
        parts.extend("    " + line + "\n" for line in content.splitlines())
    output = "".join(parts)
    if len(output.encode("utf-8")) >= 950_000:
        raise ValueError("ConfigMap 크기가 너무 큽니다. 큰 미디어 파일은 별도로 제공하세요.")
    outputs[filename] = output

# 두 해시를 먼저 확인하여 Deployment 형식이 달라졌다면 파일 변경 전 중단합니다.
deployment_path = root / "k8s" / "deployment.yaml"
deployment = deployment_path.read_text(encoding="utf-8")
for filename, suffix, _ in groups:
    checksum = sha256(outputs[filename].encode("utf-8")).hexdigest()
    pattern = rf'(?m)^        checksum/{suffix}: "[^"\n]*"$'
    deployment, count = re.subn(pattern, f'        checksum/{suffix}: "{checksum}"', deployment)
    if count != 1:
        raise ValueError(f"Deployment의 checksum/{suffix} 항목을 정확히 한 개 찾을 수 없습니다.")

for filename, output in outputs.items():
    (root / "k8s" / filename).write_text(output, encoding="utf-8", newline="\n")
    print(f"{filename} synchronized: {len(output.encode('utf-8')):,} bytes")
deployment_path.write_text(deployment, encoding="utf-8", newline="\n")
print("deployment.yaml content/model checksums synchronized")
