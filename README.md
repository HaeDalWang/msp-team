# MSP 주간회고

CSG MSP 팀(14명)이 실제로 쓰는 주간회고·조직관리 내부 도구. Express + PostgreSQL 단일 Docker Compose 스택이며, EC2 한 대에서 앱과 DB가 함께 뜬다.

## 무엇을 하는 앱인가

- 팀원들이 매주 회고(주요 업무·계획·과제·기타 사항 + 티켓 수)를 작성하고, 팀장이 대시보드에서 취합해 본다.
- 담당 고객사, 팀 일정, 대체휴가, 조직 구성을 팀원 스스로 관리한다.
- Slack 로그인만 지원하며, 로그인 가능한 사람은 seed에 등록된 사람으로 한정된다.

---

## 1. 배포 QuickStart (팀장님용, 처음 배포하거나 다른 AWS 계정에 복제할 때)

### 준비물

- AWS 계정과 `aws configure`로 로그인된 CLI (`aws sts get-caller-identity`로 확인)
- Terraform ≥ 1.5
- Slack App (기존 등록 앱 재사용 가능). Client ID/Secret만 있으면 됨 — Redirect URL은 배포 후 등록한다.

### 1단계 — 인프라 생성 (Terraform, 사람이 직접 apply)

```bash
git clone https://github.com/HaeDalWang/msp-team.git
cd msp-team/terraform
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars에서 최소한 이것만 바꾼다:
#   repo_url = "본인이 복제한 저장소 URL"
#   aws_region, project_name (다른 계정/환경이면)

terraform init
terraform plan -out=quickstart.tfplan   # 여기까지는 자동화 스크립트(scripts/quickstart.sh)도 가능
terraform apply quickstart.tfplan       # apply/destroy는 항상 사람이 직접 실행
```

`scripts/quickstart.sh`를 쓰면 `postgres_password`/`session_secret`을 자동 생성하고 `plan`까지 대신 실행해준다 (apply는 여전히 사람이 한다):

```bash
scripts/quickstart.sh
terraform apply quickstart.tfplan
```

apply가 끝나면 출력되는 `app_public_ip`를 적어둔다. 이 시점에는 **EC2에 Docker/buildx만 설치되고 리포지토리가 clone된 상태**이며, 앱 컨테이너는 아직 뜨지 않는다 (이유는 "왜 2단계로 나뉘어 있나" 참고).

### 2단계 — 앱 기동 (SSM으로 실행, 실제 IP를 알아야 하는 값들을 여기서 넣는다)

EC2에 SSH 키는 없다. **AWS SSM Session Manager**로 접속한다 (`terraform/main.tf`에서 IAM role에 `AmazonSSMManagedInstanceCore`를 이미 붙여둠).

```bash
aws ssm start-session --target <apply 출력의 instance id>
```

접속한 셀 안에서:

```bash
cd /opt/msp-weekly-review
APP_PUBLIC_URL=http://<app_public_ip> \
POSTGRES_PASSWORD=<임의의 강력한 비밀번호> \
SESSION_SECRET=$(openssl rand -hex 32) \
SLACK_CLIENT_ID=<Slack App Client ID> \
SLACK_CLIENT_SECRET=<Slack App Client Secret> \
ALLOWED_SLACK_TEAM_ID=<Slack workspace team_id, 예: T0123ABCD> \
BACKUP_S3_BUCKET=<apply 출력의 backup_s3_bucket> \
bash scripts/deploy-app.sh
```

끝나면 스크립트가 접속 URL과 Slack Redirect URL을 출력한다. 마지막으로:

1. Slack App 설정 → OAuth & Permissions → Redirect URLs에 `http://<app_public_ip>/auth/slack/callback` 등록
2. `curl http://<app_public_ip>/health` → `{"ok":true}` 확인
3. 브라우저에서 접속해 Slack 로그인까지 확인

### 코드만 바꿔서 재배포할 때 (인프라는 그대로)

```bash
aws ssm start-session --target <instance id>
cd /opt/msp-weekly-review
git fetch --depth 1 origin main && git reset --hard origin/main
/usr/local/bin/docker-compose up --build -d
```

### 왜 2단계로 나뉘어 있나

Slack OAuth의 `redirect_uri`는 EC2의 퍼블릭 IP(또는 도메인)를 알아야 만들 수 있는데, `terraform apply` 시점에는 아직 그 IP가 존재하지 않는다(EC2가 생성되는 중이라 닭과 알 문제). 그래서 Terraform은 인프라만 만들고, IP가 확정된 뒤 `deploy-app.sh`가 `.env`를 실제 값으로 채워서 `docker compose up`을 실행한다. 인프라를 다시 만들 필요가 없는 코드 수정은 위 "재배포" 명령만으로 충분하다.

### 로컬에서 개발/테스트할 때

```bash
npm install
cp .env.example .env   # POSTGRES_PASSWORD/SESSION_SECRET만 채우면 로그인 없이 뜬다
                        # (SLACK_CLIENT_ID를 비워두면 인증 미들웨어 자체가 꺼짐 — 로컬 개발용)
docker compose up --build -d
curl http://localhost:3000/health
npm test                # 40개 테스트, node:test 사용
```

---

## 2. 시스템 구성

```
terraform/    VPC + EC2(al2023, IAM+SSM) + S3(백업) — 인프라만, 앱은 안 띔
scripts/      quickstart.sh(plan까지 자동) / deploy-app.sh(앱 기동, 2단계) / backup.sh, restore.sh(pg_dump↔S3)
src/          Express 서버 (server.mjs) + 인증(auth.mjs) + DB 스키마/시드(db.mjs, seed.mjs)
public/       프런트엔드. 빌드 도구 없는 vanilla JS(app.js) + 화면별 모듈(views/*.js)
test/         node:test 기반, 총 40개. npm test로 전부 실행
compose.yaml  app(Node) + db(PostgreSQL 18) 두 컨테이너
seed.json     팀원 14명 + 파트 3개(Leaf/Tiger/Dragon) 시드 데이터. git에 커밋됨(개인정보 있음, 의도적)
```

인증이 없는 상태(`SLACK_CLIENT_ID` 미설정)로도 뜨는데, 이건 로컬 개발 편의용이며 그 경우 모든 API가 인증 검사 없이 열린다. 운영 배포에서는 항상 Slack Client ID를 넣어야 한다.

---

## 3. 권한 모델 (role)

seed의 각 사용자는 `engineer`(기본값) / `lead` / `executive` / `admin` 중 하나의 role을 가진다. 서버(`src/auth.mjs`)가 최종 검증하고, 프런트(`public/session.js`)는 화면에서 버튼을 숨기는 용도로만 같은 규칙을 참고한다 — **화면에서 버튼이 안 보여도 서버가 진짜 방어선**이다.

| 동작 | 허용 대상 |
|---|---|
| 담당 고객사 추가/수정/이동/삭제 | 로그인한 사람 누구나 (엔지니어끼리 자주 담당을 넘기므로 소유자 일치 요구 안 함) |
| 본인 일정(`PUT /api/schedule`) 수정 | 본인, 또는 admin/lead |
| 조직 휴일 등록/삭제 | admin/lead만 |
| 시간외 근무 승인 | admin/lead만 |
| 파트 추가, 팀원 파트/role 변경 | admin만 |
| 회고 작성/제출 | 로그인한 사람 누구나 (자기 자신의 것만 편집 UI에 노출, 서버는 userId를 그대로 신뢰 — 악의적 변조는 세션 위조가 필요) |

---

## 4. API 레퍼런스 (`src/server.mjs`)

모든 엔드포인트는 JSON을 주고받는다. 인증이 필요한 요청은 `msp_session` 쿠키(HttpOnly)로 판별하며, 없으면 401을 반환한다.

### 인증 (`src/auth.mjs`가 등록)

| Method & Path | 설명 |
|---|---|
| `GET /auth/slack` | Slack OAuth 시작. state 쿠키를 심고 Slack 인증 페이지로 리다이렉트 |
| `GET /auth/slack/callback` | Slack에서 돌아오는 콜백. `slack_user_id`로 seed의 users 테이블을 조회해 세션 발급. **seed에 없는 Slack 계정은 403** |
| `GET /auth/logout` | 세션 쿠키 삭제 |
| `GET /api/me` | 현재 로그인한 사용자 정보(`userId`, `name`, `role`). 비로그인 401 |

### 조직/시드

| Method & Path | 설명 |
|---|---|
| `GET /api/bootstrap` | 전체 팀원 목록(파트별 그룹). 로그인 화면 밖에서도 호출됨(비로그인 접근 가능) |
| `GET /api/organization` | 파트 목록 + 사용자→파트/role/버전 맵. 조직 관리 화면용 |
| `POST /api/organization/parts` | 파트 추가. **admin만** |
| `PUT /api/organization/users/:id` | 사용자의 파트/role 변경. **admin만**. `version` 필드로 낙관적 잠금(동시 수정 충돌 시 409) |

### 주간회고

| Method & Path | 설명 |
|---|---|
| `GET /api/reviews?weekEnd=YYYY-MM-DD` | 그 주의 전체 팀원 회고 상태(작성 여부 무관 전원 반환). 대시보드/리뷰 화면이 씀 |
| `PUT /api/reviews` | 회고 저장(upsert). `userId`, `weekEnd`, 4개 텍스트 필드 필수. `ticketsNew`/`ticketsInProgress`/`ticketsDone`은 선택(생략 시 0) — Zendesk 연동 전까지 엔지니어가 직접 입력하는 필드 |

### 담당 고객사

| Method & Path | 설명 |
|---|---|
| `GET /api/customers` | 전체 팀원을 기준으로 조회(고객사가 0개인 사람도 빈 배열로 포함됨 — 그래야 "추가" 버튼이 보임) |
| `POST /api/customers` | 고객사 신설 + 담당자 배정. `tier`(Standard/Advanced/Enterprise 중 하나, 기본 Standard), `mcr`(월간리뷰 진행 여부, boolean), `keyAccount`(주요고객 여부, boolean) |
| `PUT /api/customers/:id` | 담당자 재배정 및/또는 tier/mcr/keyAccount/note/since 수정. `userId` 필수 |
| `DELETE /api/customers/:id` | 고객사 삭제 (배정 정보도 CASCADE로 함께 삭제) |

### 팀 일정 / 휴일

| Method & Path | 설명 |
|---|---|
| `GET /api/schedule?month=YYYY-MM` | 그 달의 전체 일정 항목 (userId→date→{type, note}) |
| `PUT /api/schedule` | 하루치 일정 upsert. 본인 또는 admin/lead만 |
| `GET /api/holidays` | 관리자가 등록한 회사 휴일 목록 |
| `POST /api/holidays` | 휴일 추가. admin/lead만 |
| `DELETE /api/holidays/:date` | 휴일 삭제. admin/lead만 |

> 알려진 제한: `month` 파라미터는 서버가 받지만, 현재 프런트(`public/views/schedule.js`)의 "이전 달/다음 달" 버튼에 클릭 이벤트가 연결되어 있지 않아 화면은 9월(`2026-09`)에 고정돼 있다. 고치려면 `schedule.js`의 `month` 상수를 state로 옮기고 버튼에 이벤트를 붙여야 한다.

### 대체휴가 (시간외 근무)

| Method & Path | 설명 |
|---|---|
| `GET /api/overtime?userId=...` | 특정 사용자의 시간외 근무 기록 + 승인된 시간 합계(balanceHours) |
| `POST /api/overtime` | 시간외 근무 등록(대체휴가 적립 신청). 상태는 `pending`으로 시작 |
| `POST /api/overtime/:id/approve` | 승인 처리(`pending` → `approved`). admin/lead만 |

---

## 5. 데이터베이스 (`src/db.mjs`)

`connectDatabase()`가 기동 시 `migrate()`(스키마 생성/컬럼 추가, 모두 `IF NOT EXISTS`라 재실행 안전)와 `seed()`(`SEED_FILE` env가 있을 때만, `seed.json`을 upsert)를 순서대로 실행한다.

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `parts` | id, name, color | Leaf/Tiger/Dragon |
| `users` | id, name, part_id(nullable), role, slack_user_id, version | part_id가 null이면 "무소속" — 파트 소속 없이도 로그인 가능(예: 관리 담당) |
| `customers` | id, name, since, tier, mcr, key_account, note, services(레거시, 미사용) | tier 기본값 'Standard' |
| `customer_assignments` | customer_id, user_id | 고객사:담당자 다대다. 지금 UI는 담당자 1명만 쓰지만 스키마는 여러 명 허용 |
| `reviews` | user_id, week_end, 4개 텍스트, tickets_new/in_progress/done, status | (user_id, week_end) unique |
| `schedule_entries` | user_id, work_date, type, note | (user_id, work_date) PK |
| `overtime_records` | user_id, work_date, type, customer, 시간, hours, status | status: pending/approved |
| `holidays` | holiday_date(PK), name | 관리자 수동 등록 |

`seed.json`은 `.gitignore`에서 제외하고 git에 커밋되어 있다(EC2가 clone만으로 시드 데이터를 받아야 하기 때문). 팀원 이름 등 개인정보가 포함되므로 이 저장소를 fork/공유할 때 유의.

---

## 6. 백업/복구

```bash
# EC2 안에서 (또는 SSM으로 접속해서)
BACKUP_S3_BUCKET=<terraform output의 backup_s3_bucket> scripts/backup.sh
BACKUP_S3_BUCKET=<...> scripts/restore.sh latest   # 최신 백업으로 복구. 확인 프롬프트 있음
```

`scripts/backup.sh`는 `pg_dump --format=custom`으로 뜬 뒤 S3에 업로드한다. S3 버킷은 버전관리+`backup_retention_days`(기본 30일) 수명주기가 걸려 있다(`terraform/storage.tf`).

---

## 7. 프런트엔드 구조

빌드 도구 없음(Vite/React 등 미사용) — 브라우저가 `public/app.js`를 ES module로 그대로 로드한다.

```
app.js              최상위 렌더 루프, topbar/weekbar, 대시보드/리뷰/회고작성 화면
session.js          /api/me 결과를 보관하는 세션 싱글턴 + role 체크 헬퍼
views/customers.js  담당 고객사 (파트 필터, tier/MCR/주요고객, 추가 시 confirm)
views/schedule.js   팀 일정 + 휴일 관리 (월 전환 미구현, 위 "알려진 제한" 참고)
views/compLeave.js  대체휴가
views/organization.js  조직 관리 (파트/role 변경, admin만)
icons.js            lucide 아이콘 SVG 헬퍼
```

상태는 각 모듈의 모듈 스코프 `state` 객체(전역 상태 관리 라이브러리 없음)이며, `render()`를 호출하면 `innerHTML`을 통째로 새로 그린다. React 같은 diff/재조정이 없으므로 화면이 커지면 느려질 수 있는데, 지금 규모(14명)에서는 문제되지 않는다.

---

## 8. 다른 에이전트/개발자가 유지보수할 때 체크리스트

1. **DB 스키마를 바꾼다면** `src/db.mjs`의 `schema`에 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로만 추가한다 — 컨테이너 재시작마다 `migrate()`가 실행되므로 멱등성이 필수다.
2. **API를 하나 추가/변경한다면** `src/server.mjs`에 라우트 추가 → `test/*.test.mjs`에 해당 테스트 작성(이 프로젝트는 TDD로 진행돼왔다, RED 확인 후 구현) → `npm test`로 40개+1 확인.
3. **프런트를 바꾼다면** 해당 `views/*.js` 또는 `app.js` 수정 후 `node --input-type=module --check < public/app.js`로 문법만 먼저 확인(브라우저 없이 빠르게 검증 가능).
4. **배포 반영은 자동이 아니다.** `git push`만으로는 EC2에 반영되지 않는다 — 위 "코드만 바꿔서 재배포할 때" 명령을 SSM으로 실행해야 실제 서비스에 반영된다.
5. **비밀값(POSTGRES_PASSWORD, SESSION_SECRET, SLACK_CLIENT_SECRET)은 절대 git에 커밋하지 않는다.** `.env`, `terraform.tfvars`는 `.gitignore`에 이미 걸려 있다.
6. **compose.yaml의 `${POSTGRES_PASSWORD}` 같은 변수 참조를 터미널 도구로 확인할 때, 화면에 `***`처럼 마스킹되어 보일 수 있다.** 이건 표시상의 마스킹일 뿐 실제 파일 내용이 아니므로, 의심되면 `python3 -c "print(open('compose.yaml','rb').read())"`처럼 raw bytes로 확인할 것 — 파일을 함부로 다시 쓰지 말 것.
