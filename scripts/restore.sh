#!/usr/bin/env bash
# 기존 DB를 교체한다. 실패 시 단일 트랜잭션으로 롤백하고 앱을 다시 시작한다.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET 환경변수가 필요합니다.}"
prefix="${BACKUP_S3_PREFIX:-backups}"
target="${1:?사용법: scripts/restore.sh <파일명|S3 key|latest>}"
if [[ "$target" == latest ]]; then
  key="$(aws s3api list-objects-v2 --bucket "$BACKUP_S3_BUCKET" --prefix "${prefix}/" --query 'sort_by(Contents[?ends_with(Key, `.dump`)], &LastModified)[-1].Key' --output text)"
  [[ -n "$key" && "$key" != None ]] || { echo '백업이 없습니다.' >&2; exit 1; }
elif [[ "$target" == */* ]]; then
  key="$target"
else
  key="${prefix}/${target}"
fi
echo "[restore] 대상: s3://${BACKUP_S3_BUCKET}/${key}"
read -r -p '기존 DB를 교체합니다. 계속하려면 yes 입력: ' confirm
[[ "$confirm" == yes ]] || exit 1
temp_dir="$(mktemp -d)"
local_path="$temp_dir/restore.dump"
restart_app=false
cleanup() {
  local status=$?
  if [[ "$restart_app" == true ]]; then docker compose start app || status=1; fi
  rm -f "$local_path"
  rmdir "$temp_dir"
  exit "$status"
}
trap cleanup EXIT
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${key}" "$local_path" --only-show-errors
docker compose exec -T db pg_restore --list < "$local_path" > /dev/null
if [[ -n "$(docker compose ps --status running -q app)" ]]; then
  restart_app=true
  docker compose stop app
fi
# 쓰기를 중지한 현재 DB를 보존한다. 백업 실패 시 복원하지 않는다.
bash scripts/backup.sh
docker compose exec -T db pg_restore -U msp -d msp --clean --if-exists --exit-on-error --single-transaction < "$local_path"
echo '[restore] DB 복원 완료. 실행 중이던 앱을 다시 시작합니다.'
