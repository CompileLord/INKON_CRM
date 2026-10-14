# WP-21 — Batch audit writes and translate the full journal conflict boundary

Phase **2** · Priority **Medium (promoted to Phase 2)** · Effort **M** · Status **todo**

## Goal

Batch audit writes and translate the full journal conflict boundary. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-13** (Required (no prefix)): Optimistic conflicts escape the journal's 409 handling. [BUS-13 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-13--optimistic-conflicts-escape-the-journals-409-handling). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **PERF-BUS-05** (Medium): Autosave flushes once per changed cell before its batch flush. [PERF-BUS-05 — report section](../../backendperformanceaudit/02-business-domain-performance-audit.md#perf-bus-05--autosave-flushes-once-per-changed-cell-before-its-batch-flush). Verification: Confirmed per-cell audit flush and later flushes; K+2 invocations are not necessarily K+2 SQL round trips.

Contributes without duplicating coverage ownership: [BUS-20 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-20--optional-remove-repeated-queries-and-unbounded-materialization-from-reportingjobs) (closure owner WP-54).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/journal_service.py:479](../../../backend/app/services/journal_service.py) | Existing file, anchor line 479; only this WP’s stated behavior may change. |
| [backend/app/services/audit_service.py:37](../../../backend/app/services/audit_service.py) | Existing file, anchor line 37; only this WP’s stated behavior may change. |
| [backend/app/services/sum_calculation_service.py:118](../../../backend/app/services/sum_calculation_service.py) | Existing file, anchor line 118; only this WP’s stated behavior may change. |
| [backend/app/core/deps.py:14](../../../backend/app/core/deps.py) | Existing file, anchor line 14; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp21.py](../../../backend/app/tests/integration/test_remediation_wp21.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-21.md](../results/WP-21.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |
| [backend/app/api/v1/journals.py:23](../../../backend/app/api/v1/journals.py) | Existing file, anchor line 23; only this WP’s stated behavior may change. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/journal_service.py:479-512,622-632,708-724](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/audit_service.py:37-43](../../../backend/app/services/audit_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/sum_calculation_service.py:118](../../../backend/app/services/sum_calculation_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/journal_service.py:433-511,514-516](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/audit_service.py:25-37](../../../backend/app/services/audit_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/sum_calculation_service.py:71-118](../../../backend/app/services/sum_calculation_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:294-295,1004-1019,1510-1550](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/journal_service.py:172-182](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/workers/tasks.py:156-166,193-222](../../../backend/app/workers/tasks.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/journal_service.py`:

```text
479:             if changes:
480:                 entry.attendance = target_attendance
481:                 entry.score = update_item.score
482:                 entry.comment = update_item.comment
483: 
484:                 await audit_service.log(
485:                     user_id=current_user.id,
486:                     action="update",
```

## Step-by-step change

1. Make audit construction stage rows without unconditional flush or swallowing session-invalidating errors.
2. Wrap entry mutation, recalculation, flush and request commit conflict translation in rollback-to-409 handling. Recalculate only affected students and preserve partial-conflict/version contracts.
3. Avoid per-cell flushes and no-op whole-journal recalculation; retain every required audit record.
4. Ensure conflict translation/commit occurs before response transmission: use a supported function-scoped session dependency or an explicit journal command transaction boundary with one owner. A yield teardown running after the response cannot turn a commit conflict into an HTTP 409.

Scheduled early at the user’s explicit request despite source performance impact Medium. Avoid catching arbitrary DB errors as version conflicts.

## Tests to write BEFORE the fix

- Two independent sessions edit same entry and different entries sharing a summary; force conflict during audit flush, summary flush and commit. Assert 409 rather than failed-session 500 and verify applied/conflict response versions.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp21.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Autosave preserves audit/version semantics; all optimistic conflicts are translated with rollback; flush count is bounded by batch stages, not changed-cell count.

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


Performance / operational evidence: Instrument flush invocations separately from SQL executions for 1/10/100 changed cells and no-op replay; compare transaction p95 and exact audit rows. Baseline K+2 is a flush-invocation model.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-17.

Required shared-file / migration ordering:
- WP-17 → WP-21: `backend/app/core/deps.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-21-autosave-transactions` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-21.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
