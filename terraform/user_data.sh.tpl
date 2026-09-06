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

# 여기서는 인프라(Docker/buildx/리포지토리)만 준비한다. .env 생성과 docker compose up은
# 실제 퍼블릭 IP를 알아야 하는 값(SLACK_REDIRECT_URI)이 있으므로 사람이 apply 완료 후
# terraform output으로 IP를 확인한 뒤, scripts/deploy-app.sh를 SSM Session Manager로
# 실행해서 마무리한다. (README 참고)
echo "[user_data] infra ready. Run scripts/deploy-app.sh via SSM to start the app." > /opt/msp-weekly-review/.infra-ready
