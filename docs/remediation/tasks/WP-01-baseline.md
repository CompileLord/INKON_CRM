# WP-01 — Record an isolated integration-test baseline

Phase **0** · Priority **Baseline** · Effort **S** · Status **todo**

## Goal

Record an isolated integration-test baseline. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

This is an enabling, contributor or verification package; it does not independently own a source finding.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/tests/conftest.py:10-28,59-80](../../../backend/app/tests/conftest.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/core/security.py:60-72](../../../backend/app/core/security.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/main.py:67-70](../../../backend/app/main.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:736-770](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/tests/conftest.py`:

```text
10: TEST_DATABASE_URL = "postgresql+asyncpg://linguist_user:linguist_pass_2024@localhost:5432/imkon_test_db"
11: 
12: test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool, future=True)
13: TestingSessionLocal = async_sessionmaker(
14:     bind=test_engine,
15:     class_=AsyncSession,
16:     expire_on_commit=False,
17:     autocommit=False,
```

## Step-by-step change

1. Inspect test targets before importing the app: conftest hardcodes localhost:5432/imkon_test_db and imports Redis from app settings. Use an isolated disposable runtime/network where that PostgreSQL target belongs solely to this run; never repoint or stop an existing service to make room.
2. Set process-only TESTING=true, isolated REDIS_URL and a temporary STORAGE_PATH, plus synthetic required settings before collection; disable bytecode and direct pytest/cache/temp outputs to a disposable test workspace. Run the existing suite unchanged.
3. Record commit, versions, target identities without credentials, exact commands, exit codes and every failing test. Historical 100-pass onboarding is not this baseline.

No runtime/source edits in this WP. The future test runner may create isolated disposable services; this planning session does not execute it. Safety isolation is required even before WP-09 permanently fixes fixtures.

## Tests to write BEFORE the fix

- Preflight must demonstrate that PostgreSQL schema deletion and Redis FLUSHDB can touch only this disposable runtime.
- Run the existing backend integration suite and full backend suite; run frontend tests and typecheck as repository gates, recording existing failures without fixing them.

## Acceptance criteria

Baseline commands and actual results are recorded, or an explicit environment blocker is recorded. No original service data is modified.

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

Also run the targeted tests described here. Configure test storage/temp output and service targets **before imports**; the original fixture drops a PostgreSQL schema and flushes application-configured Redis. Never run it against ordinary shared services. Record exact commands, exit codes, baseline failures and new failures in this WP’s concise STATUS.md row. No test result in this plan is an executed remediation result. Do not claim success from historical onboarding. Existing unrelated frontend/typecheck failures must be recorded and escalated, not silently fixed outside scope.


Performance / operational evidence: Capture baseline suite duration and failure inventory; this is not a load benchmark.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Tests can destroy service state if isolation is wrong. Verify disposable targets before imports; stop on ambiguity. Rollback removes only this WP’s test/docs artifacts and disposes its dedicated runtime; never reset an existing user database.

## Dependencies and execution order

Functional prerequisites: none.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**S**: localized change or narrowly scoped evidence collection.

Use branch `remediation/wp-01-baseline` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
