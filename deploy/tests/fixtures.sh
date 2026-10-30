#!/usr/bin/env bash
set -euo pipefail

repository_directory="${REPOSITORY_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
evidence_directory="${EVIDENCE_DIRECTORY:-$HOME/.local/state/imkon-remediation/prod3}"
mkdir -p "$evidence_directory"
test_directory="$(mktemp -d "$evidence_directory/regression.XXXXXX")"
mkdir -p "$test_directory/bin" "$test_directory/data" "$test_directory/backups" "$test_directory/uploads"
export PATH="$test_directory/bin:$PATH"
export TEST_COMMAND_LOG="$test_directory/commands.log"
export IMKON_DATA_DIR="$test_directory/data"
export BACKUP_DIRECTORY="$test_directory/backups"
export DEPLOY_CONFIGURATION_FILE="$test_directory/missing.env"
export BACKUP_CONFIGURATION_FILE="$test_directory/backup.env"
export HEALTH_TIMEOUT_SECONDS=1
export TEST_UPLOAD_DIRECTORY="$test_directory/uploads"
export TEST_ARCHIVE="$test_directory/storage.tar"
export GITHUB_REPOSITORY=example/crm
printf 'test-only\n' > "$TEST_UPLOAD_DIRECTORY/document"
chmod 600 "$TEST_UPLOAD_DIRECTORY/document"
: > "$BACKUP_CONFIGURATION_FILE"

cat > "$test_directory/bin/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == compose && "$2" == -f ]]
shift 3
printf '%s|%s\n' "${IMAGE_TAG:-unset}" "$*" >> "$TEST_COMMAND_LOG"
case "$*" in
  'run --rm --no-deps api python -m scripts.repair_alembic_version')
    [[ "$TEST_SCENARIO" != repair ]]
    ;;
  'up -d --force-recreate --no-deps --wait --wait-timeout '* )
    [[ "$*" == *' api worker' ]]
    [[ "$TEST_SCENARIO" != start && "$TEST_SCENARIO" != worker ]]
    ;;
  'up -d --force-recreate --no-deps api worker')
    [[ "$TEST_SCENARIO" != start ]]
    ;;
  'up -d caddy')
    [[ "$TEST_SCENARIO" != caddy || "$IMAGE_TAG" == aaaaaaa ]]
    ;;
  'run --rm --no-deps -T -e BACKUP_ALERT_EMAIL='*' api python -m scripts.notify_admins --subject '*)
    [[ "$TEST_SCENARIO" != alert_delivery_fails ]]
    ;;
  'run --rm --no-deps -T --user 10001:10001 api tar -C /app/storage -cf - .')
    [[ "$TEST_SCENARIO" != archive ]]
    tar -C "$TEST_UPLOAD_DIRECTORY" -cf - .
    ;;
  exec*) printf 'dump\n' ;;
esac
STUB
cat > "$test_directory/bin/curl" <<'STUB'
#!/usr/bin/env bash
[[ "$TEST_SCENARIO" != health ]]
STUB
cat > "$test_directory/bin/journalctl" <<'STUB'
#!/usr/bin/env bash
printf 'journalctl|%s\n' "$*" >> "$TEST_COMMAND_LOG"
[[ "$TEST_SCENARIO" != journal_unavailable ]] || exit 1
printf 'Backup step failed\nRESTIC_PASSWORD leaked: %s\n' "$TEST_SECRET_VALUE"
STUB
cat > "$test_directory/bin/sleep" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat > "$test_directory/bin/restic" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'restic|%s\n' "$*" >> "$TEST_COMMAND_LOG"
if [[ "$*" == 'backup --tag storage --stdin --stdin-filename storage.tar' ]]; then
  cat > "$TEST_ARCHIVE"
  [[ "$TEST_SCENARIO" != restic ]]
fi
STUB
chmod +x "$test_directory/bin/"*
