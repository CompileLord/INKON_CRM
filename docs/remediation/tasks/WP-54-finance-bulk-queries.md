# WP-54 — Batch finance availability and ledger aggregates

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Batch finance availability and ledger aggregates. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-20** (Optional:): Optional: Remove repeated queries and unbounded materialization from reporting/jobs. [BUS-20 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-20--optional-remove-repeated-queries-and-unbounded-materialization-from-reportingjobs). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/finance_service.py:294](../../../backend/app/services/finance_service.py) | Existing file, anchor line 294; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp54.py](../../../backend/app/tests/integration/test_remediation_wp54.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/finance_service.py:294-295,1004-1019,1510-1550](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/journal_service.py:172-182](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/sum_calculation_service.py:71-118](../../../backend/app/services/sum_calculation_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/workers/tasks.py:156-166,193-222](../../../backend/app/workers/tasks.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/finance_service.py`:

```text
294:         for entry in entries:
295:             available = await self._entry_available(entry)
296:             if available <= ZERO:
297:                 continue
298: 
299:             for charge in charges:
300:                 if available <= ZERO:
301:                     break
```

## Step-by-step change

1. Fetch active allocation/refund sums grouped by entry/charge once for the requested account/page and replace aggregate queries inside loops.
2. Preserve account locking, ordering, reversal exclusions and Decimal totals. Bound transfer to the requested result scope rather than aggregating irrelevant accounts.
3. BUS-20 closure also requires affected-student recalculation (WP-21), batched reminders (WP-32), queue batching (WP-55) and bounded finance histories (WP-56); do not close it for query batching alone.

## Tests to write BEFORE the fix

- Query counts stay constant or batch-proportional as credit entries/charges increase; financial invariants and receipt/reconciliation results match across void/refund/discount cases.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp54.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

No per-entry/per-charge finance aggregate loop; all named BUS-20 contributors complete before owner closure.

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


Performance / operational evidence: Compare SQL count, fetched rows, lock/transaction p95 and RSS at 10/100/1000 ledger entries; keep improvements beyond measurement variance.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-21, WP-32, WP-55, WP-56.

Required shared-file / migration ordering:
- WP-56 → WP-54: `backend/app/services/finance_service.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-54-finance-bulk-queries` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
