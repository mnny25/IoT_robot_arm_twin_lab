# 배포 증빙 이미지

README에서 사용하는 배포 결과와 실행 화면입니다. 캡처 원본은 보존했습니다.

| 파일 | 촬영 일시 (Asia/Seoul) | 확인 내용 |
| --- | --- | --- |
| [deployment-pvc.png](deployment-pvc.png) | 2026-10-27 15:57:21 | YAML 적용과 롤아웃 성공, Pod 2/2 Running, PVC Bound / 1Gi / RWO |
| [v03-local-preview.png](v03-local-preview.png) | 2026-10-27 | 로컬 Chrome에서 확인한 자세 보관함. OpenShift 배포 증빙과 구분 |

실제 Route에서 자세 저장과 불러오기, Secret 인증 결과, Pod 교체 전후 PVC 데이터 유지와 전체 삭제 후 재배포 결과는 확인 후 캡처를 추가합니다.
