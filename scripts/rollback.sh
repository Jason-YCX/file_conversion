#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./production-common.sh
source "${SCRIPT_DIR}/production-common.sh"

current_file="${PROJECT_ROOT}/.deploy/current"
previous_file="${PROJECT_ROOT}/.deploy/previous"
target_release="${1:-}"

if [[ -z "${target_release}" && -f "${previous_file}" ]]; then
  target_release="$(<"${previous_file}")"
fi
if [[ -z "${target_release}" ]]; then
  echo "No rollback target recorded. Pass an image tag explicitly." >&2
  exit 1
fi
if [[ ! "${target_release}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Rollback target must be a full 40-character Git commit SHA." >&2
  exit 1
fi

current_release=""
if [[ -f "${current_file}" ]]; then
  current_release="$(<"${current_file}")"
fi

echo "Backing up PostgreSQL before application rollback..."
"${SCRIPT_DIR}/backup.sh"
"${SCRIPT_DIR}/check-certificates.sh"

export APP_VERSION="${target_release}"
echo "Pulling rollback release ${target_release} from Tencent TCR..."
compose --profile tools pull web api worker migrate
compose up -d --no-build web api worker caddy

if ! "${SCRIPT_DIR}/healthcheck.sh"; then
  compose ps >&2
  compose logs --tail=100 web api worker caddy >&2
  echo "Rollback target did not pass health checks." >&2
  exit 1
fi

if [[ "${current_release}" =~ ^[0-9a-f]{40}$ && "${current_release}" != "${target_release}" ]]; then
  printf '%s\n' "${current_release}" >"${previous_file}"
fi
printf '%s\n' "${target_release}" >"${current_file}"

if ! "${SCRIPT_DIR}/cleanup-images.sh"; then
  echo "Warning: application image cleanup did not complete." >&2
fi

echo "Application rollback completed: ${target_release}"
