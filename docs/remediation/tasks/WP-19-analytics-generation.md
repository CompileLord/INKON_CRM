# WP-19 — Replace precommit cache scans with transactional generations

Phase **2** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Replace precommit cache scans with transactional generations. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **PERF-BUS-03** (Medium): Every financial mutation scans the whole shared Redis keyspace to invalidate analytics. [PERF-BUS-03 — report section](../../backendperformanceaudit/02-business-domain-performance-audit.md#perf-bus-03--every-financial-mutation-scans-the-whole-shared-redis-keyspace-to-invalidate-analytics). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Contributes without duplicating coverage ownership: [BUS-11 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-11--jobs-and-analytics-invalidation-run-before-the-business-transaction-commits) (closure owner WP-29).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/finance_service.py:122](../../../backend/app/services/finance_service.py) | Existing file, anchor line 122; only this WP’s stated behavior may change. |
| [backend/app/services/enrollment_service.py:133](../../../backend/app/services/enrollment_service.py) | Existing file, anchor line 133; only this WP’s stated behavior may change. |
| [backend/app/models/cache_generation.py](../../../backend/app/models/cache_generation.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/models/__init__.py:1](../../../backend/app/models/__init__.py) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/alembic/versions/rwp19_cache_generation.py](../../../backend/alembic/versions/rwp19_cache_generation.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp19.py](../../../backend/app/tests/integration/test_remediation_wp19.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/finance_service.py:122-134](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/journal_service.py:631-639](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/document_service.py:94-107](../../../backend/app/services/document_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:543,606,645,714,783,857](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/enrollment_service.py:133-169](../../../backend/app/services/enrollment_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/finance_service.py`:

```text
122:     async def _invalidate_cache(self) -> None:
123:         """Drop cached analytics. Uses SCAN — KEYS blocks the Redis event loop."""
124:         try:
125:             cursor = 0
126:             while True:
127:                 cursor, keys = await redis_client.scan(cursor=cursor, match="finance:analytics:*", count=100)
128:                 if keys:
129:                     await redis_client.delete(*keys)
```

## Step-by-step change

1. Advance a durable finance generation in the same transaction as every affected payment/allocation/reversal/schedule/withdrawal mutation.
2. Read the committed generation for analytics keys; old generations expire by TTL. Remove full Redis SCAN invalidation and ensure old computations publish only to their own generation.
3. Keep the generation write short and measure contention; do not perform remote Redis work while holding account locks.

Contribution to BUS-11 closure, uniquely owned by WP-29. A global generation row may serialize writes; if measured contention exceeds the budget, stop and propose a partitioned or outbox design rather than silently broadening this WP.

## Tests to write BEFORE the fix

- Pause reader before writer commit and after generation read; verify no stale result populates the new generation. Rollbacks do not advance visible generation; enrollment and withdrawal invalidate relevant results.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp19.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Committed finance changes have a defined freshness boundary; no mutation scans unrelated Redis keys; stale old-key computations cannot overwrite current analytics.

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


Performance / operational evidence: Compare SCAN count (target zero), transaction/lock duration and Redis CPU while unrelated keyspace grows; measure contention on generation row. This is required groundwork for the High stampede fix.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

Use the exact NEW migration filename listed, a unique revision ID and the current single Alembic head after dependencies. Test upgrade, data preflight and rollback/recovery in a disposable database. Do not rewrite an applied revision or silently discard conflicting financial/authentication data.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-07, WP-08.

Required shared-file / migration ordering:
- WP-08 → WP-19: `backend/app/services/finance_service.py`.
- WP-07 → WP-19: `backend/app/services/enrollment_service.py`.
- WP-18 → WP-19: `backend/app/models/__init__.py`, `Alembic single-head revision chain`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-19-analytics-generation` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
