"""제출 YAML의 연결·포함 파일·체크섬을 오프라인 점검합니다.

Python 3와 oc 또는 kubectl을 사용합니다. 클러스터 접속이나 리소스 변경은 하지 않습니다.
Kubernetes의 YAML 파서로 읽지만 API 서버 스키마 검증·실제 배포를 대신하지 않습니다.
"""
from hashlib import sha256
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
cli = shutil.which("oc") or shutil.which("kubectl")
if not cli:
    sys.exit("oc 또는 kubectl을 PATH에 추가한 뒤 다시 실행하세요.")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load(path):
    result = subprocess.run(
        [cli, "annotate", "--local", "-f", str(path), "-o", "json", "arm-lab-review=local"],
        encoding="utf-8", capture_output=True, check=True,
    )
    return json.loads(result.stdout)


def check():
    paths = sorted((root / "k8s").glob("*.yaml"))
    resources = [load(path) for path in paths]
    require(len(resources) == 5, "기대하는 리소스는 Deployment·Service·Route·ConfigMap 2개의 총 5개입니다.")
    by_kind = {}
    for resource in resources:
        by_kind.setdefault(resource["kind"], []).append(resource)
        meta = resource["metadata"]
        require(re.fullmatch(r"[a-z0-9]([-a-z0-9]*[a-z0-9])?", meta["name"]), "리소스 이름 형식 오류")
        for field in ["namespace", "uid", "resourceVersion", "creationTimestamp", "managedFields", "generation"]:
            require(field not in meta, f"자동 생성 필드가 있습니다: {meta['name']}.{field}")
        require("status" not in resource, "status 필드는 제출 YAML에서 제거하세요.")
        labels = meta["labels"]
        require(labels.get("app") == "arm-lab-202355707", "app 라벨 불일치")
        require(labels.get("app.kubernetes.io/instance") == "arm-lab-202355707", "공통 instance 라벨 불일치")
        require(labels.get("app.kubernetes.io/name") == "arm-lab", "공통 name 라벨 불일치")
        require(labels.get("app.kubernetes.io/part-of") == "robot-arm-twin", "공통 part-of 라벨 불일치")

    require({k: len(v) for k, v in by_kind.items()} == {"ConfigMap": 2, "Deployment": 1, "Route": 1, "Service": 1}, "리소스 종류/개수 불일치")
    dep, svc, route = (by_kind[k][0] for k in ["Deployment", "Service", "Route"])
    template = dep["spec"]["template"]
    pod_labels = template["metadata"]["labels"]
    for selector in [dep["spec"]["selector"]["matchLabels"], svc["spec"]["selector"]]:
        require(all(pod_labels.get(k) == v for k, v in selector.items()), "Deployment/Service selector와 Pod 라벨 불일치")
    container = template["spec"]["containers"][0]
    port = container["ports"][0]
    require(port == {"name": "http", "containerPort": 8080}, "컨테이너 포트 불일치")
    require(svc["spec"]["ports"][0]["targetPort"] == port["name"], "Service targetPort 불일치")
    require(route["spec"]["to"]["name"] == svc["metadata"]["name"], "Route 대상 Service 불일치")
    require(route["spec"]["port"]["targetPort"] == svc["spec"]["ports"][0]["name"], "Route 포트 불일치")
    require(route["spec"]["tls"] == {"termination": "edge", "insecureEdgeTerminationPolicy": "Redirect"}, "Route TLS 설정 불일치")
    require("host" not in route["spec"], "Route host는 고정하지 않습니다.")
    require("clusterIP" not in svc["spec"], "Service clusterIP는 고정하지 않습니다.")
    require("@sha256:" in container["image"], "이미지가 digest로 고정되어 있지 않습니다.")
    require(container["resources"] == {"requests": {"cpu": "50m", "memory": "64Mi"}, "limits": {"cpu": "250m", "memory": "128Mi"}}, "자원 설정 불일치")
    require(template["spec"]["securityContext"]["runAsNonRoot"], "비루트 실행 설정 누락")
    require("runAsUser" not in template["spec"]["securityContext"], "OpenShift용 고정 UID를 지정하지 않습니다.")
    require(not container["securityContext"]["allowPrivilegeEscalation"], "권한 상승 금지 설정 누락")
    require(container["securityContext"]["readOnlyRootFilesystem"], "읽기 전용 루트 설정 누락")
    require(container["securityContext"]["capabilities"]["drop"] == ["ALL"], "capabilities 제거 설정 누락")
    for probe, path in [("startupProbe", "/healthz"), ("readinessProbe", "/index.html"), ("livenessProbe", "/healthz")]:
        require(container[probe]["httpGet"] == {"path": path, "port": "http"}, f"{probe} 경로/포트 불일치")
        require(container[probe]["timeoutSeconds"] == 2, f"{probe} timeout 확인 필요")
    require(dep["spec"]["strategy"]["rollingUpdate"] == {"maxSurge": 1, "maxUnavailable": 0}, "롤링 업데이트 설정 불일치")
    maps = {r["metadata"]["name"]: r for r in by_kind["ConfigMap"]}
    volumes = {v["name"]: v for v in template["spec"]["volumes"]}
    mounted_paths = set()
    for source in volumes["web-files"]["projected"]["sources"]:
        cm = source["configMap"]
        require(cm["name"] in maps, "참조 ConfigMap 없음")
        for item in cm["items"]:
            require(item["key"] in maps[cm["name"]]["data"], "ConfigMap에 필요한 key 없음")
            mounted_paths.add(item["path"])
    require(mounted_paths == {"index.html", "style.css", "playground.css", "app.js", "config.js"}, "웹 파일 마운트 목록 불일치")
    nginx_ref = volumes["nginx-config"]["configMap"]
    nginx_conf = maps[nginx_ref["name"]]["data"]["nginx.conf"]
    require("listen 8080;" in nginx_conf and "root /opt/app-root/src;" in nginx_conf, "Nginx 포트/웹 루트 불일치")
    require("location = /healthz" in nginx_conf, "생존 확인 경로 없음")
    require(volumes["runtime"]["emptyDir"]["sizeLimit"] == "32Mi", "임시 볼륨 크기 설정 확인 필요")
    for filename, suffix in [("configmap.yaml", "content"), ("model-configmap.yaml", "model")]:
        cm = maps[f"arm-lab-202355707-{suffix}"]
        for name, content in cm["data"].items():
            require(content == (root / "web" / name).read_text(encoding="utf-8"), f"원본과 ConfigMap 불일치: {name}")
        digest = sha256((root / "k8s" / filename).read_bytes()).hexdigest()
        require(template["metadata"]["annotations"][f"checksum/{suffix}"] == digest, f"{suffix} 체크섬 불일치. sync-configmap.py를 실행하세요.")
    print("PASS: YAML 5개 / 리소스 연결 / 자원·Probe·보안 / 전체 웹 파일 / ConfigMap 체크섬")
    print("로컬 정적 점검입니다. Sandbox 배포 및 삭제 후 재배포 검증은 별도 수행하세요.")


if __name__ == "__main__":
    try:
        check()
    except (ValueError, KeyError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        sys.exit(f"FAIL: {error}")
