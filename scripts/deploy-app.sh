#!/usr/bin/env bash
# 2단계 배포 스크립트: EC2에 인프라(Docker/buildx/리포지토리)가 준비된 뒤,
# 실제 퍼블릭 IP를 알고 있는 상태에서 .env를 생성하고 docker compose up까지 실행한다.
# EC2 안에서 직접 실행한다 (SSM Session Manager로 접속 후, 또는 SSM send-command로).
#
# 사용법 (EC2 내부, root):
#   APP_PUBLIC_URL=http://<EC2 퍼블릭 IP 또는 도메인> \
#   POSTGRES_PASSWORD=... SESSION_SECRET=... \
#   SLACK_CLIENT_ID=... SLACK_CLIENT_SECRET=... ALLOWED_SLACK_TEAM_ID=... \
#   BACKUP_S3_BUCKET=... \
#   ./scripts/deploy-app.sh
set -euo pipefail

: "${APP_PUBLIC_URL:?APP_PUBLIC_URL이 필요합니다. 예: http://13.209.16.42 또는 http://msp.example.com}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD가 필요합니다.}"
: "${SESSION_SECRET:?SESSION_SECRET이 필요합니다. openssl rand -hex 32 로 생성.}"

app_dir=/opt/msp-weekly-review
cd "$app_dir"

cat > .env <<ENV_EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
APP_PORT=80
SLACK_CLIENT_ID=${SLACK_CLIENT_ID:-}
SLACK_CLIENT_SECRET=${SLACK_CLIENT_SECRET:-}
SLACK_REDIRECT_URI=${APP_PUBLIC_URL}/auth/slack/callback
SESSION_SECRET=${SESSION_SECRET}
ALLOWED_SLACK_TEAM_ID=${ALLOWED_SLACK_TEAM_ID:-}
BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
ENV_EOF
chmod 600 .env

# compose.yaml의 ports 매핑("${APP_PORT}:3000")이 호스트 80번을 컨테이너 3000번(내부 PORT)에 직접 바인딩한다.
/usr/local/bin/docker-compose up --build -d

echo "[deploy-app] 완료. 확인: curl ${APP_PUBLIC_URL}/health"
echo "[deploy-app] Slack Redirect URL로 등록할 값: ${APP_PUBLIC_URL}/auth/slack/callback"
