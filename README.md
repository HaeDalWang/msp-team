# MSP 주간회고

14~20명 팀의 주간회고·고객사·일정·조직을 관리하는 내부 사이트입니다. Express, PostgreSQL, 브라우저 JavaScript를 사용하며 EC2 한 대의 Docker Compose로 운영합니다.

## 로컬 개발

Node.js 24 LTS와 Docker Compose v2가 필요합니다. Node 버전은 [공식 지원 일정](https://github.com/nodejs/Release#release-schedule)을 따릅니다.

```bash
cp .env.example .env
# POSTGRES_PASSWORD, SESSION_SECRET을 생성해 입력하고,
# LOCAL_DEV_USER_ID에 seed.json에 등록된 사용자 id를 명시합니다.
docker compose up --build -d --wait
curl --fail http://localhost:3000/health
npm ci
npm test
```

로컬 앱은 기본적으로 `127.0.0.1:3000`에만 바인딩합니다. Slack 설정이 없다는 이유로 인증이 자동 해제되지 않습니다. `LOCAL_DEV_USER_ID`는 개발에서만 사용하며 운영에서는 허용하지 않습니다. Slack으로 개발할 경우 Client ID/Secret과 localhost callback을 설정합니다.

## 기능과 데이터 기준

- 회고는 사용자·주차별 DB에 저장하며 임시 저장, 제출, 검토 상태를 구분합니다. 댓글도 DB에 보관합니다.
- 월간 집계는 저장된 회고를 사용합니다. API 오류는 오류로 표시하며 예제 데이터로 대체하지 않습니다.
- 파트와 구성원 목록은 DB가 기준입니다. seed는 사용자가 없는 DB에 최초 한 번만 적용합니다. 이후 구성원 등록·변경은 조직 관리 화면에서 수행하므로 삭제한 파트가 재시작 시 되살아나지 않습니다.
- 주차는 한국 시간 기준 이번 월요일로 선택하고, 표시 기간은 월요일부터 다음 월요일입니다. 직책·파트가 바뀌어도 저장된 회고는 조회합니다. 댓글 초안은 페이지가 열린 동안 사람·주차별로 보존하며 페이지를 떠날 때 경고합니다.
- 일정은 월별 조회·편집하며 최대 31일(주말 포함)을 일괄 적용할 수 있습니다. 기존 일정·메모 덮어쓰기는 확인 후 실행합니다. 승인된 대체휴가는 달력에 별도 합성하여 표시하고 기존 일정과 겹치면 함께 안내합니다.
- 초과근무는 30분 단위로 등록하고 실제 경과 시간을 1:1로 적립합니다. 종료가 더 이르면 다음 날로 계산합니다. 대체휴가는 4시간/8시간으로 신청하며, 사용 승인 대기분을 뺀 신청 가능 시간 내에서만 접수됩니다. 별도 가산 배율·만료 정책은 적용하지 않습니다.
- 초과근무와 휴가는 팀장·관리자가 승인·반려합니다. 승인 취소는 사유·처리자·시각과 기존 승인 정보를 보존합니다. 사용되었거나 신청 대기 중인 시간을 침범하는 초과근무 취소는 차단합니다. 취소 후 올바른 내용으로 새 신청할 수 있습니다. 본인의 미승인·반려 신청만 삭제할 수 있습니다.

### 공휴일 자료 갱신

기본 자료는 `public/koreanHolidays.js`의 2025–2027년 목록입니다. 지원 밖 연도에는 고정일 공휴일만 표시되므로 화면에 경고합니다. 공휴일 자동 동기화와 Zendesk 연동은 제공하지 않습니다.

매년 11월 운영 담당자가 다음 연도 정부 공식 월력요항의 설·추석·대체공휴일을 확인해 연도별 자료와 테스트를 갱신하고 배포합니다. 임시공휴일 등 중간 변경은 관리자·팀장이 ‘일정 관리 → 휴일 관리’에서 즉시 등록합니다. 이 목록의 지원 연도가 해당 연도의 모든 임시 변경까지 반영되었다는 뜻은 아닙니다.

모든 업무 API는 인증을 요구합니다. 본인 회고와 시간외 근무 신청의 작성자는 세션으로 결정합니다. 고객사는 로그인한 팀원이 공동 관리하고, 일정은 본인 또는 관리자/팀장이 수정합니다. 조직 편집은 관리자, 휴일 관리·시간외 근무 승인은 관리자/팀장 권한을 사용합니다. 댓글은 로그인한 팀원 누구나 작성하고 제출한 회고의 검토 완료는 팀장·관리자가 처리합니다. 최종 권한과 계정 활성 상태는 매 요청마다 서버가 DB에서 검사합니다.

Slack 앱에 `users.profile:read` 봇 권한을 부여하고 `SLACK_PROFILE_TOKEN`을 설정하면 로그인 시 Slack 이메일·전화번호와, Slack API가 제공하는 경우의 Start Date를 사이트 프로필의 빈 값에만 기본 입력합니다. 사이트에 이미 저장된 값은 덮어쓰지 않으며 Slack 프로필 조회 실패도 로그인을 막지 않습니다. 로그인용 `openid profile email`은 사용자 토큰 범위에, `users.profile:read`는 봇 토큰 범위에 각각 설정합니다. Slack의 기본 `start_date`는 Slack Atlas가 활성화된 워크스페이스에서만 제공되며, 별도의 커스텀 날짜 필드는 자동 연결하지 않습니다.

## 운영 배포: 인프라와 앱 2단계

운영 도메인이 있는 HTTPS 구성을 `compose.production.yaml`로 제공합니다. 이 구성은 선택 사항이며 실제 배포 전에 팀의 외부 접근/사내망 정책을 확정하세요. 공인 인증서 자동 발급에는 도메인 DNS가 서버를 가리키고 80/443 접근이 가능해야 합니다. 사내망 제한 환경에서는 별도의 인증서 발급 방식이 필요할 수 있습니다.

1. `terraform/terraform.tfvars.example`을 복사해 인프라 값만 설정합니다. 비밀값을 tfvars에 넣지 않습니다.
2. `bash scripts/quickstart.sh`로 plan을 생성·검토하고 Terraform 디렉터리에서 apply합니다.
3. 출력된 `ssm_command`로 접속합니다. 최초 부팅은 Docker와 저장소만 준비하며 앱은 아직 실행되지 않습니다.
4. 도메인의 A 레코드를 `app_public_ip`에 연결합니다. 재시작에도 IP를 고정하려면 `allocate_elastic_ip=true`를 선택합니다(기본 false, 공인 IPv4 과금 확인).
5. Slack App에 `https://<도메인>/auth/slack/callback`을 Redirect URL로 등록합니다.

EC2에서 아래 환경변수를 설정한 뒤 실행합니다. 비밀값은 쉘 이력에 남기지 않도록 보안 입력 방식으로 설정하세요.

```bash
cd /opt/msp-weekly-review
# 필요한 환경변수:
# APP_DOMAIN, POSTGRES_PASSWORD (openssl rand -hex 24)
# SESSION_SECRET (openssl rand -hex 32)
# SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, ALLOWED_SLACK_TEAM_ID
# BACKUP_S3_BUCKET (Terraform 출력값)
bash scripts/deploy-app.sh
curl --fail https://<도메인>/health
```

배포 스크립트는 최초 `.env`를 권한 600으로 작성하고 HTTPS overlay를 사용합니다. 기존 `.env`가 있으면 덮어쓰지 않습니다. 기존 운영 환경은 `.env`에 `COMPOSE_FILE=compose.yaml:compose.production.yaml`, `APP_DOMAIN`, `NODE_ENV=production`, `APP_BIND_ADDRESS=127.0.0.1`, HTTPS `SLACK_REDIRECT_URI`를 설정하고 `LOCAL_DEV_USER_ID`를 제거한 뒤 아래 재배포 명령을 사용합니다. 기존 DB 비밀번호는 변경하지 마세요.

```bash
git pull --ff-only
docker compose up --build -d --wait
docker compose ps
```

SSH는 기본 닫혀 있으며 SSM으로 관리합니다. 필요할 때만 `ssh_key_name`과 `ssh_allowed_cidrs`를 함께 지정하세요. `web_allowed_cidrs`로 웹 접근 범위를 제한할 수 있습니다. Terraform apply, 배포, DNS 변경은 코드 수정과 별개의 운영 작업입니다.

## 검수된 초기 데이터 적재

검수된 고객사·초과근무·대체휴가 JSON은 민감한 운영 데이터이므로 저장소에 커밋하지 않습니다. 기본 명령은 DB를 변경하지 않고 추가/기존 건수만 보여줍니다.

```bash
docker compose exec -T app npm run data:initial -- --file - < /secure/path/approved-initial-data.json
```

출력을 확인하고 백업을 생성한 뒤에만 적용합니다.

```bash
docker compose exec -T app npm run data:initial -- --file - --apply < /secure/path/approved-initial-data.json
```

적재는 하나의 트랜잭션으로 실행되고 재실행해도 동일한 기록을 추가하지 않습니다. 이미 있는 동일명 고객사의 속성과 담당 배정은 모두 보존하고 `건너뜀`으로 보고합니다. 적용 후 건별 되돌리기는 제공하지 않으므로 문제가 있으면 적용 직전 백업을 복구합니다.

## 백업과 복구

```bash
BACKUP_S3_BUCKET=<버킷> bash scripts/backup.sh
BACKUP_S3_BUCKET=<버킷> bash scripts/restore.sh latest
# latest 대신 파일명 또는 전체 S3 key도 가능
```

백업은 `pg_dump` custom 형식으로 S3에 올립니다. 실패하면 오류 종료하며 임시 파일을 정리합니다. 기본 S3 보존 기간은 30일입니다. 복구는 사용자 확인 후 현재 DB를 먼저 백업하고 앱을 중지한 상태에서 단일 트랜잭션으로 수행합니다. SQL 오류 시 전체 복구가 롤백되고, 원래 실행 중이던 앱은 다시 시작합니다. 복구 완료 뒤 health와 로그인을 확인하세요.

EC2에서 매일 한국 시각 03시경 실행하려면:

```bash
sudo install -m 600 /dev/null /etc/msp-weekly-review-backup.env
sudoedit /etc/msp-weekly-review-backup.env
# BACKUP_S3_BUCKET=실제버킷
# BACKUP_S3_PREFIX=backups
sudo install -m 644 scripts/systemd/msp-weekly-review-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now msp-weekly-review-backup.timer
sudo systemctl start msp-weekly-review-backup.service
sudo journalctl -u msp-weekly-review-backup.service --no-pager
```

timer 설정만으로 백업 성공이 보장되지는 않습니다. 최초 실행 성공과 S3 파일을 확인하고 복구를 별도 테스트 DB에서 정기적으로 확인하세요. EC2의 AWS CLI 및 S3 접근 IAM role이 필요합니다.

## 유지보수

`src/`는 서버·인증·스키마, `public/`는 화면, `test/`는 동작 테스트, `scripts/`와 `terraform/`는 운영 구성입니다. 마이그레이션은 기존 데이터를 보존하며 재실행 가능해야 합니다. `.env`, tfvars, state, plan, 백업에는 민감 정보가 포함될 수 있으므로 커밋하지 않습니다. `seed.json`에도 팀원 정보가 있으므로 공개 공유 전에 확인하세요.

`npm test`는 Docker로 일회용 PostgreSQL 컨테이너를 띄우고 테스트별 임시 스키마에서 검증한 뒤 컨테이너를 정리합니다. 기존 앱·DB는 사용하지 않습니다. `TEST_DATABASE_URL`을 명시하면 해당 테스트 DB 안에 임시 스키마를 만들고 삭제합니다. 운영 DB URL을 지정하지 마세요.

브라우저 검증은 `npx playwright install chromium`을 한 번 실행하고 `npm run test:e2e`로 수행합니다. 회고 임시 저장·제출·재조회·댓글·검토·월간 집계, 고객사 변경·이관, 새 파트·일정 사유, 초과근무·휴가 승인 흐름을 검증합니다. `npm run test:coverage`는 Node에서 실행한 코드의 커버리지를 표시하며 브라우저의 app.js 커버리지는 포함하지 않습니다.

운영 파일 변경 시 각 스크립트의 `bash -n`, `terraform fmt -check`, `terraform validate`도 수행합니다. 실제 Slack 로그인, 도메인/DNS, 운영 배포, S3 백업·복구는 각 운영 환경에서 별도로 확인해야 합니다.
