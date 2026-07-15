#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Tracked files have local changes; refusing to pull over them." >&2
    exit 1
  fi
  git pull --ff-only
fi

requested_release="${APP_VERSION:-}"

# shellcheck source=./production-common.sh
source "${SCRIPT_DIR}/production-common.sh"

release="${requested_release:-$(git rev-parse HEAD)}"
export APP_VERSION="${release}"

mkdir -p "${PROJECT_ROOT}/.deploy"
current_file="${PROJECT_ROOT}/.deploy/current"
previous_file="${PROJECT_ROOT}/.deploy/previous"
current_release=""
if [[ -f "${current_file}" ]]; then
  current_release="$(<"${current_file}")"
fi

echo "Validating production configuration..."
compose config --quiet
"${SCRIPT_DIR}/check-certificates.sh"

echo "Pulling release ${release} from Tencent TCR..."
compose --profile tools pull web api worker migrate

echo "Starting production infrastructure..."
compose up -d postgres redis minio minio-init

echo "Backing up PostgreSQL before migrations..."
"${SCRIPT_DIR}/backup.sh"

echo "Applying database migrations..."
compose --profile tools run --rm migrate

echo "Updating application services..."
compose up -d --no-build --remove-orphans web api worker

echo "Installing and reloading the host Nginx site..."
"${SCRIPT_DIR}/install-nginx-site.sh"

if ! "${SCRIPT_DIR}/healthcheck.sh"; then
  compose ps >&2
  compose logs --tail=100 web api worker >&2
  echo "Deployment did not pass health checks. Previous images were kept for rollback." >&2
  exit 1
fi

if [[ "${current_release}" != "${release}" ]]; then
  if [[ "${current_release}" =~ ^[0-9a-f]{40}$ ]]; then
    printf '%s\n' "${current_release}" >"${previous_file}"
  else
    rm -f "${previous_file}"
  fi
fi
printf '%s\n' "${release}" >"${current_file}"

if ! "${SCRIPT_DIR}/cleanup-images.sh"; then
  echo "Warning: application image cleanup did not complete." >&2
fi

echo "Production deployment completed: ${release}"
