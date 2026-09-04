#!/usr/bin/env bash
# S3에서 pg_dump 백업 파일을 가져와 PostgreSQL 컨테이너에 복원한다.
# 사용법: scripts/restore.sh <s3-key 또는 latest>
# 필수 환경변수: BACKUP_S3_BUCKET (예: msp-weekly-review-backups)
# 선택 환경변수: BACKUP_S3_PREFIX (기본 backups)
#
# 주의: 이 스크립트는 기존 msp 데이터베이스를 통째로 덮어씁니다. 되돌릴 수 없습니다.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET 환경변수가 필요합니다. 예: export BACKUP_S3_BUCKET=msp-weekly-review-backups}"
prefix="${BACKUP_S3_PREFIX:-backups}"
target="${1:-}"

if [ -z "$target" ]; then
  echo "사용법: scripts/restore.sh <s3-key 또는 latest>" >&2
  exit 1
fi

if [ "$target" = "latest" ]; then
  key="$(aws s3api list-objects-v2 --bucket "$BACKUP_S3_BUCKET" --prefix "${prefix}/" \
    --query 'sort_by(Contents,&LastModified)[-1].Key' --output text)"
  if [ -z "$key" ] || [ "$key" = "None" ]; then
    echo "[restore] ${prefix}/ 안에 백업 파일이 없습니다." >&2
    exit 1
  fi
else
  key="${prefix}/${target}"
fi

filename="$(basename "$key")"
local_path="/tmp/${filename}"

echo "[restore] 복원 대상: s3://${BACKUP_S3_BUCKET}/${key}"
read -r -p "기존 msp 데이터베이스를 덮어씁니다. 계속하시겠습니까? (yes 입력) " confirm
if [ "$confirm" != "yes" ]; then
  echo "[restore] 취소했습니다."
  exit 1
fi

aws s3 cp "s3://${BACKUP_S3_BUCKET}/${key}" "$local_path" --only-show-errors
docker compose cp "$local_path" "db:/tmp/${filename}"

echo "[restore] pg_restore 실행 중..."
docker compose exec -T db pg_restore -U msp -d msp --clean --if-exists "/tmp/${filename}"
docker compose exec -T db rm -f "/tmp/${filename}"
rm -f "$local_path"

echo "[restore] 완료했습니다. 앱 컨테이너를 재기동해 연결을 갱신하세요: docker compose restart app"
