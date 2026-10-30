#!/usr/bin/env bash
set -euo pipefail

repository_directory="${REPOSITORY_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

grep -Fq 'export IMAGE_TAG=$(cat /var/lib/imkon/current_release)' "$repository_directory/deploy/RUNBOOK.md"
printf 'PASS restore IMAGE_TAG export\n'
grep -Fq 'Removing a key early makes its queued payloads unreadable' "$repository_directory/deploy/RUNBOOK.md"
printf 'PASS outbox key rotation warning\n'
grep -Fq 'tar -xpf /tmp/storage-restore/storage.tar -C /var/lib/imkon/storage' "$repository_directory/deploy/RUNBOOK.md"
printf 'PASS storage archive restore procedure\n'
grep -Fq 'OnFailure=imkon-backup-alert@%n.service' "$repository_directory/deploy/RUNBOOK.md"
printf 'PASS failure alert documentation\n'
grep -Fq 'BACKUP_ALERT_EMAIL' "$repository_directory/deploy/RUNBOOK.md"
printf 'PASS alert fallback documentation\n'
