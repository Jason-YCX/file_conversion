#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./production-common.sh
source "${SCRIPT_DIR}/production-common.sh"

CERT_ROOT="${CERT_ROOT:-${PROJECT_ROOT}/certs}"
CERT_MIN_VALIDITY_SECONDS="${CERT_MIN_VALIDITY_SECONDS:-604800}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL is required to validate production certificates." >&2
  exit 1
fi

check_certificate() {
  local directory="$1"
  local domain="$2"
  local certificate="${CERT_ROOT}/${directory}/cert.pem"
  local private_key="${CERT_ROOT}/${directory}/key.pem"
  local wildcard_domain="*.${domain#*.}"
  local subject_alt_names
  local certificate_key_hash
  local private_key_hash
  local expires_at

  if [[ ! -s "${certificate}" ]]; then
    echo "Missing certificate: ${certificate}" >&2
    exit 1
  fi
  if [[ ! -s "${private_key}" ]]; then
    echo "Missing private key: ${private_key}" >&2
    exit 1
  fi

  openssl x509 -in "${certificate}" -noout >/dev/null
  openssl pkey -in "${private_key}" -noout >/dev/null

  if ! openssl x509 -in "${certificate}" -noout -checkend "${CERT_MIN_VALIDITY_SECONDS}" >/dev/null; then
    echo "Certificate expires too soon or has expired: ${certificate}" >&2
    exit 1
  fi

  subject_alt_names="$(
    openssl x509 -in "${certificate}" -text -noout |
      tr ',' '\n' |
      sed -n 's/.*DNS:\([^[:space:]]*\).*/\1/p'
  )"
  if ! grep -Fqx "${domain}" <<<"${subject_alt_names}" &&
    ! grep -Fqx "${wildcard_domain}" <<<"${subject_alt_names}"; then
    echo "Certificate does not cover ${domain}: ${certificate}" >&2
    exit 1
  fi

  certificate_key_hash="$(
    openssl x509 -in "${certificate}" -pubkey -noout |
      openssl pkey -pubin -outform DER 2>/dev/null |
      openssl dgst -sha256
  )"
  private_key_hash="$(
    openssl pkey -in "${private_key}" -pubout -outform DER 2>/dev/null |
      openssl dgst -sha256
  )"
  if [[ "${certificate_key_hash}" != "${private_key_hash}" ]]; then
    echo "Certificate and private key do not match for ${domain}." >&2
    exit 1
  fi

  expires_at="$(openssl x509 -in "${certificate}" -noout -enddate | cut -d= -f2-)"
  echo "Certificate valid: ${domain} (expires ${expires_at})"
}

check_certificate "qingzhuan" "${APP_DOMAIN}"
check_certificate "qingzhuan-api" "${API_DOMAIN}"
check_certificate "qingzhuan-files" "${FILES_DOMAIN}"
