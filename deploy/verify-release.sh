#!/usr/bin/env bash
set -euo pipefail

release_sha="${1:?Full commit SHA required}"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid release SHA" >&2; exit 1; }
repository="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"

comparison="$(gh api "repos/$repository/compare/main...$release_sha" --jq '.status')"
case "$comparison" in
  behind|identical) ;;
  *) echo "Release SHA is not contained in main" >&2; exit 1 ;;
esac

ci_passed="$(gh api "repos/$repository/actions/workflows/ci.yml/runs?head_sha=$release_sha&branch=main&event=push&per_page=100" \
  --jq '(.workflow_runs | sort_by(.run_number, .run_attempt) | last) | .status == "completed" and .conclusion == "success"')"
[[ "$ci_passed" == true ]] || { echo "Latest CI run for release SHA on main did not pass" >&2; exit 1; }
printf 'Verified main ancestry and successful CI for %s\n' "$release_sha"
