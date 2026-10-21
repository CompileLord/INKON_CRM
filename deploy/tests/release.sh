#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/fixtures.sh"

cat > "$test_directory/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'gh|%s\n' "$*" >> "$TEST_COMMAND_LOG"
case "$2" in
  "repos/example/crm/compare/main...bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
    [[ "$TEST_SCENARIO" != api_error ]]
    if [[ "$TEST_SCENARIO" == outside_main ]]; then printf 'ahead\n'; else printf 'behind\n'; fi
    ;;
  'repos/example/crm/actions/workflows/ci.yml/runs?head_sha=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&branch=main&event=push&per_page=100')
    case "$TEST_SCENARIO" in
      ci_failed) response='{"workflow_runs":[{"run_number":2,"run_attempt":1,"status":"completed","conclusion":"failure"},{"run_number":1,"run_attempt":1,"status":"completed","conclusion":"success"}]}' ;;
      ci_missing) response='{"workflow_runs":[]}' ;;
      ci_pending) response='{"workflow_runs":[{"run_number":1,"run_attempt":1,"status":"in_progress","conclusion":null}]}' ;;
      *) response='{"workflow_runs":[{"run_number":1,"run_attempt":1,"status":"completed","conclusion":"success"}]}' ;;
    esac
    printf '%s\n' "$response" | jq -r "$4"
    ;;
  *) exit 99 ;;
esac
STUB
chmod +x "$test_directory/bin/gh"

for scenario in success outside_main ci_failed ci_missing ci_pending api_error; do
  export TEST_SCENARIO="$scenario"
  if bash "$repository_directory/deploy/verify-release.sh" bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb > "$test_directory/gate-$scenario.log" 2>&1; then
    [[ "$scenario" == success ]]
  else
    [[ "$scenario" != success ]]
  fi
  printf 'PASS release gate %s\n' "$scenario"
done
if bash "$repository_directory/deploy/verify-release.sh" bad > "$test_directory/gate-invalid.log" 2>&1; then exit 1; fi
printf 'PASS release gate invalid SHA\n'

for workflow in build-image deploy-backend; do
  workflow_file="$repository_directory/.github/workflows/$workflow.yml"
  grep -Fq '  actions: read' "$workflow_file"
  grep -Fq '          ref: main' "$workflow_file"
  grep -Fq 'bash deploy/verify-release.sh' "$workflow_file"
  if [[ "$workflow" == build-image ]]; then
    [[ "$(grep -n 'bash deploy/verify-release.sh' "$workflow_file" | cut -d: -f1)" -lt "$(grep -n 'uses: docker/login-action' "$workflow_file" | cut -d: -f1)" ]]
  else
    [[ "$(grep -n 'bash deploy/verify-release.sh' "$workflow_file" | cut -d: -f1)" -lt "$(grep -n 'echo "sha=' "$workflow_file" | cut -d: -f1)" ]]
  fi
  printf 'PASS workflow %s release gate\n' "$workflow"
done
