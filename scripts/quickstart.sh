#!/usr/bin/env bash
# 인프라 plan만 생성. 비밀값은 Terraform에 저장하지 않는다.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here/terraform"
[[ -f terraform.tfvars ]] || { echo 'terraform.tfvars.example을 terraform.tfvars로 복사하고 인프라 값을 채우세요.' >&2; exit 1; }
terraform init -input=false
terraform validate
terraform plan -input=false -out=quickstart.tfplan
printf '%s\n' 'plan 생성 완료. 검토 후 terraform 디렉터리에서 terraform apply quickstart.tfplan 실행.' 'apply 이후에는 README의 2단계 앱 배포를 별도로 진행해야 합니다.'
