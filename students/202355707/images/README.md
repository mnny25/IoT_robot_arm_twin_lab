# 배포 증빙 이미지

2026-10-28 OpenShift에서 수행한 검증 기록입니다. 전체 삭제 후 재배포 결과와 그 전에 수행한 PVC 유지 시험을 구분했습니다.

## PVC 유지 시험과 전체 재배포

| 파일 | 촬영 시각 | 사진에서 확인할 수 있는 내용 |
| --- | --- | --- |
| [pvc-before-restart.png](pvc-before-restart.png) | 16:41:13 | ‘PVC 유지 확인’ 자세 저장. J1 20.4°, J2 59.3°, J3 1.7° |
| [pvc-restart.png](pvc-restart.png) | 16:43:40 | rollout restart 성공, 새 Pod 2/2 Running, 교체 전후 동일 PVC 볼륨과 Bound 상태 |
| [pvc-after-restart.png](pvc-after-restart.png) | 16:45:59 | 같은 이름·각도의 자세 유지, 불러오기 메시지와 목표 도달 화면 |
| [redeploy-commands.png](redeploy-commands.png) | 16:48:32 | oc delete -f k8s/ --wait=true 후 oc apply -f k8s/ 실행. 리소스 8개 deleted / created |
| [redeploy-resources.png](redeploy-resources.png) | 16:51:11 | 재배포 후 Pod 2/2 Running, Deployment 1/1, ConfigMap 3개, Secret, PVC Bound / 1Gi / RWO / gp3와 Route 설정 |

시각은 원본 스크린샷 파일명 기준입니다. 원본 이미지를 편집하지 않고 내용을 나타내는 이름으로 복사했습니다. PVC 유지 시험은 전체 삭제 전에 수행했으며, 재배포 단계에서는 PVC도 삭제·재생성했습니다. 재배포 이후의 브라우저 화면과 실제 Route에서의 삭제 인증 결과는 이 캡처 묶음에 포함되어 있지 않습니다.

## 초기 배포 기록

| 파일 | 사진에서 확인할 수 있는 내용 |
| --- | --- |
| [resources.png](resources.png) | 전체 삭제 전 과제 리소스 조회. Pod 2/2 Running, Deployment 1/1, ConfigMap 3개, Secret과 PVC Bound |
| [browser.png](browser.png) | 전체 삭제 전 실제 Route의 로봇암 체험 화면 |
| [topology.png](topology.png) | robot-arm-twin 애플리케이션의 Deployment와 Pod 1개 |
| [route.png](route.png) | 초기 Route host, 대상 Service와 edge/Redirect 설정 |
| [ocgetall_1.png](ocgetall_1.png) | 초기 프로젝트 전체의 Pod, Service와 Deployment 목록 |
| [ocgetall_2.png](ocgetall_2.png) | 초기 ReplicaSet과 실습용 BuildConfig, Build 목록 |
| [ocgetall_3.png](ocgetall_3.png) | 초기 ImageStream과 Route 목록, 추가 API 조회 권한 오류 |

`ocgetall_1.png`부터 `ocgetall_3.png`까지는 하나의 `oc get all` 출력을 나눠 찍은 사진입니다. 마지막 Forbidden은 추가 API 목록 조회 권한 오류입니다. 최신 재배포 상태는 `redeploy-resources.png`를 기준으로 확인합니다.
