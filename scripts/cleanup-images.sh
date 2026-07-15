#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./production-common.sh
source "${SCRIPT_DIR}/production-common.sh"

current_file="${PROJECT_ROOT}/.deploy/current"
previous_file="${PROJECT_ROOT}/.deploy/previous"
current_release=""
previous_release=""

if [[ -s "${current_file}" ]]; then
  current_release="$(<"${current_file}")"
fi
if [[ -s "${previous_file}" ]]; then
  previous_release="$(<"${previous_file}")"
fi
if [[ ! "${current_release}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Current release is missing or invalid; refusing to clean application images." >&2
  exit 1
fi
if [[ -n "${previous_release}" && ! "${previous_release}" =~ ^[0-9a-f]{40}$ ]]; then
  previous_release=""
fi

cleanup_repository() {
  local repository="$1"
  local reference tag

  while IFS= read -r reference; do
    [[ -n "${reference}" ]] || continue
    tag="${reference##*:}"
    if [[ "${tag}" == "${current_release}" || "${tag}" == "${previous_release}" ]]; then
      continue
    fi

    if ! docker image rm "${reference}" >/dev/null; then
      echo "Warning: could not remove image ${reference}; it may still be in use." >&2
    else
      echo "Removed old application image: ${reference}"
    fi
  done < <(docker image ls --filter "reference=${repository}:*" --format '{{.Repository}}:{{.Tag}}')
}

cleanup_repository "${TCR_REGISTRY}/${TCR_NAMESPACE}/${WEB_IMAGE}"
cleanup_repository "${TCR_REGISTRY}/${TCR_NAMESPACE}/${BACKEND_IMAGE}"
docker image prune --force >/dev/null

echo "Application image cleanup completed; current and previous releases were kept."
