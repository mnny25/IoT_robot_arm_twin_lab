# 배포·추가 Object 검증 가이드

명령의 실행 위치는 `students/202355707`입니다. 본인 Sandbox 프로젝트에서 수행하고 실제 확인한 결과만 README에 기록합니다.

## 1. 추가 활용 확인

### ConfigMap 두 개가 실제로 쓰이는지

```bash
oc get configmap -l app=arm-lab-202355707
oc exec deployment/arm-lab-202355707 -- cat /opt/app-root/src/config.js
oc exec deployment/arm-lab-202355707 -- cat /etc/arm-lab/nginx.conf
```

첫 결과에는 content/model 두 ConfigMap이 나옵니다. 실제 컨테이너 파일에서 `speedDegreesPerSecond`, 길이·프리셋, Nginx의 `listen 8080`을 확인합니다.

### 모델 설정 변경 전후 비교

1. 페이지를 초기화하고 ‘옮기기’를 실행합니다. 초기 각도와 목표 각도가 같도록 비교합니다.
2. `web/config.js`에서 `speedDegreesPerSecond: 45`를 `20`으로 바꿉니다.
3. 생성·점검·반영합니다.

```bash
python tools/sync-configmap.py
python tools/verify-manifests.py
oc apply -f k8s/
oc rollout status deployment/arm-lab-202355707 --timeout=180s
oc exec deployment/arm-lab-202355707 -- cat /opt/app-root/src/config.js
```

4. 브라우저를 새로고침하고 같은 초기 자세에서 ‘옮기기’를 다시 실행합니다. 적용 값과 이동 시간이 길어지는 것을 확인합니다.
5. 속도를 45로 복원하고 같은 명령을 실행합니다. 원본·Model ConfigMap·Deployment 체크섬을 최종 상태로 함께 Commit합니다.

브라우저 개발자 도구의 `ARM_LAB_CONFIG.speedDegreesPerSecond` 값으로 새 설정 수신 여부를 확인할 수 있습니다. 짧은 이동에는 최소 애니메이션 시간이 있으므로 ‘옮기기’처럼 큰 각도 변화를 비교합니다. 이 실험은 가상 모델 설정 변경이며 실제 모터 속도 측정이 아닙니다.

### Probe와 정상 Pod 상태

```bash
oc get pods -l app=arm-lab-202355707
oc describe deployment arm-lab-202355707
```

컨테이너의 Startup / Readiness / Liveness 설정을 확인합니다. 실제 Pod 이름을 확인한 뒤 `oc describe pod <실제-Pod-이름>`으로 상태·이벤트도 확인합니다.

| 검사 | 판정 대상 | 실패 시 조치 |
| --- | --- | --- |
| Startup | 초기 /healthz 응답 | 허용 횟수까지 기다리며, 성공 전 다른 두 검사는 시작하지 않음. 실패 기준을 넘으면 컨테이너 재시작 |
| Readiness | /index.html 제공 준비 | 준비된 Service 전달 대상에서 제외, 이 검사 자체로 재시작하지 않음 |
| Liveness | /healthz 생존 응답 | 연속 실패 기준을 넘으면 컨테이너 재시작 |

정상 화면과 Probe 설정 캡처는 구성·정상 상태의 증빙입니다. 장애를 주입하지 않았다면 자동 복구를 실험했다고 기록하지 않습니다.

## 2. 이미지·설정 갱신 방식

`tools/sync-configmap.py`는 화면·설정을 ConfigMap에 포함하고, 생성 YAML의 SHA-256을 Deployment의 `spec.template.metadata.annotations`에 기록합니다. Pod 템플릿이 바뀌면 Deployment가 새 ReplicaSet과 Pod를 생성합니다.

- 모델만 변경하면 model 체크섬이 달라집니다.
- 웹 파일만 변경하면 content 체크섬이 달라집니다.
- 같은 원본으로 다시 생성하면 YAML과 체크섬이 동일합니다.
- 이는 생성기 실행과 Deployment 적용을 전제로 합니다. 브라우저에서 ConfigMap을 직접 저장하는 동작만으로 생성기가 실행되지는 않습니다.

이미지는 공개 태그와 함께 digest를 고정합니다. 다른 이미지로 교체할 때는 주소·digest·실행 방식·포트·Probe를 함께 검토한 후 재배포합니다.

## 3. 웹 콘솔에서 확인·업데이트

### 처음 생성

본인 프로젝트에서 ‘YAML 가져오기’로 `k8s/`의 5개 파일을 생성합니다. 순서는 content ConfigMap → model ConfigMap → Deployment → Service → Route로 진행할 수 있습니다. 워크로드의 Pod와 네트워킹의 Route에서 결과를 확인합니다.

### 기존 리소스 업데이트

기존 리소스 이름으로 ‘만들기’를 다시 실행하면 AlreadyExists 오류가 날 수 있습니다. `oc apply -f k8s/`는 신규 생성과 기존 갱신을 함께 처리합니다.

웹 콘솔만 사용하는 경우:

1. 로컬 원본을 수정했다면 먼저 생성기를 실행합니다.
2. 구성 맵의 content/model 리소스에서 YAML을 열고, 생성 파일의 **data 부분**을 반영해 저장합니다. 편집 중인 리소스의 서버 메타데이터는 유지합니다.
3. Deployment의 YAML에서 최신 생성 파일의 **spec 부분**을 반영합니다. 체크섬·마운트 목록·이미지 고정도 포함됩니다. 기존 Deployment selector의 app 값은 변경하지 않습니다.
4. Pod 교체와 READY 1/1을 확인하고 웹페이지를 새로고침합니다.

웹 콘솔에서 모델 ConfigMap만 직접 수정하는 실험이라면 Deployment 작업 메뉴에서 롤아웃 재시작을 수행합니다. 실험 결과는 로컬 `web/config.js`에도 반영하거나 최종 원본으로 복원하여 제출물과 실행 환경이 달라지지 않게 합니다.

## 4. 재배포와 결과 캡처

배포가 정상인지 먼저 확인한 뒤, 본인 프로젝트와 학번 폴더에서 실행합니다. 이 명령은 해당 YAML이 선언한 과제 리소스만 삭제합니다.

```bash
oc delete -f k8s/ --wait=true
oc apply -f k8s/
oc rollout status deployment/arm-lab-202355707 --timeout=180s
oc get all -l app=arm-lab-202355707
oc get configmap -l app=arm-lab-202355707
oc get route arm-lab-202355707
```

`oc get all`에는 ConfigMap 등 모든 리소스 종류가 포함되지는 않으므로 ConfigMap을 따로 확인합니다. Route host를 다시 조회하고 새 주소에서 기능을 시험합니다.

| 권장 파일 | 담을 내용 |
| --- | --- |
| `images/topology.png` | Topology 또는 Pod Running / READY 1/1과 Service·Route |
| `images/sandbox-browser.png` | 실제 HTTPS 주소와 V.02 로봇암 체험 화면 |
| `images/redeploy.png` | 삭제 후 재배포 명령·정상 Pod 상태 |
| `images/configmap-mounted.png` | 두 ConfigMap과 컨테이너 설정 파일 |
| `images/configmap-comparison.png` | 실제 변경한 속도·전후 결과 설명 |
| `images/probes.png` | Pod의 Startup·Readiness·Liveness 설정과 정상 상태 |

실제 파일을 넣은 뒤 README에 다음 형식으로 연결합니다. 없는 파일명은 링크하지 않습니다.

```markdown
![실제 Sandbox Pod와 리소스 상태](images/topology.png)
![HTTPS Route에서 실행한 ARM LAB](images/sandbox-browser.png)
```

검증 일시, 실제 Route URL, 시험한 기능과 결과도 기록합니다. 로그인 토큰·비밀번호가 보이는 화면은 저장하지 않습니다.

## 5. 오류 확인

```bash
oc get pods -l app=arm-lab-202355707
oc describe deployment arm-lab-202355707
oc get events --sort-by=.metadata.creationTimestamp
oc logs deployment/arm-lab-202355707 --tail=100
```

| 증상 | 확인할 항목 |
| --- | --- |
| ImagePullBackOff | 이미지 주소·digest와 레지스트리 접근, Pod 이벤트 |
| ContainerCreating 지속 | 두 ConfigMap 존재, 필수 key와 volume 이름 |
| CrashLoopBackOff | Nginx 로그, /tmp 쓰기 공간과 설정 문법 |
| Running이지만 READY 0/1 | /index.html 제공 여부, readiness 이벤트 |
| Route 연결 실패 | Pod 준비 상태, Service selector·포트와 Route 대상 |
| 기존 화면이 표시됨 | 생성 YAML 재적용, Deployment 체크섬, 새 Pod, 브라우저 새로고침 |
| 롤링 업데이트 중 Pending | 과제 외 실습 리소스 포함 quota 사용량. 현재 정책은 교체 중 최대 2개 Pod의 CPU·메모리 요청량을 필요로 함 |

실습 리소스를 정리할 때는 과제와 무관한 데이터가 필요한지 먼저 확인합니다. 문제 발생 시 실제 메시지·원인·수정·재확인 결과를 README에 기록합니다.
