#!/usr/bin/env bash
# EC2 최초 부팅 시 1회 실행: Docker 설치 → 리포지토리 git clone → .env 생성 → docker compose up.
# 이 스크립트만으로 EC2 한 대에서 앱+DB가 실제로 동작하는 상태가 된다.
set -euo pipefail

dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user

curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
mkdir -p /usr/libexec/docker/cli-plugins
ln -sf /usr/local/bin/docker-compose /usr/libexec/docker/cli-plugins/docker-compose

app_dir=/opt/msp-weekly-review
if [ -d "$app_dir/.git" ]; then
  git -C "$app_dir" fetch --depth 1 origin "${repo_ref}"
  git -C "$app_dir" checkout "${repo_ref}"
  git -C "$app_dir" reset --hard "origin/${repo_ref}"
else
  rm -rf "$app_dir"
  git clone --depth 1 --branch "${repo_ref}" "${repo_url}" "$app_dir"
fi

cat > "$app_dir/.env" <<ENV_EOF
POSTGRES_PASSWORD=${postgres_password}
APP_PORT=${app_port}
SLACK_CLIENT_ID=${slack_client_id}
SLACK_CLIENT_SECRET=${slack_client_secret}
SLACK_REDIRECT_URI=${slack_redirect_uri}
SESSION_SECRET=${session_secret}
ALLOWED_SLACK_TEAM_ID=${allowed_slack_team_id}
BACKUP_S3_BUCKET=${backup_s3_bucket}
ENV_EOF
chmod 600 "$app_dir/.env"

cd "$app_dir"
# 80번 포트로 받아 컨테이너 내부 app_port로 넘긴다.
iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port "${app_port}" || true
/usr/local/bin/docker-compose up --build -d
