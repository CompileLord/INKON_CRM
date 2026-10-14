# WP-10 — Guard destructive reset tooling and remove fixed credentials

Phase **1** · Priority **Critical** · Effort **M** · Status **todo**

## Goal

Guard destructive reset tooling and remove fixed credentials. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **DATA-01** (Critical:): Critical: Destructive reset scripts have no environment boundary and install a known administrator password. [DATA-01 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-01--critical-destructive-reset-scripts-have-no-environment-boundary-and-install-a-known-administrator-password). Verification: Confirmed destructive configured-target scripts and fixed privileged seed; operator invocation prerequisite.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/scripts/clean_db.py:42](../../../backend/scripts/clean_db.py) | Existing file, anchor line 42; only this WP’s stated behavior may change. |
| [backend/scripts/seed_demo_data.py:170](../../../backend/scripts/seed_demo_data.py) | Existing file, anchor line 170; only this WP’s stated behavior may change. |
| [backend/scripts/reset_guard.py](../../../backend/scripts/reset_guard.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp10.py](../../../backend/app/tests/integration/test_remediation_wp10.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-10.md](../results/WP-10.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/scripts/clean_db.py:42–63](../../../backend/scripts/clean_db.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/scripts/seed_demo_data.py:170–195](../../../backend/scripts/seed_demo_data.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/scripts/clean_db.py`:

```text
42: async def clean_database():
43:     logger.info("Cleaning database completely...")
44: 
45:     async with engine.begin() as conn:
46:         for tbl in TABLES:
47:             await conn.execute(text(f"TRUNCATE TABLE {tbl} RESTART IDENTITY CASCADE;"))
48: 
49:     logger.info("Database truncated successfully.")
```

## Step-by-step change

1. Introduce an explicit disposable-target guard shared by both scripts; refuse production, require --reset plus expected database/storage identity and offer dry-run without secrets.
2. Remove fixed privileged passwords and credential logging; generate a one-time credential requiring change or use secure interactive provisioning.
3. Stage downloadable assets before reset and make database reset/seeding transactional where feasible; constrain storage deletion to an explicit disposable root.

## Tests to write BEFORE the fix

- Before fixing, run scripts with DB/filesystem doubles and verify production, missing flag, wrong target and unsafe storage fail before any side effect. Inject seed/download failure and validate retained original state or documented bounded recovery.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp10.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

Critical rule: capture the reproducing failure **before** implementation, then demonstrate the same assertion passes afterward. No skip/xfail, weakened assertion or response-shape-only substitute. If reproducing evidence contradicts this plan, stop and report.

## Acceptance criteria

No default invocation truncates data, no fixed privileged credential remains, and dry-run reveals only safe target metadata.

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

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-10-reset-safety` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-10.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
