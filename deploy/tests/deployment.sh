#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/fixtures.sh"

for scenario in start caddy health worker success; do
  export TEST_SCENARIO="$scenario"
  : > "$TEST_COMMAND_LOG"
  printf 'aaaaaaa\n' > "$IMKON_DATA_DIR/current_release"
  printf 'unchanged\n' > "$IMKON_DATA_DIR/previous_release"
  if bash "$repository_directory/deploy/deploy.sh" bbbbbbb > "$test_directory/deploy-$scenario.log" 2>&1; then
    [[ "$scenario" == success ]]
    [[ "$(cat "$IMKON_DATA_DIR/current_release")" == bbbbbbb ]]
    [[ "$(cat "$IMKON_DATA_DIR/previous_release")" == aaaaaaa ]]
    grep -Fq 'bbbbbbb|up -d --force-recreate --no-deps --wait --wait-timeout 1 api worker' "$TEST_COMMAND_LOG"
  else
    [[ "$scenario" != success ]]
    [[ "$(cat "$IMKON_DATA_DIR/current_release")" == aaaaaaa ]]
    [[ "$(cat "$IMKON_DATA_DIR/previous_release")" == unchanged ]]
    grep -Fq 'aaaaaaa|up -d --force-recreate --no-deps --wait api worker' "$TEST_COMMAND_LOG"
    grep -Fq 'aaaaaaa|up -d caddy' "$TEST_COMMAND_LOG"
  fi
  printf 'PASS deployment %s\n' "$scenario"
done

export TEST_SCENARIO=success
: > "$TEST_COMMAND_LOG"
bash "$repository_directory/deploy/deploy.sh" bbbbbbb > "$test_directory/deploy-repair-order.log" 2>&1
repair_line="$(grep -nF 'bbbbbbb|run --rm --no-deps api python -m scripts.repair_alembic_version' "$TEST_COMMAND_LOG" | cut -d: -f1)"
upgrade_line="$(grep -nF 'bbbbbbb|run --rm --no-deps api alembic upgrade head' "$TEST_COMMAND_LOG" | cut -d: -f1)"
[[ "$upgrade_line" -eq "$((repair_line + 1))" ]]
printf 'PASS repair immediately precedes migration\n'

export TEST_SCENARIO=repair
: > "$TEST_COMMAND_LOG"
if bash "$repository_directory/deploy/deploy.sh" bbbbbbb > "$test_directory/deploy-repair-refused.log" 2>&1; then
  exit 1
fi
! grep -Fq 'api alembic upgrade head' "$TEST_COMMAND_LOG"
! grep -Fq 'up -d --force-recreate' "$TEST_COMMAND_LOG"
printf 'PASS repair refusal blocks migration and restart\n'

export TEST_SCENARIO=success
: > "$TEST_COMMAND_LOG"
bash "$repository_directory/deploy/deploy.sh" --skip-migrations bbbbbbb > "$test_directory/deploy-skip-repair.log" 2>&1
! grep -Fq 'scripts.repair_alembic_version' "$TEST_COMMAND_LOG"
! grep -Fq 'api alembic upgrade head' "$TEST_COMMAND_LOG"
printf 'PASS skip migrations skips repair\n'

awk '/^  worker:/{worker=1;next} /^  db:/{worker=0} worker{print}' "$repository_directory/deploy/docker-compose.prod.yml" > "$test_directory/worker.yml"
grep -Fq 'test: ["CMD", "arq", "--check", "app.workers.settings.WorkerSettings"]' "$test_directory/worker.yml"
grep -Fq 'timeout: 30s' "$test_directory/worker.yml"
printf 'PASS worker healthcheck configuration\n'

for scenario in success archive restic; do
  export TEST_SCENARIO="$scenario"
  : > "$TEST_COMMAND_LOG"
  if bash "$repository_directory/deploy/backup.sh" > "$test_directory/backup-$scenario.log" 2>&1; then
    [[ "$scenario" == success ]]
    [[ "$(tar -xOf "$TEST_ARCHIVE" ./document)" == test-only ]]
    grep -Fq 'bbbbbbb|run --rm --no-deps -T --user 10001:10001 api tar -C /app/storage -cf - .' "$TEST_COMMAND_LOG"
    grep -Fq 'restic|forget --group-by host,tags --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune' "$TEST_COMMAND_LOG"
  else
    [[ "$scenario" != success ]]
    ! grep -Fq 'restic|forget ' "$TEST_COMMAND_LOG"
  fi
  printf 'PASS storage backup %s\n' "$scenario"
done
