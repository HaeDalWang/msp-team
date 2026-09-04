#!/usr/bin/env bash
# PostgreSQL 컨테이너를 pg_dump로 백업하고 S3에 업로드한다.
# 필수 환경변수: BACKUP_S3_BUCKET (예: msp-weekly-review-backups)
# 선택 환경변수: BACKUP_S3_PREFIX (기본 backups), AWS_REGION
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET 환경변수가 필요합니다. 예: export BACKUP_S3_BUCKET=msp-weekly-review-backups}"
prefix="${BACKUP_S3_PREFIX:-backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
filename="msp-${timestamp}.dump"
local_path="/tmp/${filename}"

echo "[backup] db 컨테이너에서 pg_dump 실행 중..."
docker compose exec -T db pg_dump -U msp -d msp --format=custom --file="/tmp/${filename}"
docker compose cp "db:/tmp/${filename}" "$local_path"
docker compose exec -T db rm -f "/tmp/${filename}"

echo "[backup] S3에 업로드 중: s3://${BACKUP_S3_BUCKET}/${prefix}/${filename}"
aws s3 cp "$local_path" "s3://${BACKUP_S3_BUCKET}/${prefix}/${filename}" --only-show-errors

rm -f "$local_path"
echo "[backup] 완료: s3://${BACKUP_S3_BUCKET}/${prefix}/${filename}"
