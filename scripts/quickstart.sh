#!/usr/bin/env bash
# 단일 명령 QuickStart: terraform.tfvars 값만 채우면 이 스크립트로 전체 인프라+앱을 배포한다.
# apply/destroy는 사람만 실행한다는 원칙에 따라, 이 스크립트는 plan까지만 자동 실행하고
# apply는 사람이 직접 확인 후 별도로 실행하도록 마지막에 안내한다.
#
# 사용법:
#   cd terraform
#   cp terraform.tfvars.example terraform.tfvars   # 값을 채운다
#   ../scripts/quickstart.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tf_dir="$here/terraform"
tfvars="$tf_dir/terraform.tfvars"

if [ ! -f "$tfvars" ]; then
  echo "[quickstart] $tfvars 가 없습니다." >&2
  echo "  cp terraform/terraform.tfvars.example terraform/terraform.tfvars 로 만든 뒤 값을 채워주세요." >&2
  exit 1
fi

# postgres_password / session_secret이 예시 그대로면(REPLACE_ME) 안전한 값으로 자동 생성해 채운다.
if grep -q '^postgres_password *= *"REPLACE_ME"' "$tfvars"; then
  generated_pw="$(openssl rand -hex 24)"
  sed -i.bak "s/^postgres_password *= *\"REPLACE_ME\"/postgres_password = \"${generated_pw}\"/" "$tfvars"
  rm -f "$tfvars.bak"
  echo "[quickstart] postgres_password를 자동 생성해 terraform.tfvars에 채웠습니다."
fi
if grep -q '^session_secret *= *"REPLACE_ME"' "$tfvars"; then
  generated_secret="$(openssl rand -hex 32)"
  sed -i.bak "s/^session_secret *= *\"REPLACE_ME\"/session_secret = \"${generated_secret}\"/" "$tfvars"
  rm -f "$tfvars.bak"
  echo "[quickstart] session_secret을 자동 생성해 terraform.tfvars에 채웠습니다."
fi

cd "$tf_dir"

echo "[quickstart] terraform init..."
terraform init -input=false

echo "[quickstart] terraform validate..."
terraform validate

echo "[quickstart] terraform plan (read-only)..."
terraform plan -input=false -out=quickstart.tfplan

cat <<EOF

[quickstart] plan 생성 완료: terraform/quickstart.tfplan
이 스크립트는 여기까지만 자동으로 실행합니다. apply/destroy는 사람이 직접 확인 후 실행해야 합니다.

인프라를 실제로 만들려면:
  cd terraform
  terraform apply quickstart.tfplan

apply가 끝나면 출력되는 app_public_ip로 접속하세요:
  curl http://<app_public_ip>/health

되돌리려면(주의: 모든 리소스와 데이터가 삭제됩니다):
  terraform destroy
EOF
