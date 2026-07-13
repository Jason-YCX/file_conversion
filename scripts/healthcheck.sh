#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./production-common.sh
source "${SCRIPT_DIR}/production-common.sh"

HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://${API_DOMAIN}/api/v1/health}"
HEALTHCHECK_ATTEMPTS="${HEALTHCHECK_ATTEMPTS:-60}"
HEALTHCHECK_INTERVAL_SECONDS="${HEALTHCHECK_INTERVAL_SECONDS:-5}"

for ((attempt = 1; attempt <= HEALTHCHECK_ATTEMPTS; attempt += 1)); do
  response="$(curl --fail --silent --show-error --max-time 10 "${HEALTHCHECK_URL}" 2>/dev/null || true)"
  if [[ "${response}" == *'"status":"ok"'* && "${response}" == *'"conversionEngine":"enabled"'* ]]; then
    echo "Production health check passed: ${HEALTHCHECK_URL}"
    exit 0
  fi

  if ((attempt < HEALTHCHECK_ATTEMPTS)); then
    sleep "${HEALTHCHECK_INTERVAL_SECONDS}"
  fi
done

echo "Production health check failed: ${HEALTHCHECK_URL}" >&2
exit 1
