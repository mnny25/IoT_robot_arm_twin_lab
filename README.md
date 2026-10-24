# IoT Robot Arm Twin Lab

지능형 IoT 플랫폼 과제: **ARM / LAB - 로봇암 디지털 트윈 체험 웹서비스**

브라우저에서 3자유도 로봇암의 관절과 목표 위치를 조작하고 정기구학·역기구학을 체험합니다. 웹서비스는 Red Hat OpenShift의 Deployment·Service·Route와 두 ConfigMap으로 구성합니다.

## 제출물

| 학번 | 소개·아키텍처·배포 결과 | 채점용 YAML |
| --- | --- | --- |
| 202355707 | [과제 README](students/202355707/README.md) | [k8s/](students/202355707/k8s/) |

기구학은 자체 JavaScript 모델로 계산합니다. MuJoCo 엔진이나 실제 로봇·센서 연동은 포함하지 않습니다.

## 로컬 실행

```bash
python -m http.server 8765 --bind 127.0.0.1 --directory students/202355707/web
```

브라우저에서 <http://127.0.0.1:8765>에 접속합니다.

## OpenShift 배포

본인 Developer Sandbox에 `oc login`한 뒤 아래 명령을 실행합니다.

```bash
cd students/202355707
oc project
oc apply -f k8s/
oc rollout status deployment/arm-lab-202355707 --timeout=180s
oc get route arm-lab-202355707
```

검증 상태와 추가 Object 활용 내역, 증빙은 [과제 README](students/202355707/README.md)에 정리했습니다.
