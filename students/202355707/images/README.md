# 배포 증빙 이미지

2026-10-27에 촬영한 원본 캡처를 이름만 정리해 복사했습니다. 원본은 보존했으며 이미지 내용은 편집하지 않았습니다.

| 파일 | 원본 촬영 시각 (Asia/Seoul) | 확인 내용 |
| --- | --- | --- |
| [sandbox-browser.png](sandbox-browser.png) | 14:19:13 | 실제 Route 주소에서 표시된 V.02 체험 화면 |
| [topology.png](topology.png) | 14:16:14 | Topology 및 Service와 HTTPS Route의 연결 |
| [deployment.png](deployment.png) | 14:16:03 | Deployment의 Pod 1개와 RollingUpdate 설정 |
| [pod-ready-volumes.png](pod-ready-volumes.png) | 14:17:37 | 컨테이너 Running / Ready=True 및 볼륨 마운트 |
| [configmaps.png](configmaps.png) | 14:20:37 | Content와 Model ConfigMap 두 개 |
| [probes.png](probes.png) | 14:21:55 | 실제 Pod의 Readiness와 Liveness 및 requests/limits 설정 |
| [startup-probe.png](startup-probe.png) | 14:21:34 | 실제 Pod의 Startup Probe와 보안, 마운트 설정 |
| [redeploy.png](redeploy.png) | 14:47:43 | Git Clone 후 YAML 삭제 및 재생성, successfully rolled out 출력 |
| [redeploy-status.png](redeploy-status.png) | 14:48:42 | 재배포 후 Pod 1/1 Running, Service, Route, ConfigMap 상태 |

`local-preview.png`는 기존 로컬 미리보기이며 실제 배포 증빙과 구분합니다.

재배포 캡처는 YAML만으로 리소스를 삭제한 뒤 다시 생성하고 Pod가 정상 실행된 것을 보여줍니다. 재배포 후 브라우저 기능 재확인, 모델 설정 변경 전후 비교와 장애 복구 실험은 별도 결과가 필요합니다.
