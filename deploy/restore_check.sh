#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

set -a
source /etc/imkon/backup.env
set +a

work_directory="$(mktemp -d)"
network_name="imkon-restore-check-$$"
database_container="imkon-restore-check-db-$$"
release_tag="$(cat "$IMKON_DATA_DIR/current_release")"
image="ghcr.io/compilelord/inkon_crm-api:$release_tag"

cleanup() {
  docker rm -f "$database_container" > /dev/null 2>&1 || true
  docker network rm "$network_name" > /dev/null 2>&1 || true
  rm -rf "$work_directory"
}
trap cleanup EXIT

restic restore latest --tag db --target "$work_directory"
dump_file="$(find "$work_directory" -name '*.dump' | sort | tail -n 1)"
[[ -n "$dump_file" ]] || { echo "No dump found in latest db snapshot" >&2; exit 1; }

docker network create "$network_name" > /dev/null
docker run -d --name "$database_container" --network "$network_name" \
  -e POSTGRES_USER=restore -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=restore \
  postgres:16-alpine > /dev/null

until docker exec "$database_container" pg_isready -U restore -d restore > /dev/null 2>&1; do
  sleep 2
done

docker exec -i "$database_container" pg_restore -U restore -d restore --no-owner < "$dump_file"

docker run --rm --network "$network_name" --env-file /etc/imkon/backend.env \
  -e "DATABASE_URL=postgresql+asyncpg://restore:restore@$database_container:5432/restore" \
  "$image" alembic current

user_count="$(docker exec "$database_container" psql -U restore -d restore -tAc 'select count(*) from users')"
revision_count="$(docker exec "$database_container" psql -U restore -d restore -tAc 'select count(*) from alembic_version')"
log "Restore check passed: users=$user_count alembic_versions=$revision_count"
