# WP-47 — Remove credentials from provisioning output and argv

Phase **3** · Priority **Medium** · Effort **S** · Status **todo**

## Goal

Remove credentials from provisioning output and argv. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **SEC-DATA-03** (Medium): Bootstrap and administrator provisioning expose secrets to logs and process arguments. [SEC-DATA-03 — report section](../../backendsecurityaudit/03-data-infrastructure-security-audit.md#sec-data-03--bootstrap-and-administrator-provisioning-expose-secrets-to-logs-and-process-arguments). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/scripts/setup_free_tier_vm.sh:34](../../../backend/scripts/setup_free_tier_vm.sh) | Existing file, anchor line 34; only this WP’s stated behavior may change. |
| [backend/scripts/seed_admin.py:20](../../../backend/scripts/seed_admin.py) | Existing file, anchor line 20; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp47.py](../../../backend/app/tests/integration/test_remediation_wp47.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/scripts/setup_free_tier_vm.sh:34–40,65–68](../../../backend/scripts/setup_free_tier_vm.sh) — current source range checked during planning. Context does not grant write ownership.
- [backend/scripts/seed_admin.py:20–22,70–89](../../../backend/scripts/seed_admin.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/scripts/setup_free_tier_vm.sh`:

```text
34: $CONTAINER_CLI run -d \
35:     --name imkon_db \
36:     --restart always \
37:     -p "${POSTGRES_PORT}:5432" \
38:     -e POSTGRES_USER="${POSTGRES_USER}" \
39:     -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
40:     -e POSTGRES_DB="${POSTGRES_DB}" \
41:     -v /var/lib/imkon/postgres_data:/var/lib/postgresql/data \
```

## Step-by-step change

1. Replace printed password/DSN values with status metadata; use restricted secret files and POSTGRES_PASSWORD_FILE.
2. Accept admin password via stdin/file descriptor for automation and getpass interactively; avoid value-bearing command arguments and preserve validation.

## Tests to write BEFORE the fix

- Capture dummy-credential stdout/stderr/argv and assert the value is absent; invalid protected-file permissions fail safely; interactive and stdin provisioning validate inputs.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp47.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Provisioning does not disclose password values through intended logs or process arguments.

- The file allowlist is respected and all required checks have actual results recorded.
- Security, money, authorization, version and transaction invariants remain intact; no broader redesign is hidden in this PR.
- A failing gate is recorded as blocked, not done; no audit finding is closed solely because code changed.

## How to verify

Use the available system environment, as permitted by current AGENTS.md. Backend verification must use the Python version declared by `backend/Dockerfile` (currently Python 3.12); Conda is optional. A passing suite under another Python version does not establish deployment compatibility.

Before and after the change, using the dedicated disposable runtime from WP-01/WP-09:

```bash
cd /workspace/INKON_CRM/backend
PYTHONDONTWRITEBYTECODE=1 python -m pytest app/tests -q -p no:cacheprovider
cd /workspace/INKON_CRM/frontend
npx vitest run
npx tsc --noEmit
```

Also run the targeted tests described here. Configure test storage/temp output and service targets **before imports**; the original fixture drops a PostgreSQL schema and flushes application-configured Redis. Never run it against ordinary shared services. Record exact commands, exit codes, baseline failures and new failures in this WP’s concise STATUS.md row. No test result in this plan is an executed remediation result. Do not claim success from historical onboarding. Existing unrelated frontend/typecheck failures must be recorded and escalated, not silently fixed outside scope.


Verification focuses on the exact behavioral/security tests above. No speculative performance benchmark is required.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-10, WP-13.

Required shared-file / migration ordering:
- WP-13 → WP-47: `backend/scripts/setup_free_tier_vm.sh`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**S**: localized change or narrowly scoped evidence collection.

Use branch `remediation/wp-47-provisioning-secrets` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
