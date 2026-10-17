#!/usr/bin/env bash
SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_CONFIGURATION_FILE="${DEPLOY_CONFIGURATION_FILE:-/etc/imkon/deploy.env}"

if [[ -f "$DEPLOY_CONFIGURATION_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$DEPLOY_CONFIGURATION_FILE"
  set +a
fi

export API_DOMAIN="${API_DOMAIN:-api-kitob-crm.shadowme.pro}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-imkon}"
export IMKON_DATA_DIR="${IMKON_DATA_DIR:-/var/lib/imkon}"
BACKUP_DIRECTORY="${BACKUP_DIRECTORY:-/var/backups/imkon}"
COMPOSE_FILE_PATH="$SCRIPT_DIRECTORY/docker-compose.prod.yml"

compose() {
  docker compose -f "$COMPOSE_FILE_PATH" "$@"
}

log() {
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"
}
