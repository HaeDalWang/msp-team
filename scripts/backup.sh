#!/usr/bin/env bash
# BACKUP_S3_BUCKET 필수. systemd는 /etc/msp-weekly-review-backup.env에서 읽는다.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET 환경변수가 필요합니다.}"
prefix="${BACKUP_S3_PREFIX:-backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temp_dir="$(mktemp -d)"
local_path="$temp_dir/msp-${timestamp}.dump"
trap 'rm -f "$local_path"; rmdir "$temp_dir"' EXIT
docker compose exec -T db pg_dump -U msp -d msp --format=custom > "$local_path"
test -s "$local_path"
aws s3 cp "$local_path" "s3://${BACKUP_S3_BUCKET}/${prefix}/msp-${timestamp}.dump" --only-show-errors
echo "[backup] 완료: s3://${BACKUP_S3_BUCKET}/${prefix}/msp-${timestamp}.dump"
