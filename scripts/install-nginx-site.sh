#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./production-common.sh
source "${SCRIPT_DIR}/production-common.sh"

TEMPLATE_FILE="${NGINX_TEMPLATE_FILE:-${PROJECT_ROOT}/nginx/file-conversion.conf.template}"
SITE_NAME="${NGINX_SITE_NAME:-file-conversion}"
SITES_AVAILABLE_DIR="${NGINX_SITES_AVAILABLE_DIR:-/etc/nginx/sites-available}"
SITES_ENABLED_DIR="${NGINX_SITES_ENABLED_DIR:-/etc/nginx/sites-enabled}"
AVAILABLE_FILE="${SITES_AVAILABLE_DIR}/${SITE_NAME}.conf"
ENABLED_FILE="${SITES_ENABLED_DIR}/${SITE_NAME}.conf"

if [[ ! "${SITE_NAME}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "NGINX_SITE_NAME contains unsupported characters: ${SITE_NAME}" >&2
  exit 1
fi
if [[ ! -f "${TEMPLATE_FILE}" ]]; then
  echo "Missing Nginx template: ${TEMPLATE_FILE}" >&2
  exit 1
fi

validate_domain() {
  local name="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "${name} is not a valid hostname: ${value}" >&2
    exit 1
  fi
}

validate_port() {
  local name="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^[0-9]+$ ]] || ((10#${value} < 1 || 10#${value} > 65535)); then
    echo "${name} must be a TCP port from 1 to 65535: ${value}" >&2
    exit 1
  fi
}

validate_domain APP_DOMAIN "${APP_DOMAIN}"
validate_domain API_DOMAIN "${API_DOMAIN}"
validate_domain FILES_DOMAIN "${FILES_DOMAIN}"
validate_port WEB_HOST_PORT "${WEB_HOST_PORT}"
validate_port API_HOST_PORT "${API_HOST_PORT}"
validate_port MINIO_HOST_PORT "${MINIO_HOST_PORT}"
if [[ ! "${MAX_UPLOAD_BYTES}" =~ ^[0-9]+$ ]] || ((10#${MAX_UPLOAD_BYTES} < 1)); then
  echo "MAX_UPLOAD_BYTES must be a positive integer: ${MAX_UPLOAD_BYTES}" >&2
  exit 1
fi
if [[ "${PROJECT_ROOT}" == *$'\n'* || "${PROJECT_ROOT}" == *'"'* ]]; then
  echo "The project path cannot contain a newline or double quote." >&2
  exit 1
fi

"${SCRIPT_DIR}/check-certificates.sh"

if ((EUID == 0)); then
  USE_SUDO=0
elif [[ -d "${SITES_AVAILABLE_DIR}" && -w "${SITES_AVAILABLE_DIR}" && -d "${SITES_ENABLED_DIR}" && -w "${SITES_ENABLED_DIR}" ]]; then
  USE_SUDO=0
elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  USE_SUDO=1
else
  echo "Installing the Nginx site requires root or passwordless sudo access." >&2
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
if [[ -z "${NGINX_BIN}" ]]; then
  echo "Nginx is not installed or is not available in PATH." >&2
  exit 1
fi
if [[ -z "${SYSTEMCTL_BIN}" ]]; then
  echo "systemctl is required to reload the host Nginx service." >&2
  exit 1
fi

escape_sed_replacement() {
  sed 's/[&|\\]/\\&/g' <<<"$1"
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT
rendered_file="${tmpdir}/${SITE_NAME}.conf"

sed \
  -e "s|__APP_DOMAIN__|$(escape_sed_replacement "${APP_DOMAIN}")|g" \
  -e "s|__API_DOMAIN__|$(escape_sed_replacement "${API_DOMAIN}")|g" \
  -e "s|__FILES_DOMAIN__|$(escape_sed_replacement "${FILES_DOMAIN}")|g" \
  -e "s|__PROJECT_ROOT__|$(escape_sed_replacement "${PROJECT_ROOT}")|g" \
  -e "s|__WEB_HOST_PORT__|${WEB_HOST_PORT}|g" \
  -e "s|__API_HOST_PORT__|${API_HOST_PORT}|g" \
  -e "s|__MINIO_HOST_PORT__|${MINIO_HOST_PORT}|g" \
  -e "s|__MAX_UPLOAD_BYTES__|${MAX_UPLOAD_BYTES}|g" \
  "${TEMPLATE_FILE}" >"${rendered_file}"

available_existed=0
enabled_existed=0
if run_privileged test -e "${AVAILABLE_FILE}" || run_privileged test -L "${AVAILABLE_FILE}"; then
  run_privileged cp -a "${AVAILABLE_FILE}" "${tmpdir}/available.backup"
  available_existed=1
fi
if run_privileged test -e "${ENABLED_FILE}" || run_privileged test -L "${ENABLED_FILE}"; then
  run_privileged cp -a "${ENABLED_FILE}" "${tmpdir}/enabled.backup"
  enabled_existed=1
fi

restore_previous_config() {
  run_privileged rm -f "${ENABLED_FILE}"
  if ((enabled_existed == 1)); then
    run_privileged cp -a "${tmpdir}/enabled.backup" "${ENABLED_FILE}"
  fi

  if ((available_existed == 1)); then
    run_privileged cp -a "${tmpdir}/available.backup" "${AVAILABLE_FILE}"
  else
    run_privileged rm -f "${AVAILABLE_FILE}"
  fi
}

run_privileged install -d -m 0755 "${SITES_AVAILABLE_DIR}" "${SITES_ENABLED_DIR}"
run_privileged install -m 0644 "${rendered_file}" "${AVAILABLE_FILE}"
run_privileged rm -f "${ENABLED_FILE}"
run_privileged ln -s "${AVAILABLE_FILE}" "${ENABLED_FILE}"

nginx_test_output=""
if ! nginx_test_output="$(run_privileged "${NGINX_BIN}" -t 2>&1)"; then
  printf '%s\n' "${nginx_test_output}" >&2
  echo "Nginx configuration validation failed; restoring the previous site configuration." >&2
  restore_previous_config
  run_privileged "${NGINX_BIN}" -t || true
  exit 1
fi
printf '%s\n' "${nginx_test_output}"

for domain in "${APP_DOMAIN}" "${API_DOMAIN}" "${FILES_DOMAIN}"; do
  if grep -Fq "conflicting server name \"${domain}\"" <<<"${nginx_test_output}"; then
    echo "Another Nginx site already declares ${domain}; restoring the previous site configuration." >&2
    restore_previous_config
    run_privileged "${NGINX_BIN}" -t || true
    exit 1
  fi
done

if ! run_privileged "${SYSTEMCTL_BIN}" reload nginx; then
  echo "Nginx reload failed; restoring the previous site configuration." >&2
  restore_previous_config
  if run_privileged "${NGINX_BIN}" -t; then
    run_privileged "${SYSTEMCTL_BIN}" reload nginx || true
  fi
  exit 1
fi

echo "Nginx site installed and reloaded: ${AVAILABLE_FILE}"
