# WP-35 — Bound autosave bodies, comments and unique cells

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Bound autosave bodies, comments and unique cells. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **SEC-API-04** (Medium): Medium — Autosave accepts unlimited repeated cells and comments. [SEC-API-04 — report section](../../backendsecurityaudit/01-api-layer-security-audit.md#sec-api-04--medium--autosave-accepts-unlimited-repeated-cells-and-comments). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **PERF-API-02** (Medium): Medium — One unique autosave cell can amplify into thousands of output entries. [PERF-API-02 — report section](../../backendperformanceaudit/01-api-layer-performance-audit.md#perf-api-02--medium--one-unique-autosave-cell-can-amplify-into-thousands-of-output-entries). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/api/v1/journals.py:32](../../../backend/app/api/v1/journals.py) | Existing file, anchor line 32; only this WP’s stated behavior may change. |
| [backend/app/schemas/journal.py:47](../../../backend/app/schemas/journal.py) | Existing file, anchor line 47; only this WP’s stated behavior may change. |
| [backend/app/main.py:24](../../../backend/app/main.py) | Existing file, anchor line 24; only this WP’s stated behavior may change. |
| [frontend/src/lib/journals/types.ts:1](../../../frontend/src/lib/journals/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/journals/useJournalAutosave.ts:1](../../../frontend/src/lib/journals/useJournalAutosave.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [CONTRACT.md:1](../../../CONTRACT.md) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp35.py](../../../backend/app/tests/integration/test_remediation_wp35.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-35.md](../results/WP-35.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/api/v1/journals.py:32-40](../../../backend/app/api/v1/journals.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/schemas/journal.py:47-54](../../../backend/app/schemas/journal.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/api/v1/journals.py`:

```text
32: @router.put("/{id}/entries", response_model=JournalBatchUpdateResponse, status_code=status.HTTP_200_OK)
33: async def batch_update_entries(
34:     id: int,
35:     payload: List[JournalEntryUpdate],
36:     current_user: User = Depends(get_current_user),
37:     db: AsyncSession = Depends(get_db_session)
38: ) -> dict:
39:     journal_service = JournalService(db)
```

## Step-by-step change

1. Validate a documented finite batch size, unique student/date keys and finite comment length; reject conflicting duplicates rather than select an arbitrary winner.
2. Enforce a route-specific pre-JSON body-byte cap including chunked requests, with 413 and no unbounded buffering. Align frontend batching to accepted capacity without changing partial-conflict semantics.

## Tests to write BEFORE the fix

- 1/100/maximum legitimate unique cells succeed; duplicate keys, maximum+1 and oversized comments fail before service work. Chunked body over cap is rejected and ordinary uploads remain supported.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp35.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Request/response amplification is bounded; accepted partial/no-op batches preserve versions and conflict behavior.

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


Performance / operational evidence: Measure bytes, peak RSS, output cardinality, loop lag and autosave p95 at fixed fixture sizes before/after.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

Regenerate contract with `python backend/scripts/generate_contract.py` from repository root in the isolated test environment; synchronize only the listed client types/callers and verify them by reading their contents (frontend/src/lib is broadly gitignored). New visible text must use existing translations or stop to add exact locale paths to the plan.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-21, WP-27.

Required shared-file / migration ordering:
- WP-21 → WP-35: `backend/app/api/v1/journals.py`.
- WP-27 → WP-35: `backend/app/main.py`.
- WP-34 → WP-35: `CONTRACT.md`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-35-autosave-bounds` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-35.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
