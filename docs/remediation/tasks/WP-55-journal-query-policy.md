# WP-55 — Batch mentor grading queue and consolidate its shared policy

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Batch mentor grading queue and consolidate its shared policy. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

This is an enabling, contributor or verification package; it does not independently own a source finding.

Contributes without duplicating coverage ownership: [BUS-19 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-19--optional-narrow-service-dependencies-and-split-finance-responsibilities) (closure owner WP-53); [BUS-20 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-20--optional-remove-repeated-queries-and-unbounded-materialization-from-reportingjobs) (closure owner WP-54).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/journal_service.py:392](../../../backend/app/services/journal_service.py) | Existing file, anchor line 392; only this WP’s stated behavior may change. |
| [backend/app/services/enrollment_service.py:26](../../../backend/app/services/enrollment_service.py) | Existing file, anchor line 26; only this WP’s stated behavior may change. |
| [backend/app/core/schedule_utils.py:6](../../../backend/app/core/schedule_utils.py) | Existing file, anchor line 6; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp55.py](../../../backend/app/tests/integration/test_remediation_wp55.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/auth_service.py:19-23](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/course_service.py:20-23](../../../backend/app/services/course_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:76-78,1198-1349,1597-1661](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/journal_service.py:392-409,565-582,666-683](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:294-295,1004-1019,1510-1550](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/journal_service.py:172-182](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/sum_calculation_service.py:71-118](../../../backend/app/services/sum_calculation_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/workers/tasks.py:156-166,193-222](../../../backend/app/workers/tasks.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/auth_service.py`:

```text
19:     def __init__(self, db: AsyncSession) -> None:
20:         self.db = db
21:         self.user_repo = SQLAlchemyUserRepository(db)
22:         self.token_repo = SQLAlchemyRefreshTokenRepository(db)
23:         self.email_service = EmailService()
24: 
25:     async def login(self, email: str, password: str) -> TokenPair:
26:         user = await self.user_repo.get_by_email(email)
```

## Step-by-step change

1. Query mentor-course journal aggregates in one set rather than one service call per course, preserving explicit grading state.
2. Consolidate repeated journal mutation authorization into one tested policy and use the canonical lesson-date helper from both services. This bounded journal PR contributes to BUS-19 and BUS-20; their unique owners are WP-53 and WP-54.

## Tests to write BEFORE the fix

- Queue query count does not grow by five per course; own/foreign/archived roles and date boundaries remain identical. Test empty/partial/complete/upcoming states.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp55.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Queue selection has bounded set-based queries and policy/date logic has one implementation.

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


Performance / operational evidence: Compare query count, rows and p95 for 1/10/100 mentor courses; validate exact queue ordering and results.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-33, WP-46.

Required shared-file / migration ordering:
- WP-33 → WP-55: `backend/app/services/journal_service.py`.
- WP-51 → WP-55: `backend/app/services/enrollment_service.py`.
- WP-46 → WP-55: `backend/app/core/schedule_utils.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-55-journal-query-policy` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
