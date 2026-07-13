#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./production-common.sh
source "${SCRIPT_DIR}/production-common.sh"

backup_path="${1:-}"
if [[ -z "${backup_path}" || ! -f "${backup_path}" ]]; then
  echo "Usage: CONFIRM_RESTORE=yes ./scripts/restore.sh /path/to/backup.dump" >&2
  exit 1
fi
if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "Restore replaces current database contents. Set CONFIRM_RESTORE=yes to continue." >&2
  exit 1
fi

echo "Stopping API and worker during database restore..."
compose stop api worker

restart_application() {
  compose start api worker >/dev/null 2>&1 || true
}
trap restart_application EXIT

compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' \
  <"${backup_path}"

compose start api worker
trap - EXIT
"${SCRIPT_DIR}/healthcheck.sh"

echo "Database restore completed: ${backup_path}"
