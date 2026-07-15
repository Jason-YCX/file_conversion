#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${PROJECT_ROOT}/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-${PROJECT_ROOT}/compose.production.yaml}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing production environment file: ${ENV_FILE}" >&2
  echo "Copy .env.production.example to .env.production and fill in real values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${APP_DOMAIN:?APP_DOMAIN is required in .env.production}"
: "${API_DOMAIN:?API_DOMAIN is required in .env.production}"
: "${FILES_DOMAIN:?FILES_DOMAIN is required in .env.production}"
: "${TCR_REGISTRY:?TCR_REGISTRY is required in .env.production}"
: "${TCR_NAMESPACE:?TCR_NAMESPACE is required in .env.production}"
: "${WEB_IMAGE:?WEB_IMAGE is required in .env.production}"
: "${BACKEND_IMAGE:?BACKEND_IMAGE is required in .env.production}"

WEB_HOST_PORT="${WEB_HOST_PORT:-13000}"
API_HOST_PORT="${API_HOST_PORT:-14000}"
MINIO_HOST_PORT="${MINIO_HOST_PORT:-19000}"
MAX_UPLOAD_BYTES="${MAX_UPLOAD_BYTES:-52428800}"
export WEB_HOST_PORT API_HOST_PORT MINIO_HOST_PORT MAX_UPLOAD_BYTES

current_release_file="${PROJECT_ROOT}/.deploy/current"
if [[ -z "${APP_VERSION:-}" && -s "${current_release_file}" ]]; then
  APP_VERSION="$(<"${current_release_file}")"
  export APP_VERSION
fi

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}
