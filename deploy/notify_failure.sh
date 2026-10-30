#!/usr/bin/env bash
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

failed_unit="${1:-}"
if [[ ! "$failed_unit" =~ ^[A-Za-z0-9@._-]+$ ]]; then
  echo "ALERT DELIVERY FAILED: invalid unit name" >&2
  exit 2
fi

configuration_file="${BACKUP_CONFIGURATION_FILE:-/etc/imkon/backup.env}"
extra_emails=""
extra_phones=""
secret_values=()
if [[ -r "$configuration_file" ]]; then
  source "$configuration_file"
  extra_emails="${BACKUP_ALERT_EMAIL:-}"
  extra_phones="${BACKUP_ALERT_PHONE:-}"
  while IFS= read -r variable_name; do
    if [[ "$variable_name" =~ (PASSWORD|SECRET|KEY|TOKEN) && -n "${!variable_name:-}" ]]; then
      secret_values+=("${!variable_name}")
    fi
  done < <(sed -nE 's/^(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=.*/\2/p' "$configuration_file")
fi

journal_excerpt="$(journalctl -u "$failed_unit" -n 15 --no-pager -o cat 2>&1 || true)"
[[ -n "$journal_excerpt" ]] || journal_excerpt="(no journal lines available)"
for secret_value in "${secret_values[@]}"; do
  journal_excerpt="${journal_excerpt//"$secret_value"/[redacted]}"
done

host_name="$(hostname)"
failure_time="$(date -u +%FT%TZ)"
subject="[IMKON] $failed_unit failed on $host_name"
message="Host: $host_name
Unit: $failed_unit
Time (UTC): $failure_time

Last journal lines:
$journal_excerpt"

if ! IMAGE_TAG="$(cat "$IMKON_DATA_DIR/current_release" 2> /dev/null)" || [[ -z "$IMAGE_TAG" ]]; then
  echo "ALERT DELIVERY FAILED: no current release recorded, cannot run the alert container for $failed_unit" >&2
  exit 1
fi
export IMAGE_TAG

if ! compose run --rm --no-deps -T \
  -e "BACKUP_ALERT_EMAIL=$extra_emails" -e "BACKUP_ALERT_PHONE=$extra_phones" \
  api python -m scripts.notify_admins --subject "$subject" --message "$message"; then
  echo "ALERT DELIVERY FAILED: $failed_unit failure at $failure_time could not be sent to any superadmin or configured alert recipient" >&2
  exit 1
fi
log "Failure alert sent for $failed_unit"
