#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/fixtures.sh"

export TEST_SECRET_VALUE=hunter2-restic-secret
printf 'RESTIC_PASSWORD=%s\nBACKUP_ALERT_EMAIL=ops@example.com\nBACKUP_ALERT_PHONE=+992900000009\n' "$TEST_SECRET_VALUE" > "$BACKUP_CONFIGURATION_FILE"
printf 'bbbbbbb\n' > "$IMKON_DATA_DIR/current_release"

export TEST_SCENARIO=success
: > "$TEST_COMMAND_LOG"
bash "$repository_directory/deploy/notify_failure.sh" imkon-backup.service > "$test_directory/alert-success.log" 2>&1
grep -Fq 'bbbbbbb|run --rm --no-deps -T -e BACKUP_ALERT_EMAIL=ops@example.com -e BACKUP_ALERT_PHONE=+992900000009 api python -m scripts.notify_admins --subject [IMKON] imkon-backup.service failed on ' "$TEST_COMMAND_LOG"
grep -Fq 'Unit: imkon-backup.service' "$TEST_COMMAND_LOG"
grep -Eq 'Time \(UTC\): [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z' "$TEST_COMMAND_LOG"
grep -Fq "Host: $(hostname)" "$TEST_COMMAND_LOG"
grep -Fq 'journalctl|-u imkon-backup.service -n 15' "$TEST_COMMAND_LOG"
grep -Fq 'Backup step failed' "$TEST_COMMAND_LOG"
grep -Fq 'RESTIC_PASSWORD leaked: [redacted]' "$TEST_COMMAND_LOG"
! grep -Fq "$TEST_SECRET_VALUE" "$TEST_COMMAND_LOG" "$test_directory/alert-success.log"
printf 'PASS alert names host, unit, time and redacted journal\n'

export TEST_SCENARIO=journal_unavailable
: > "$TEST_COMMAND_LOG"
bash "$repository_directory/deploy/notify_failure.sh" imkon-restore-check.service > "$test_directory/alert-journal.log" 2>&1
grep -Fq 'Unit: imkon-restore-check.service' "$TEST_COMMAND_LOG"
printf 'PASS alert is still sent without journal access\n'

export TEST_SCENARIO=alert_delivery_fails
: > "$TEST_COMMAND_LOG"
if bash "$repository_directory/deploy/notify_failure.sh" imkon-backup.service > "$test_directory/alert-fails.log" 2>&1; then
  exit 1
fi
grep -Fq 'ALERT DELIVERY FAILED' "$test_directory/alert-fails.log"
printf 'PASS undeliverable alert exits non-zero and logs loudly\n'

export TEST_SCENARIO=success
: > "$TEST_COMMAND_LOG"
rm "$IMKON_DATA_DIR/current_release"
if bash "$repository_directory/deploy/notify_failure.sh" imkon-backup.service > "$test_directory/alert-norelease.log" 2>&1; then
  exit 1
fi
grep -Fq 'ALERT DELIVERY FAILED' "$test_directory/alert-norelease.log"
printf 'bbbbbbb\n' > "$IMKON_DATA_DIR/current_release"
printf 'PASS missing release marker exits non-zero and logs loudly\n'

: > "$TEST_COMMAND_LOG"
if bash "$repository_directory/deploy/notify_failure.sh" 'x; rm -rf /' > "$test_directory/alert-invalid.log" 2>&1; then
  exit 1
fi
[[ ! -s "$TEST_COMMAND_LOG" ]]
printf 'PASS invalid unit name is rejected\n'

: > "$TEST_COMMAND_LOG"
bash "$repository_directory/deploy/backup.sh" > "$test_directory/backup-no-alert.log" 2>&1
! grep -Fq 'scripts.notify_admins' "$TEST_COMMAND_LOG"
export TEST_SCENARIO=archive
if bash "$repository_directory/deploy/backup.sh" > "$test_directory/backup-fail.log" 2>&1; then
  exit 1
fi
printf 'PASS successful backup sends no alert and failed backup exits non-zero for OnFailure\n'

for unit in imkon-backup imkon-restore-check; do
  grep -Fxq "OnFailure=imkon-backup-alert@%n.service" "$repository_directory/deploy/systemd/$unit.service"
done
grep -Fxq 'ExecStart=/opt/imkon/deploy/notify_failure.sh %i' "$repository_directory/deploy/systemd/imkon-backup-alert@.service"
grep -Fq 'systemd/*.service' "$repository_directory/deploy/provision_vps.sh"
grep -Fq 'usermod -aG docker,systemd-journal' "$repository_directory/deploy/provision_vps.sh"
printf 'PASS systemd OnFailure wiring and provisioning\n'
