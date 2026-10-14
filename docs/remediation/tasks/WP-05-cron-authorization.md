# WP-05 — Fail closed for scheduler authentication

Phase **1** · Priority **Critical** · Effort **S** · Status **todo**

## Goal

Fail closed for scheduler authentication. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **API-03** (Critical:): Critical: Scheduler endpoints disable authentication when configuration is missing. [API-03 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-03--critical-scheduler-endpoints-disable-authentication-when-configuration-is-missing). Verification: Confirmed missing-secret fail-open branch; actual deployed secret unknown.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/api/v1/cron.py:9](../../../backend/app/api/v1/cron.py) | Existing file, anchor line 9; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp05.py](../../../backend/app/tests/integration/test_remediation_wp05.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-05.md](../results/WP-05.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/api/v1/cron.py:9–14,17–32](../../../backend/app/api/v1/cron.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/api/v1/cron.py`:

```text
9: def verify_cron_secret(x_cloud_scheduler_secret: Optional[str] = Header(None)) -> None:
10:     if settings.CRON_SECRET and x_cloud_scheduler_secret != settings.CRON_SECRET:
11:         raise HTTPException(
12:             status_code=status.HTTP_401_UNAUTHORIZED,
13:             detail="Invalid or missing scheduler authorization token"
14:         )
15: 
16: 
```

## Step-by-step change

1. Centralize a router dependency that rejects absent/empty configured secrets and absent/wrong headers.
2. Use constant-time comparison for configured credentials and preserve the existing route contract; unavailable configuration must never open maintenance actions.

## Tests to write BEFORE the fix

- For both cron routes test unset, empty, absent header, wrong header and correct secret before implementation; spy that unauthorized requests never invoke jobs.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp05.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

Critical rule: capture the reproducing failure **before** implementation, then demonstrate the same assertion passes afterward. No skip/xfail, weakened assertion or response-shape-only substitute. If reproducing evidence contradicts this plan, stop and report.

## Acceptance criteria

Only authenticated scheduler calls invoke maintenance; no configuration-dependent bypass.

- The file allowlist is respected and all required checks have actual results recorded.
- Security, money, authorization, version and transaction invariants remain intact; no broader redesign is hidden in this PR.
- A failing gate is recorded as blocked, not done; no audit finding is closed solely because code changed.

## How to verify

Activate the repository Conda **base** environment (never create a venv):

```bash
source /workspace/miniconda3/etc/profile.d/conda.sh
conda activate base
```

Before and after the change, using the dedicated disposable runtime from WP-01/WP-09:

```bash
cd /workspace/INKON_CRM/backend
PYTHONDONTWRITEBYTECODE=1 python -m pytest app/tests -q -p no:cacheprovider
cd /workspace/INKON_CRM/frontend
npx vitest run
npx tsc --noEmit
```

Also run the targeted tests described here. Configure test storage/temp output and service targets **before imports**; the original fixture drops a PostgreSQL schema and flushes application-configured Redis. Never run it against ordinary shared services. Record exact commands, exit codes, baseline failures and new failures in this WP’s result file. No test result in this plan is an executed remediation result. Do not claim success from historical onboarding. Existing unrelated frontend/typecheck failures must be recorded and escalated, not silently fixed outside scope.


Verification focuses on the exact behavioral/security tests above. No speculative performance benchmark is required.

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-02.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**S**: localized change or narrowly scoped evidence collection.

Use branch `remediation/wp-05-cron-authorization` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-05.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
