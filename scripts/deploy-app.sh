#!/usr/bin/env bash
# EC2에서 실행하는 2단계 HTTPS 앱 배포. DNS 연결은 먼저 완료해야 한다.
set -euo pipefail
: "${APP_DOMAIN:?DNS가 이 서버를 가리키는 APP_DOMAIN이 필요합니다.}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD가 필요합니다.}"
: "${SESSION_SECRET:?SESSION_SECRET이 필요합니다.}"
: "${SLACK_CLIENT_ID:?SLACK_CLIENT_ID가 필요합니다.}"
: "${SLACK_CLIENT_SECRET:?SLACK_CLIENT_SECRET가 필요합니다.}"
: "${ALLOWED_SLACK_TEAM_ID:?ALLOWED_SLACK_TEAM_ID가 필요합니다.}"
[[ "$APP_DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ && "$APP_DOMAIN" == *.* ]] || { echo 'APP_DOMAIN은 도메인이어야 합니다.' >&2; exit 1; }
# An already-running installation can have a password created by an earlier
# deployment.  Preserve it during an in-place upgrade; write_env below still
# rejects values that cannot be represented safely in the generated .env file.
[[ -n "$POSTGRES_PASSWORD" ]] || { echo 'POSTGRES_PASSWORD는 비어 있을 수 없습니다.' >&2; exit 1; }
[[ ${#SESSION_SECRET} -ge 32 ]] || { echo 'SESSION_SECRET은 32자 이상이어야 합니다.' >&2; exit 1; }
app_dir=/opt/msp-weekly-review
cd "$app_dir"
# A legacy HTTP deployment may export APP_PORT=80 before this script runs.
# Caddy owns host port 80 in production, so never inherit that host binding.
unset APP_PORT
if [[ -e .env ]]; then
  echo '기존 .env가 있습니다. 기존 설정을 보존하고 docker compose up --build -d --wait를 사용하세요.' >&2
  exit 1
fi
umask 077
write_env() {
  local key="$1" value="$2"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* && "$value" != *"'"* ]] || { echo "허용하지 않는 환경변수 문자: $key" >&2; return 1; }
  printf "%s='%s'\n" "$key" "$value"
}
env_tmp="$(mktemp "$app_dir/.env.XXXXXX")"
trap 'rm -f "$env_tmp"' EXIT
{
  write_env COMPOSE_FILE compose.yaml:compose.production.yaml
  write_env APP_DOMAIN "$APP_DOMAIN"
  write_env APP_BIND_ADDRESS 127.0.0.1
  write_env NODE_ENV production
  write_env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  write_env SESSION_SECRET "$SESSION_SECRET"
  write_env SLACK_CLIENT_ID "$SLACK_CLIENT_ID"
  write_env SLACK_CLIENT_SECRET "$SLACK_CLIENT_SECRET"
  write_env SLACK_REDIRECT_URI "https://${APP_DOMAIN}/auth/slack/callback"
  write_env ALLOWED_SLACK_TEAM_ID "$ALLOWED_SLACK_TEAM_ID"
  write_env BACKUP_S3_BUCKET "${BACKUP_S3_BUCKET:-}"
} > "$env_tmp"
mv "$env_tmp" .env
docker compose up --build -d --wait --wait-timeout 180
echo "[deploy-app] Slack Redirect URL: https://${APP_DOMAIN}/auth/slack/callback"
echo "[deploy-app] 확인: curl --fail https://${APP_DOMAIN}/health"
echo '[deploy-app] 정기 백업은 README의 systemd 설정을 완료하세요.'
