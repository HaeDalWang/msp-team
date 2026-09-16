# AWS 월간 리포트 서비스

MSP 사이트의 `#monthly-digest` 화면이 Slack 세션 확인 후 이 Python Lambda를 호출합니다. Lambda Function URL, 별도 웹사이트, 공용 비밀번호는 만들지 않습니다. Node 서버는 AWS SDK의 `InvokeWithResponseStream`으로 호출하고 Lambda Web Adapter의 HTTP 메타데이터와 본문을 분리해 진행 상황을 전달합니다.

## 원본과 재사용 범위

원본: 개발팀의 `aws-monthly-digest`, 기준 커밋 `0ae78e7`.
`llm_parser.py`, `prompts.py`, `evidence.py`, `ordering.py`, 고객용·영업용 Jinja 템플릿과 로고를 가져왔습니다. 원본 저장소는 수정하지 않았습니다. 인증·업로드·출력 API와 웹 편집 화면은 MSP에 맞게 구현했습니다. 이 코드는 팀 내부 통합용이며 외부 공개 시 원본 저작자 및 로고 사용 권한을 별도로 확인해야 합니다.

## 동작과 제한

- PDF 업로드 → Bedrock 병렬 분석 → 고객용/영업용/대본 편집 → 미리보기·PDF·ZIP·선택 파일 Slack 전송
- 서버에서 모델을 지정합니다. 브라우저가 모델이나 전송자 신원을 바꿀 수 없습니다.
- PDF 최대 3개, 파일당 20MB, 합계 150페이지·250,000자. 스캔 OCR은 지원하지 않습니다.
- 사용자별 동시 무거운 작업 1개, 앱 전체 2개, 분석은 사용자당 시간당 6회. 단일 EC2 프로세스의 메모리 제한이며 앱 재시작 시 초기화됩니다.
- S3의 원본·분석 결과는 30일 후 삭제됩니다. 편집 중인 내용은 서버에 자동 저장되지 않으므로 전체 JSON으로 보관합니다. JSON 가져오기는 파일 2MB, 정규화한 리포트는 1.8MB까지입니다.
- 미리보기는 sandbox iframe, 템플릿은 HTML escaping, PDF 브라우저는 스크립트·외부 요청을 차단합니다.
- 분석은 모델 호출까지 수행하며 PDF는 미리보기/다운로드 요청 시 생성합니다. Lambda 제한은 600초입니다.
- 요청 실행자는 MSP 로그에 기록합니다. 분석 JSON에는 원문 근거를 보존합니다.
- Lambda 기본 이미지와 Web Adapter는 digest로, 직접 Python 의존성은 버전으로 고정합니다. 보안 업데이트 때 버전을 올리고 컨테이너 테스트를 다시 실행하세요.

## 배포

기존 MSP Terraform 상태를 사용합니다. 다른 팀원의 새 PC에서 기존 인프라를 관리하려면 먼저 기존 state를 안전하게 인계받아야 합니다. 새 state로 기존 환경에 apply하지 마세요. 저장소에 state나 비밀값을 커밋하지 않습니다.

1. `terraform/terraform.tfvars`에 다음 값을 설정합니다.

   ```hcl
   enable_monthly_digest       = true
   monthly_digest_site_origin  = "https://실제-MSP-도메인"
   # 최초에는 이미지가 없으므로 빈 값. ECR/S3/IAM/로그만 준비합니다.
   monthly_digest_image_uri    = ""
   ```

2. `terraform -chdir=terraform plan`으로 기존 EC2/디스크가 삭제·교체되지 않는지 확인하고 `terraform -chdir=terraform apply`합니다. EC2에는 최신 AMI 변경 무시와 삭제 방지가 적용되어 있습니다. OS 교체는 데이터 이전을 포함한 별도 유지보수입니다.
3. `AWS_REGION=ap-northeast-2 bash scripts/build-monthly-digest.sh`를 실행합니다. 이 단계는 ECR에 이미지를 업로드합니다. 출력되는 digest 포함 이미지 URI를 `monthly_digest_image_uri`에 저장합니다.
4. Terraform plan/apply를 다시 실행해 Lambda와 기존 EC2의 호출 권한을 생성합니다. 이미지를 교체할 때도 새 digest를 설정하고 apply합니다. 이미지 빌드 계정에는 ECR push, 배포 계정에는 Lambda/ECR/IAM 관리 권한이 필요합니다.
5. Terraform 출력 `monthly_digest_function_name`, `monthly_digest_upload_origin`을 EC2 앱 `.env`의 `MONTHLY_DIGEST_FUNCTION_NAME`, `MONTHLY_DIGEST_UPLOAD_ORIGIN`에 넣고 `AWS_REGION`을 맞춥니다. 기존 DB/Slack 설정은 보존합니다. `docker compose up --build -d --wait`로 앱을 갱신합니다.
6. Slack 로그인 후 PDF 업로드·분석·한글 PDF·ZIP을 확인합니다. 실제 Bedrock 호출은 과금되며, 배포 대상 계정의 모델 이용 권한과 추론 프로파일 호출 정책이 필요합니다.

Slack 전송은 선택 사항입니다. 별도 Secrets Manager secret에 `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`를 넣고 ARN만 `monthly_digest_slack_secret_arn`으로 전달하세요. 해당 봇에 파일 업로드 권한과 대상 채널 참여가 필요합니다. 실제 시크릿 값은 Terraform으로 관리하지 않습니다. 고객 관리용 프로필 토큰을 자동으로 전용하지 않습니다. 기본 AWS 관리 키로 암호화된 secret을 전제로 하며 고객 관리 KMS 키를 사용하면 해당 decrypt 권한을 추가해야 합니다.

기능을 잠시 중지하려면 앱의 `MONTHLY_DIGEST_FUNCTION_NAME`을 비우고 앱을 재시작합니다. `enable_monthly_digest=false`는 리소스 삭제 계획을 만들므로 단순 기능 중지용으로 사용하지 마세요. 기존 이미지를 유지했다면 이전 digest로 Lambda를 되돌릴 수 있습니다.

## 로컬 검증

```bash
python3 -m venv /tmp/msp-digest-venv
/tmp/msp-digest-venv/bin/pip install -r services/monthly-digest/requirements.txt
/tmp/msp-digest-venv/bin/playwright install chromium
PYTHONPATH=services/monthly-digest /tmp/msp-digest-venv/bin/python -m unittest discover -s services/monthly-digest/tests -v
npm test
npm run test:e2e
docker build --platform linux/amd64 -t msp-monthly-digest:local services/monthly-digest
```

외부 서비스는 테스트에서 대체하므로 테스트만으로 AWS 배포, 모델 이용 권한, Slack 전송 성공을 보장하지 않습니다. 로컬 Python HTTP 실행은 `DIGEST_LOCAL_TOKEN`과 사용자 헤더를 명시해야 하며 공개 네트워크에 바인딩하지 않습니다. EC2 운영 앱은 로컬 HTTP 경로 대신 IAM Lambda 호출만 사용합니다.
