# V.03 추가 Object 검증

아래 명령은 OpenShift 웹 터미널의 `students/202355707`에서 실행합니다. 확인한 결과만 README에 기록하세요.

## 배포와 기본 확인

로컬 변경을 GitHub에 Push한 뒤 웹 터미널에서 `git pull`을 실행합니다. 터미널에만 있는 변경은 먼저 확인하세요.

```bash
oc project
oc apply -f k8s/
oc rollout status deployment/arm-lab-202355707 --timeout=300s
oc get pods,deployments,services,routes,configmaps,secrets,pvc -l app=arm-lab-202355707
oc get route arm-lab-202355707 -o jsonpath='{.spec.host}'
```

PVC가 `Bound`, Pod가 `2/2 Running`이어야 합니다. 출력한 host에 `https://`를 붙여 접속합니다. 화면의 V.03 표시, 관절 조작과 데모, ‘나의 자세 보관함’을 확인하세요. 보관함은 모든 방문자가 공유하며 최대 100개를 저장합니다.

PVC가 Pending이면 `oc describe pvc arm-lab-202355707-poses`와 `oc get storageclass`를 확인합니다. 기본 StorageClass와 사용 가능한 스토리지 할당량이 필요합니다. `WaitForFirstConsumer`인 경우 Pod 스케줄링 후 Bound가 될 수 있습니다. 임의로 storageClassName이나 고정 UID를 넣지 말고 이벤트에 따라 원인을 확인하세요.

## ConfigMap

화면과 Nginx 설정, 모델 설정, API 소스용 ConfigMap 3개를 사용합니다. 모델 값 변경 비교는 [기존 검증 가이드](verification.md)를 따릅니다. 원본 수정 후에는 다음 순서로 적용합니다.

```bash
python tools/sync-configmap.py
python tools/verify-manifests.py
oc apply -f k8s/
oc rollout status deployment/arm-lab-202355707 --timeout=300s
```

content, model, api 체크섬이 Pod 템플릿에 포함됩니다. 변경된 코드가 있으면 새 Pod로 교체됩니다. RWO PVC를 쓰므로 `Recreate` 전략이며 교체 중에는 잠시 접속이 끊깁니다.

## Secret 인증 실패와 성공

제출 YAML의 `arm-lab-demo-202355707`은 공개된 과제 데모 키입니다. 실제 비밀 정보나 운영용 인증 키가 아닙니다. 재배포 시 별도 입력 없이 채점자가 동작을 확인할 수 있도록 포함했습니다. 키는 API 컨테이너에 파일로 마운트하며 웹 파일이나 응답에 포함하지 않습니다.

1. 보관함에 ‘인증 확인’ 자세를 저장합니다.
2. 관리자 삭제를 펼쳐 잘못된 키를 입력하고 해당 자세를 삭제합니다. 오류 메시지와 자세가 남는 것을 확인합니다.
3. 데모 키를 입력하고 삭제합니다. 자세가 사라지는 것을 확인합니다.
4. 개발자 도구 Network에서 실패 요청의 HTTP 401, 성공 요청의 HTTP 200을 확인하면 결과가 더 명확합니다.

실제 서비스로 운영할 때는 외부에서 발급한 비공개 키로 Secret을 교체해야 합니다. 이 데모는 저장과 조회가 공개되어 있으며 사용자별 권한을 구현한 서비스가 아닙니다.

## PVC: Pod 교체 후 저장 유지

1. ‘PVC 유지 확인’이라는 자세를 저장하고 이름과 J1/J2/J3를 캡처합니다.
2. PVC를 유지한 채 Pod만 교체합니다.

```bash
oc get pvc arm-lab-202355707-poses
oc rollout restart deployment/arm-lab-202355707
oc rollout status deployment/arm-lab-202355707 --timeout=300s
oc get pods -l app=arm-lab-202355707
```

3. 새 Pod 이름과 `2/2 Running`을 확인합니다.
4. 브라우저에서 보관함을 새로고침하고 동일한 자세가 남는지 확인합니다. 다른 시크릿 창에서도 확인할 수 있습니다. ‘불러오기’로 움직이는지도 확인하세요.

저장 파일은 API 컨테이너의 `/data/poses.sqlite3`입니다. 브라우저 localStorage를 사용하지 않습니다. SQLite는 replicas 1로 운용하며 서버 프로세스가 재시작되어도 같은 PVC를 다시 마운트하면 데이터를 읽습니다.

## 전체 삭제 후 재배포

다음 명령은 PVC까지 삭제합니다. 기존 자세가 사라질 수 있으며 저장 데이터 보존 시험과는 별개입니다. 필요한 자세를 먼저 기록하고 과제 재현성 확인용으로 수행하세요.

```bash
oc delete -f k8s/ --wait=true
oc apply -f k8s/
oc rollout status deployment/arm-lab-202355707 --timeout=300s
oc get pods,deployments,services,routes,configmaps,secrets,pvc -l app=arm-lab-202355707
```

새 Route 주소로 접속해 빈 보관함에서 자세 저장, 불러오기, 인증 삭제와 기존 데모가 동작하는지 다시 확인합니다. 이 단계는 로컬 파일이나 이미지 빌드 없이 `k8s/` YAML 8개만으로 수행합니다.

## 캡처할 내용

| 파일명 제안 | 내용 |
| --- | --- |
| v03-browser.png | V.03 화면, 저장한 자세와 관절 값 |
| v03-resources.png | Pod 2/2 Running, ConfigMap 3개, Secret, PVC Bound |
| v03-secret-denied.png | 잘못된 키로 삭제 거부, 자세 유지 |
| v03-secret-success.png | 올바른 키로 삭제 성공 |
| v03-pvc-before.png | 교체 전 Pod 이름과 저장한 자세 |
| v03-pvc-after.png | 교체 후 새 Pod 이름과 동일한 자세 |
| v03-redeploy.png | 전체 삭제 및 YAML 재배포 성공과 리소스 조회 |

키의 실제 값을 캡처할 필요는 없습니다. 실행한 명령, 결과, 확인 일시를 README에 함께 적습니다.
