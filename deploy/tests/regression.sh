#!/usr/bin/env bash
set -euo pipefail

test_script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$test_script_directory/deployment.sh"
bash "$test_script_directory/alerts.sh"
bash "$test_script_directory/restore_drill.sh"
bash "$test_script_directory/release.sh"
bash "$test_script_directory/runbook.sh"
printf 'PASS 51 regression cases; evidence: %s\n' "${EVIDENCE_DIRECTORY:-$HOME/.local/state/imkon-remediation/prod3}"
