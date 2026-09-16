#!/usr/bin/env bash
# Build/publish only the report image. Terraform owns all resources and deployment.
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
: "${AWS_REGION:=ap-northeast-2}"
repository="$(terraform -chdir=terraform output -raw monthly_digest_ecr_url)"
[[ "$repository" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/[a-z0-9/_-]+$ ]] || {
  echo '먼저 enable_monthly_digest=true로 Terraform 저장소를 준비하세요.' >&2
  exit 1
}
registry="${repository%%/*}"
account="$(aws sts get-caller-identity --query Account --output text)"
[[ "$registry" == "$account.dkr.ecr.$AWS_REGION.amazonaws.com" ]] || {
  echo 'Terraform 출력과 현재 AWS 계정/리전이 다릅니다.' >&2
  exit 1
}
tag="$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$registry"
docker buildx build --platform linux/amd64 --provenance=false --push \
  --tag "$repository:$tag" services/monthly-digest
digest="$(aws ecr describe-images --region "$AWS_REGION" --repository-name "${repository#*/}" \
  --image-ids "imageTag=$tag" --query 'imageDetails[0].imageDigest' --output text)"
[[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo '이미지 digest를 확인하지 못했습니다.' >&2; exit 1; }
printf '\nterraform.tfvars에 설정할 값:\nmonthly_digest_image_uri = "%s@%s"\n' "$repository" "$digest"
