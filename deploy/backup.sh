#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

set -a
source "${BACKUP_CONFIGURATION_FILE:-/etc/imkon/backup.env}"
set +a

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="$BACKUP_DIRECTORY/nightly-$timestamp.dump"

mkdir -p "$BACKUP_DIRECTORY"
export IMAGE_TAG="$(cat "$IMKON_DATA_DIR/current_release")"
compose exec -T db sh -c 'pg_dump -Fc -Z0 -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$dump_file.partial"
mv "$dump_file.partial" "$dump_file"

restic backup --compression max --tag db "$dump_file"
compose run --rm --no-deps -T --user 10001:10001 api tar -C /app/storage -cf - . |
  restic backup --tag storage --stdin --stdin-filename storage.tar
restic forget --group-by host,tags --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

find "$BACKUP_DIRECTORY" -name 'nightly-*.dump' -mtime +7 -delete
log "Backup finished: $dump_file"
