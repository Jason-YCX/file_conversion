#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./production-common.sh
source "${SCRIPT_DIR}/production-common.sh"

"${SCRIPT_DIR}/check-certificates.sh"

if ((EUID == 0)); then
  USE_SUDO=0
elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  USE_SUDO=1
else
  echo "Reloading Nginx requires root or passwordless sudo access." >&2
  exit 1
fi

run_privileged() {
  if ((USE_SUDO == 1)); then
    sudo -n "$@"
  else
    "$@"
  fi
}

NGINX_BIN="${NGINX_BIN:-$(command -v nginx || true)}"
if [[ -z "${NGINX_BIN}" && -x /usr/sbin/nginx ]]; then
  NGINX_BIN=/usr/sbin/nginx
fi
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-$(command -v systemctl || true)}"
if [[ -z "${NGINX_BIN}" || -z "${SYSTEMCTL_BIN}" ]]; then
  echo "Nginx and systemctl are required to reload production certificates." >&2
  exit 1
fi

SITE_NAME="${NGINX_SITE_NAME:-file-conversion}"
SITES_ENABLED_DIR="${NGINX_SITES_ENABLED_DIR:-/etc/nginx/sites-enabled}"
if ! run_privileged test -e "${SITES_ENABLED_DIR}/${SITE_NAME}.conf"; then
  echo "The production Nginx site is not installed; run npm run nginx:install first." >&2
  exit 1
fi

run_privileged "${NGINX_BIN}" -t
run_privileged "${SYSTEMCTL_BIN}" reload nginx

echo "Nginx reloaded all three production certificates."
