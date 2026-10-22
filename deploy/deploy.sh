#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SKIP_MIGRATIONS=false
REGISTER_WEBHOOK=false
RELEASE_TAG=""

for argument in "$@"; do
  case "$argument" in
    --skip-migrations) SKIP_MIGRATIONS=true ;;
    --register-webhook) REGISTER_WEBHOOK=true ;;
    -*) echo "Unknown option: $argument" >&2; exit 64 ;;
    *) RELEASE_TAG="$argument" ;;
  esac
done

CURRENT_RELEASE_FILE="$IMKON_DATA_DIR/current_release"
PREVIOUS_RELEASE_FILE="$IMKON_DATA_DIR/previous_release"
HEALTH_URL="${HEALTH_URL:-https://$API_DOMAIN/health}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-60}"

if [[ "$REGISTER_WEBHOOK" == true ]]; then
  IMAGE_TAG="$(cat "$CURRENT_RELEASE_FILE")" compose exec -T api python -m scripts.register_telegram_webhook
  exit 0
fi

if [[ ! "$RELEASE_TAG" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: deploy.sh [--skip-migrations] <commit-sha>" >&2
  exit 64
fi

mkdir -p "$BACKUP_DIRECTORY"
exec 9>"$IMKON_DATA_DIR/deploy.lock"
flock -n 9 || { echo "Another deployment is running" >&2; exit 75; }

previous_release=""
if [[ -f "$CURRENT_RELEASE_FILE" ]]; then
  previous_release="$(cat "$CURRENT_RELEASE_FILE")"
fi

wait_for_health() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 5 "$HEALTH_URL" > /dev/null; then
      return 0
    fi
    sleep 3
  done
  return 1
}

roll_back_to_previous_release() {
  if [[ -z "$previous_release" ]]; then
    log "No previous release recorded; leaving the failed release in place"
    return
  fi
  log "Rolling back to $previous_release"
  IMAGE_TAG="$previous_release" compose up -d --force-recreate --no-deps --wait api worker
  IMAGE_TAG="$previous_release" compose up -d caddy
}

export IMAGE_TAG="$RELEASE_TAG"

log "Pulling images for $RELEASE_TAG"
compose pull api worker caddy db redis

log "Validating database connection budget and topology"
compose run --rm --no-deps --entrypoint python api -m app.db.connection_policy

log "Starting data services"
compose up -d --wait db redis

log "Writing pre-deploy database dump"
compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$BACKUP_DIRECTORY/pre-$RELEASE_TAG.dump.partial"
mv "$BACKUP_DIRECTORY/pre-$RELEASE_TAG.dump.partial" "$BACKUP_DIRECTORY/pre-$RELEASE_TAG.dump"
find "$BACKUP_DIRECTORY" -name 'pre-*.dump' -mtime +14 -delete

if [[ "$SKIP_MIGRATIONS" == true ]]; then
  log "Skipping migrations"
else
  log "Running migrations"
  compose run --rm --no-deps api python -m scripts.repair_alembic_version
  compose run --rm --no-deps api alembic upgrade head
fi

log "Starting api and worker"
if ! compose up -d --force-recreate --no-deps --wait --wait-timeout "$HEALTH_TIMEOUT_SECONDS" api worker ||
   ! compose up -d caddy ||
   ! wait_for_health; then
  log "Release startup or health verification failed at $HEALTH_URL"
  roll_back_to_previous_release
  exit 1
fi

if [[ -n "$previous_release" && "$previous_release" != "$RELEASE_TAG" ]]; then
  printf '%s\n' "$previous_release" > "$PREVIOUS_RELEASE_FILE"
fi
printf '%s\n' "$RELEASE_TAG" > "$CURRENT_RELEASE_FILE"
log "Release $RELEASE_TAG is live"
