#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/fixtures.sh"

export BACKEND_ENVIRONMENT_FILE="$test_directory/backend.env"
: > "$BACKEND_ENVIRONMENT_FILE"
printf 'bbbbbbb\n' > "$IMKON_DATA_DIR/current_release"
export TEST_STORAGE_SOURCE="$test_directory/storage-source"
mkdir -p "$TEST_STORAGE_SOURCE"
printf 'document\n' > "$TEST_STORAGE_SOURCE/document"

cat > "$test_directory/bin/restic" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'restic|%s\n' "$*" >> "$TEST_COMMAND_LOG"
target="${@: -1}"
mkdir -p "$target"
case "$*" in
  *'--tag db'*)
    [[ "$TEST_SCENARIO" == empty_dump ]] && : > "$target/nightly.dump" || printf 'dump\n' > "$target/nightly.dump"
    ;;
  *'--tag storage'*)
    case "$TEST_SCENARIO" in
      missing_storage_archive) ;;
      unreadable_storage_archive) printf 'not a tar archive' > "$target/storage.tar" ;;
      empty_storage_archive) mkdir -p "$TEST_EMPTY_SOURCE" && tar -C "$TEST_EMPTY_SOURCE" -cf "$target/storage.tar" . ;;
      *) tar -C "$TEST_STORAGE_SOURCE" -cf "$target/storage.tar" . ;;
    esac
    ;;
esac
STUB
cat > "$test_directory/bin/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'docker|%s\n' "$*" >> "$TEST_COMMAND_LOG"
case "$*" in
  *psql*"to_regclass('public.$TEST_MISSING_TABLE')"*) printf 'f\n' ;;
  *psql*to_regclass*) printf 't\n' ;;
  *psql*'from users') [[ "$TEST_SCENARIO" == empty_users ]] && printf '0\n' || printf '3\n' ;;
  *psql*'from alembic_version')
    case "$TEST_SCENARIO" in
      no_revision) printf '0\n' ;;
      two_revisions) printf '2\n' ;;
      *) printf '1\n' ;;
    esac
    ;;
  *psql*'from '*) printf '5\n' ;;
  *'pg_restore'*) cat > /dev/null ;;
esac
STUB
chmod +x "$test_directory/bin/"*
export TEST_MISSING_TABLE=none TEST_EMPTY_SOURCE="$test_directory/empty-source"

run_drill() {
  : > "$TEST_COMMAND_LOG"
  bash "$repository_directory/deploy/restore_check.sh" > "$test_directory/drill-$TEST_SCENARIO.log" 2>&1
}

export TEST_SCENARIO=success
run_drill
grep -Fq 'restic|restore latest --tag db --target' "$TEST_COMMAND_LOG"
grep -Fq 'restic|restore latest --tag storage --target' "$TEST_COMMAND_LOG"
grep -Fq 'Restore check passed: storage_files=1 users=3 courses=5 enrollments=5 charges=5 journals=5 journal_entries=5 audit_logs=5 refresh_tokens=5 alembic_version=1' "$test_directory/drill-success.log"
! grep -Fq 'imkon_db' "$TEST_COMMAND_LOG"
printf 'PASS restore drill success\n'

expect_failure() {
  export TEST_SCENARIO="$1"
  if run_drill; then
    exit 1
  fi
  grep -Fq "$2" "$test_directory/drill-$TEST_SCENARIO.log"
  ! grep -Fq 'Restore check passed' "$test_directory/drill-$TEST_SCENARIO.log"
  printf 'PASS restore drill fails: %s\n' "$1"
}

expect_failure empty_dump 'Dump in latest db snapshot is empty'
expect_failure empty_users 'Restored users table is empty'
expect_failure no_revision 'alembic_version has 0 rows, expected exactly 1'
expect_failure two_revisions 'alembic_version has 2 rows, expected exactly 1'
expect_failure missing_storage_archive 'No storage.tar found'
expect_failure unreadable_storage_archive 'storage.tar is unreadable'
expect_failure empty_storage_archive 'storage.tar contains no files'

for missing_table in users courses enrollments charges journals journal_entries audit_logs refresh_tokens alembic_version; do
  export TEST_MISSING_TABLE="$missing_table"
  expect_failure missing_table "Restored database is missing table $missing_table"
done
