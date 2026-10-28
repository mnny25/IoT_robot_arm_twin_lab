# 배포 증빙 이미지

2026-10-28 OpenShift에서 확인한 배포 상태와 실제 웹사이트 화면입니다.

| 파일 | 사진에서 확인할 수 있는 내용 |
| --- | --- |
| [resources.png](resources.png) | 과제 리소스만 조회한 결과. Pod 2/2 Running, 재시작 0회, Deployment 1/1, Service 8080/TCP, Route, ConfigMap 3개, Secret과 PVC Bound / 1Gi / RWO |
| [browser.png](browser.png) | 실제 Route 주소에서 표시된 로봇암 체험 화면 |
| [topology.png](topology.png) | robot-arm-twin 애플리케이션의 Deployment와 Pod 1개 |
| [route.png](route.png) | Route host, 대상 Service와 edge/Redirect 설정 |
| [ocgetall_1.png](ocgetall_1.png) | 프로젝트 전체의 Pod, Service와 Deployment 목록. 과제 Pod 2/2 Running, Deployment 1/1 |
| [ocgetall_2.png](ocgetall_2.png) | ReplicaSet과 실습용 BuildConfig, Build 목록. 과제의 현재 ReplicaSet은 준비된 Pod 1개 |
| [ocgetall_3.png](ocgetall_3.png) | ImageStream과 Route 목록, applications.app.k8s.io 조회 권한 오류 |

`ocgetall_1.png`부터 `ocgetall_3.png`까지는 하나의 `oc get all` 출력을 나눠 찍은 사진입니다. 실습용 리소스도 함께 표시됩니다. 마지막 Forbidden은 추가 API의 목록 조회 권한 오류이며 과제 리소스 상태는 `resources.png`에서 확인할 수 있습니다.

사진으로 확인되는 범위는 리소스 상태, Route 연결과 웹페이지 표시입니다. 자세 보관함의 저장과 불러오기, Secret 인증과 Pod 교체 후 데이터 유지 시험 결과는 이 사진에 포함하지 않습니다.
