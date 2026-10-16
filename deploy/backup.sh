#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

set -a
source /etc/imkon/backup.env
set +a

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="$BACKUP_DIRECTORY/nightly-$timestamp.dump"

mkdir -p "$BACKUP_DIRECTORY"
IMAGE_TAG="$(cat "$IMKON_DATA_DIR/current_release")" compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$dump_file.partial"
mv "$dump_file.partial" "$dump_file"

restic backup --tag db "$dump_file"
restic backup --tag storage "$IMKON_DATA_DIR/storage"
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

find "$BACKUP_DIRECTORY" -name 'nightly-*.dump' -mtime +7 -delete
log "Backup finished: $dump_file"
