#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./production-common.sh
source "${SCRIPT_DIR}/production-common.sh"

"${SCRIPT_DIR}/check-certificates.sh"

if ! compose ps --status running --services | grep -Fqx caddy; then
  echo "Caddy is not running; use the production deploy command for the initial start." >&2
  exit 1
fi

compose exec -T caddy caddy validate \
  --config /etc/caddy/Caddyfile \
  --adapter caddyfile
compose exec -T caddy caddy reload \
  --config /etc/caddy/Caddyfile \
  --adapter caddyfile

echo "Caddy reloaded all three production certificates."
