#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

set -a
source "${BACKUP_CONFIGURATION_FILE:-/etc/imkon/backup.env}"
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
[[ -s "$dump_file" ]] || { echo "Dump in latest db snapshot is empty" >&2; exit 1; }

restic restore latest --tag storage --target "$work_directory/storage"
storage_archive="$(find "$work_directory/storage" -name 'storage.tar' | sort | tail -n 1)"
[[ -n "$storage_archive" ]] || { echo "No storage.tar found in latest storage snapshot" >&2; exit 1; }
tar -tf "$storage_archive" > /dev/null || { echo "storage.tar is unreadable" >&2; exit 1; }
storage_file_count="$(tar -tvf "$storage_archive" | awk '/^-/{count++} END{print count+0}')"
[[ "$storage_file_count" -ge 1 ]] || { echo "storage.tar contains no files" >&2; exit 1; }

docker network create "$network_name" > /dev/null
docker run -d --name "$database_container" --network "$network_name" \
  -e POSTGRES_USER=restore -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=restore \
  postgres:16-alpine > /dev/null

until docker exec "$database_container" pg_isready -U restore -d restore > /dev/null 2>&1; do
  sleep 2
done

docker exec -i "$database_container" pg_restore -U restore -d restore --no-owner < "$dump_file"

docker run --rm --network "$network_name" --env-file "${BACKEND_ENVIRONMENT_FILE:-/etc/imkon/backend.env}" \
  -e "DATABASE_URL=postgresql+asyncpg://restore:restore@$database_container:5432/restore" \
  "$image" alembic current

psql_restore() {
  docker exec "$database_container" psql -U restore -d restore -tAc "$1"
}

table_counts=""
for table_name in users courses enrollments charges journals journal_entries audit_logs refresh_tokens alembic_version; do
  table_exists="$(psql_restore "select to_regclass('public.$table_name') is not null")"
  [[ "$table_exists" == t ]] || { echo "Restored database is missing table $table_name" >&2; exit 1; }
  row_count="$(psql_restore "select count(*) from $table_name")"
  table_counts="$table_counts $table_name=$row_count"
  case "$table_name" in
    users) [[ "$row_count" -ge 1 ]] || { echo "Restored users table is empty" >&2; exit 1; } ;;
    alembic_version) [[ "$row_count" -eq 1 ]] || { echo "alembic_version has $row_count rows, expected exactly 1" >&2; exit 1; } ;;
  esac
done
log "Restore check passed: storage_files=$storage_file_count$table_counts"
