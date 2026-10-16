# WP-29 — Publish notification intents only after committed business changes

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Publish notification intents only after committed business changes. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-11** (Required (no prefix)): Jobs and analytics invalidation run before the business transaction commits. [BUS-11 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-11--jobs-and-analytics-invalidation-run-before-the-business-transaction-commits). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **PERF-BUS-04** (Medium): Each qualifying document upload creates an ARQ pool without closing it. [PERF-BUS-04 — report section](../../backendperformanceaudit/02-business-domain-performance-audit.md#perf-bus-04--each-qualifying-document-upload-creates-an-arq-pool-without-closing-it). Verification: Confirmed create_pool without explicit close; retained-client duration depends on GC, not proven permanent leak.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/journal_service.py:631](../../../backend/app/services/journal_service.py) | Existing file, anchor line 631; only this WP’s stated behavior may change. |
| [backend/app/services/document_service.py:94](../../../backend/app/services/document_service.py) | Existing file, anchor line 94; only this WP’s stated behavior may change. |
| [backend/app/services/outbox_service.py](../../../backend/app/services/outbox_service.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/workers/outbox.py](../../../backend/app/workers/outbox.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/workers/tasks.py:30](../../../backend/app/workers/tasks.py) | Existing file, anchor line 30; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp29.py](../../../backend/app/tests/integration/test_remediation_wp29.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/journal_service.py:631-639](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/document_service.py:94-107](../../../backend/app/services/document_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:543,606,645,714,783,857](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/enrollment_service.py:133-169](../../../backend/app/services/enrollment_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/document_service.py:97-107](../../../backend/app/services/document_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/journal_service.py`:

```text
631:         sum_service = SumCalculationService(self.db)
632:         await sum_service.recalculate(journal_id, student_id)
633: 
634:         from app.core.redis import enqueue_job
635:         try:
636:             await enqueue_job("send_exam_result_notification_task", student_id, journal_id)
637:         except Exception:
638:             pass
```

## Step-by-step change

1. Reuse WP-18 outbox for journal-result/document intents in the same transaction as business rows. Remove direct precommit enqueue and request-local create_pool calls.
2. Dispatch with the lifecycle-owned producer and stable intent IDs, preserving retry after Redis failure; consumers read committed versions.
3. Close BUS-11 only after WP-19 proves commit-safe finance/enrollment generation changes too.

## Tests to write BEFORE the fix

- Pause worker ahead of request commit; no uncommitted score/document is sent. Rollback emits no event. Redis failure preserves intent and retry; repeated uploads do not create per-request ARQ pools.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp29.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Notifications see committed business state; no silent lost enqueue; the full BUS-11 job and cache scope is covered by this WP plus completed WP-19.

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


Performance / operational evidence: Measure U uploads against producer creation count (one process-owned producer), connected clients and transaction duration; shutdown returns clients to baseline.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-18, WP-19, WP-21, WP-26.

Required shared-file / migration ordering:
- WP-21 → WP-29: `backend/app/services/journal_service.py`.
- WP-26 → WP-29: `backend/app/services/document_service.py`, `backend/app/workers/tasks.py`.
- WP-18 → WP-29: `backend/app/services/outbox_service.py`, `backend/app/workers/outbox.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-29-notification-outbox` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
