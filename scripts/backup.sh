#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./production-common.sh
source "${SCRIPT_DIR}/production-common.sh"

BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="${BACKUP_DIR}/qingzhuan-${timestamp}.dump"
temporary_path="${backup_path}.partial"

mkdir -p "${BACKUP_DIR}"
trap 'rm -f "${temporary_path}"' EXIT

compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  >"${temporary_path}"

if [[ ! -s "${temporary_path}" ]]; then
  echo "Database backup is empty; refusing to keep it." >&2
  exit 1
fi

mv "${temporary_path}" "${backup_path}"
trap - EXIT
echo "Database backup created: ${backup_path}"
