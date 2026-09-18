# MSP 주간회고

팀이 한 주 동안 한 일을 적고, 함께 확인하는 내부 업무 사이트입니다. 회고, 고객사 담당, 근무 일정, 초과근무·대체휴가, 조직 정보를 한곳에서 관리합니다.

| 하고 싶은 일 | 사용할 메뉴 |
| --- | --- |
| 이번 주 일을 적고 제출하기 | 내 회고 작성 |
| 팀원의 회고를 읽고 댓글 남기기 | 리뷰 |
| 담당 고객사와 담당자 확인하기 | 담당 고객사 |
| 근무 일정과 휴일 관리하기 | 일정 관리 |
| 초과근무를 신청하고 대체휴가 쓰기 | 대체휴가 |
| 구성원과 파트 관리하기 | 조직 관리 |
| AWS 월간 자료 만들기 | AWS 월간 What's New |

## 가장 빠르게 실행하기

처음에는 Slack 연결 없이 내 컴퓨터에서 실행할 수 있습니다. Node.js 24 LTS와 Docker Compose v2를 설치한 뒤 아래 순서대로 실행하세요.

```bash
cp .env.example .env
```

`.env` 파일에서 아래 세 가지만 바꿉니다.

```dotenv
POSTGRES_PASSWORD=안전한-DB-비밀번호
SESSION_SECRET=openssl-rand-hex-32로-만든-긴-문자열
LOCAL_DEV_USER_ID=seed.json에-있는-내-사용자-id
DESIGN_B_ENABLED=true
```

`SESSION_SECRET`은 터미널에서 `openssl rand -hex 32`를 실행해 만들 수 있습니다. `LOCAL_DEV_USER_ID`는 **내 컴퓨터에서만** 쓰는 임시 로그인 설정입니다.

```bash
docker compose up --build -d --wait
curl --fail http://localhost:3000/health
```

`{"ok":true}`가 나오면 브라우저에서 [http://localhost:3000](http://localhost:3000)을 여세요. 새 화면은 [http://localhost:3000/b/](http://localhost:3000/b/)입니다. 컨테이너를 멈추려면 `docker compose down`을 실행합니다.

## 두 가지 화면

기존 화면(A)과 새 화면(B)은 같은 데이터와 같은 권한을 사용합니다. 화면만 다릅니다.

- `DESIGN_B_ENABLED=true`: `/b/`에서 새 화면(B)을 엽니다.
- `DESIGN_B_ENABLED=false`: 새 화면을 숨기고 기존 화면(A)으로 돌려보냅니다.
- 운영에서는 B를 사용하려면 `.env`에 `DESIGN_B_ENABLED=true`를 넣습니다.

## Slack 로그인은 언제 필요한가요?

운영 사이트는 Slack으로 로그인합니다. Slack 앱의 Redirect URL에 아래 주소를 등록하고 `.env`에 Client ID와 Secret을 넣으세요.

```text
https://내-도메인/auth/slack/callback
```

로컬에서 Slack 로그인도 시험하려면 `http://localhost:3000/auth/slack/callback`을 Slack 앱에 추가합니다. 운영에서는 `LOCAL_DEV_USER_ID`를 비워야 합니다.

선택으로 `users.profile:read` 봇 권한과 `SLACK_PROFILE_TOKEN`을 설정할 수 있습니다. 이 경우 로그인 때 Slack의 이메일·전화번호·입사일을 **비어 있는** 사이트 프로필에만 채웁니다. 이미 입력한 정보는 바꾸지 않습니다.

## 데이터는 이렇게 다룹니다

- 회고는 사람과 주차별로 저장합니다. 임시 저장, 제출, 검토 완료를 구분하고 댓글도 보관합니다.
- 파트와 구성원은 조직 관리에서 바꿉니다. `seed.json`은 빈 데이터베이스를 처음 만들 때만 사용합니다.
- 일정은 한 달 단위로 관리합니다. 승인된 대체휴가는 일정에 함께 보입니다.
- 초과근무는 실제 시간만큼 적립되고, 대체휴가는 4시간 또는 8시간으로 신청합니다.
- 관리자와 팀장은 조직 관리, 휴일 관리, 초과근무·휴가 승인, 회고 검토를 처리합니다. 각 사용자는 자신의 회고·프로필·신청을 관리합니다.

공휴일 기본 자료는 `public/koreanHolidays.js`에 있습니다. 현재 2025–2027년을 지원합니다. 임시공휴일처럼 갑자기 생긴 휴일은 관리자 또는 팀장이 `일정 관리 → 휴일 관리`에서 추가합니다.

## AWS 월간 What's New

이 메뉴에서는 AWS 자료 PDF를 분석하고, 고객용·영업용 문서와 발표 대본을 편집해 미리보기·PDF·ZIP·JSON으로 받을 수 있습니다. 화면에서 편집 영역과 문서 미리보기의 사이 막대를 드래그해 넓이도 조절할 수 있습니다.

AWS 연결 설정이 아직 없으면 편집과 JSON 저장은 가능하지만 PDF 분석·다운로드·Slack 전송은 준비 상태로 표시됩니다. 이 기능은 기존 EC2와 DB를 그대로 쓰고, 무거운 PDF 분석은 별도의 Python Lambda가 처리합니다. 자세한 연결·배포 절차는 [월간 리포트 서비스 문서](services/monthly-digest/README.md)를 보세요.

## 테스트하기

서버 동작을 확인합니다.

```bash
npm ci
npm test
```

브라우저 화면까지 확인하려면 처음 한 번만 Chromium을 설치한 뒤 실행합니다.

```bash
npx playwright install chromium
npm run test:e2e
```

새 화면(B)만 빌드하려면 다음 명령을 사용합니다.

```bash
cd frontend-b
npm ci
npm run build
```

## EC2에 배포하기

운영 배포는 두 단계입니다. 먼저 Terraform으로 EC2·네트워크·S3 같은 기반을 준비하고, 다음으로 그 EC2에서 앱을 실행합니다.

1. `terraform/terraform.tfvars.example`을 복사해 인프라 값만 입력합니다. 비밀값은 tfvars에 넣지 않습니다.
2. `bash scripts/quickstart.sh`로 plan을 확인한 후 Terraform 디렉터리에서 apply합니다.
3. Terraform이 알려 준 SSM 명령으로 EC2에 접속합니다. 기본 설정에서는 SSH를 열지 않습니다.
4. 도메인의 A 레코드를 EC2 공인 IP에 연결합니다.
5. Slack 앱에 `https://<도메인>/auth/slack/callback`을 Redirect URL로 등록합니다.

처음 배포할 때는 아래 값을 EC2의 환경변수로 준비한 뒤 스크립트를 실행합니다. 비밀값은 쉘 이력에 남기지 않는 보안 입력 방식으로 설정하세요. 스크립트가 `/opt/msp-weekly-review/.env`를 권한 600으로 만듭니다.

```dotenv
APP_DOMAIN=서비스-도메인
POSTGRES_PASSWORD=안전한-DB-비밀번호
SESSION_SECRET=openssl-rand-hex-32로-만든-긴-문자열
SLACK_CLIENT_ID=Slack-Client-ID
SLACK_CLIENT_SECRET=Slack-Client-Secret
ALLOWED_SLACK_TEAM_ID=허용할-Slack-workspace-id
BACKUP_S3_BUCKET=Terraform-출력-버킷명
DESIGN_B_ENABLED=true
```

```bash
cd /opt/msp-weekly-review
bash scripts/deploy-app.sh
curl --fail https://<도메인>/health
```

이미 실행 중인 서버를 최신 코드로 갱신할 때는 다음을 실행합니다. 기존 `.env`와 DB 비밀번호는 그대로 둡니다.

```bash
git pull --ff-only
docker compose up --build -d --wait
docker compose ps
```

HTTPS를 쓰려면 DNS가 서버를 가리키고 80·443 포트에 접근할 수 있어야 합니다. 배포 스크립트는 `.env`를 권한 600으로 만듭니다.

## 운영 데이터: 적재와 백업

검수한 초기 JSON을 먼저 확인만 하려면 아래 명령을 사용합니다. 이 단계에서는 DB가 바뀌지 않습니다.

```bash
docker compose exec -T app npm run data:initial -- --file - < /secure/path/approved-initial-data.json
```

출력과 백업을 확인한 뒤 실제로 반영합니다.

```bash
docker compose exec -T app npm run data:initial -- --file - --apply < /secure/path/approved-initial-data.json
```

S3 백업과 복구 명령은 다음과 같습니다. `latest` 대신 백업 파일명이나 전체 S3 key를 넣을 수도 있습니다.

```bash
BACKUP_S3_BUCKET=<버킷> bash scripts/backup.sh
BACKUP_S3_BUCKET=<버킷> bash scripts/restore.sh latest
```

복구는 현재 DB를 먼저 백업하고 앱을 멈춘 뒤 진행합니다. 실제 운영 복구 전에는 별도 테스트 DB에서 한 번 확인하세요.

매일 한국 시각 03시경 자동 백업하려면 EC2에서 다음을 한 번 설정합니다.

```bash
sudo install -m 600 /dev/null /etc/msp-weekly-review-backup.env
sudoedit /etc/msp-weekly-review-backup.env
# BACKUP_S3_BUCKET=실제버킷
# BACKUP_S3_PREFIX=backups
sudo install -m 644 scripts/systemd/msp-weekly-review-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now msp-weekly-review-backup.timer
```

설정 뒤에는 `sudo systemctl start msp-weekly-review-backup.service`로 한 번 실행하고, S3에 백업 파일이 생겼는지 확인하세요.

## 폴더 안내

| 폴더 | 내용 |
| --- | --- |
| `src/` | Express 서버, Slack 인증, DB 규칙 |
| `frontend-b/` | 새 화면(B)의 React 코드 |
| `public/` | 기존 화면(A)과 정적 자료 |
| `test/`, `e2e/` | 서버·브라우저 테스트 |
| `scripts/`, `terraform/` | 배포, 백업, AWS 기반 구성 |
| `services/monthly-digest/` | AWS 월간 리포트 Lambda |
| `developer/` | 실행에 쓰지 않는 개발 문서와 시안 |

`.env`, Terraform state·plan·tfvars, 백업 파일에는 비밀값이나 운영 정보가 들어갈 수 있습니다. 커밋하거나 외부에 공유하지 마세요. `seed.json`에도 팀원 정보가 있을 수 있으니 공유 전에 확인하세요.
