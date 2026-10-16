# WP-44 — Avoid empty-page queries and make directory order stable

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Avoid empty-page queries and make directory order stable. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **DATA-14** (Optional:): Optional: Generic pagination lacks stable ordering for user lists. [DATA-14 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-14--optional-generic-pagination-lacks-stable-ordering-for-user-lists). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **PERF-DATA-04** (Medium): Every paginated search pays COUNT and OFFSET work, including empty results. [PERF-DATA-04 — report section](../../backendperformanceaudit/03-data-infrastructure-performance-audit.md#perf-data-04--every-paginated-search-pays-count-and-offset-work-including-empty-results). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/repositories/sqlalchemy/base_repository.py:88](../../../backend/app/repositories/sqlalchemy/base_repository.py) | Existing file, anchor line 88; only this WP’s stated behavior may change. |
| [backend/app/repositories/sqlalchemy/user_repository.py:36](../../../backend/app/repositories/sqlalchemy/user_repository.py) | Existing file, anchor line 36; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp44.py](../../../backend/app/tests/integration/test_remediation_wp44.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/repositories/sqlalchemy/user_repository.py:36–46,55–65](../../../backend/app/repositories/sqlalchemy/user_repository.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/repositories/sqlalchemy/base_repository.py:88–91](../../../backend/app/repositories/sqlalchemy/base_repository.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/repositories/sqlalchemy/base_repository.py:70–91](../../../backend/app/repositories/sqlalchemy/base_repository.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/repositories/sqlalchemy/user_repository.py`:

```text
36:         query = select(User).filter(User.role == UserRole.STUDENT, User.is_deleted == False)
37:         if search:
38:             search_pattern = f"%{search}%"
39:             query = query.filter(
40:                 or_(
41:                     User.first_name.ilike(search_pattern),
42:                     User.last_name.ilike(search_pattern),
43:                     User.email.ilike(search_pattern),
```

## Step-by-step change

1. Return immediately when count is zero; add feature-specific stable ordering with an ID tie-breaker rather than overriding all repository queries.
2. Profile deep offsets and substring search while preserving existing page/count contracts. Record whether a separate cursor/search-index change is justified; do not silently replace numbered pagination.

The source finding includes a performance hypothesis. Closure requires measured acceptance at actual expected scale or a separately tracked residual; an empty-page shortcut alone is not evidence that deep pagination is fast.

## Tests to write BEFORE the fix

- Empty search executes only count; repeated tied-name pages have deterministic membership. Role/search filters and exact count remain correct; concurrent writes have documented offset limitations.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp44.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Empty-page waste and missing ordering fixed; deep-offset/search cost is measured and explicitly dispositioned. No unsupported index/cursor rewrite.

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


Performance / operational evidence: At 10k/100k/1M users compare first/deep/empty page SQL count, p50/p95 and EXPLAIN buffers for common/rare terms. Record residual offset cost and proposed follow-up if beyond the measured budget.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-39, WP-16.

Required shared-file / migration ordering:
- WP-40 → WP-44: `backend/app/repositories/sqlalchemy/user_repository.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-44-stable-pagination` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
