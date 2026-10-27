# IoT Robot Arm Twin Lab

지능형 IoT 플랫폼 과제: **ARM / LAB - 로봇암 디지털 트윈 체험 웹서비스**

브라우저에서 3자유도 로봇암의 정기구학과 역기구학을 체험하고 원하는 자세를 서버 보관함에 저장합니다. ConfigMap, Secret, PVC를 활용합니다. 기구학은 자체 JavaScript 모델이며 MuJoCo나 실제 로봇과 연결하지 않습니다.

| 학번 | 소개와 배포 증빙 | 채점용 YAML |
| --- | --- | --- |
| 202355707 | [과제 README](students/202355707/README.md) | [k8s/](students/202355707/k8s/) |

## 로컬 통합 실행

```bash
cd students/202355707
python tools/run-local.py
```

<http://127.0.0.1:8765>에 접속합니다. 저장 API와 웹페이지가 함께 실행됩니다.

## OpenShift 배포

본인 Sandbox 프로젝트에서 실행합니다.

```bash
cd students/202355707
oc project
oc apply -f k8s/
oc rollout status deployment/arm-lab-202355707 --timeout=300s
oc get pods,deployments,services,routes,configmaps,secrets,pvc -l app=arm-lab-202355707
oc get route arm-lab-202355707
```

Pod 2/2 Running, PVC Bound와 실제 Route 화면을 확인합니다. 기본 StorageClass와 사용 가능한 스토리지 할당량이 필요합니다. 삭제 인증은 공개된 과제 데모 키를 사용합니다. 서비스 구조, 배포 결과와 추가 Object 검증 방법은 [과제 README](students/202355707/README.md)에 정리했습니다.
