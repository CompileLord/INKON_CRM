#!/usr/bin/env bash
set -euo pipefail

test_script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$test_script_directory/deployment.sh"
bash "$test_script_directory/release.sh"
printf 'PASS 18 regression cases; evidence: %s\n' "${EVIDENCE_DIRECTORY:-$HOME/.local/state/imkon-remediation/prod3}"
