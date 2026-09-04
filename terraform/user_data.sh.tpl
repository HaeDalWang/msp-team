#!/usr/bin/env bash
# EC2 최초 부팅 시 1회 실행: Docker 설치 → 리포지토리 git clone → .env 생성 → docker compose up.
# 이 스크립트만으로 EC2 한 대에서 앱+DB가 실제로 동작하는 상태가 된다.
set -euo pipefail

dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user

mkdir -p /usr/libexec/docker/cli-plugins

curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -sf /usr/local/bin/docker-compose /usr/libexec/docker/cli-plugins/docker-compose

# `docker compose build`가 buildx 0.17.0 이상을 요구하므로 별도 설치한다(al2023 기본 이미지에는 없음).
buildx_arch="$(uname -m)"
case "$buildx_arch" in
  x86_64) buildx_arch="amd64" ;;
  aarch64) buildx_arch="arm64" ;;
esac
curl -SL "https://github.com/docker/buildx/releases/download/v0.19.2/buildx-v0.19.2.linux-$${buildx_arch}" \
  -o /usr/libexec/docker/cli-plugins/docker-buildx
chmod +x /usr/libexec/docker/cli-plugins/docker-buildx
# 다운로드가 실패하면(리다이렉트로 받은 HTML 등) ELF가 아니므로 여기서 조기에 실패시킨다.
file /usr/libexec/docker/cli-plugins/docker-buildx | grep -q ELF

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
APP_PORT=80
SLACK_CLIENT_ID=${slack_client_id}
SLACK_CLIENT_SECRET=${slack_client_secret}
SLACK_REDIRECT_URI=${slack_redirect_uri}
SESSION_SECRET=${session_secret}
ALLOWED_SLACK_TEAM_ID=${allowed_slack_team_id}
BACKUP_S3_BUCKET=${backup_s3_bucket}
ENV_EOF
chmod 600 "$app_dir/.env"

cd "$app_dir"
# compose.yaml의 ports 매핑("$${APP_PORT}:3000")이 호스트 80번을 컨테이너 3000번(내부 PORT)에 직접 바인딩한다.
# al2023 기본 이미지에는 iptables 커맨드가 없어 수동 PREROUTING 리다이렉트는 신뢰할 수 없다 — Docker의 표준 포트 게시로 대체.
/usr/local/bin/docker-compose up --build -d
