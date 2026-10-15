# WP-52 — Finish typed API response and domain boundaries

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Finish typed API response and domain boundaries. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **API-10** (Optional:): Optional: Move domain calculation and queries out of routers and complete typed response boundaries. [API-10 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-10--optional-move-domain-calculation-and-queries-out-of-routers-and-complete-typed-response-boundaries). Verification: Confirmed router SQL/dict boundaries. Private finance call is at line 55, not cited line 51; corrected citation added.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/api/v1/mentors.py:137](../../../backend/app/api/v1/mentors.py) | Existing file, anchor line 137; only this WP’s stated behavior may change. |
| [backend/app/api/v1/students.py:75](../../../backend/app/api/v1/students.py) | Existing file, anchor line 75; only this WP’s stated behavior may change. |
| [backend/app/api/v1/journals.py:22](../../../backend/app/api/v1/journals.py) | Existing file, anchor line 22; only this WP’s stated behavior may change. |
| [backend/app/api/v1/finance.py:51](../../../backend/app/api/v1/finance.py) | Existing file, anchor line 51; only this WP’s stated behavior may change. |
| [backend/app/schemas/user.py:7](../../../backend/app/schemas/user.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/schemas/journal.py:7](../../../backend/app/schemas/journal.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/schemas/ledger.py:9](../../../backend/app/schemas/ledger.py) | Existing file, anchor line 9; only this WP’s stated behavior may change. |
| [backend/app/core/deps.py:80](../../../backend/app/core/deps.py) | Existing file, anchor line 80; only this WP’s stated behavior may change. |
| [backend/app/services/mentor_analytics_service.py](../../../backend/app/services/mentor_analytics_service.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/repositories/sqlalchemy/mentor_analytics_repository.py](../../../backend/app/repositories/sqlalchemy/mentor_analytics_repository.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [frontend/src/lib/users/types.ts:1](../../../frontend/src/lib/users/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/journals/types.ts:1](../../../frontend/src/lib/journals/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/finance/types.ts:1](../../../frontend/src/lib/finance/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [CONTRACT.md:1](../../../CONTRACT.md) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp52.py](../../../backend/app/tests/integration/test_remediation_wp52.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/api/v1/courses.py:186–315](../../../backend/app/api/v1/courses.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/mentors.py:137–172](../../../backend/app/api/v1/mentors.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/students.py:75–113](../../../backend/app/api/v1/students.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/journals.py:22–29](../../../backend/app/api/v1/journals.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/finance.py:51,140–148](../../../backend/app/api/v1/finance.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/core/deps.py:80–126](../../../backend/app/core/deps.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/finance.py:55](../../../backend/app/api/v1/finance.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/api/v1/courses.py`:

```text
186: @router.get("/{id}/progress-chart")
187: async def get_progress_chart(
188:     id: int,
189:     current_user: User = Depends(get_current_user),
190:     db: AsyncSession = Depends(get_db_session)
191: ) -> dict:
192:     await check_course_access(id, current_user, db)
193: 
```

## Step-by-step change

1. Move mentor analytics SQL to a typed repository-backed service and inject it via Depends; retain role-specific profile policies.
2. Replace remaining generic journal-detail/ledger/analytics response boundaries with explicit DTOs matching the actual payload. Call the public payment decoration façade from WP-53 and consolidate duplicated access helpers with behavior tests.
3. Verify chart extraction (WP-34), configured storage injection (WP-26) and repository contracts (WP-51) satisfy the other API-10 subclaims before marking the owner complete.

## Tests to write BEFORE the fix

- Golden response-shape and role/privacy tests cover staff/student chart/profile/journal/ledger variants; generated OpenAPI and frontend types agree; no permission branch is lost by extraction.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp52.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

API-10 closes only when its distributed contributions and this focused boundary PR pass; routers no longer own the remaining mentor SQL or call private finance helpers.

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


Verification focuses on the exact behavioral/security tests above. No speculative performance benchmark is required.

Regenerate contract with `python backend/scripts/generate_contract.py` from repository root in the isolated test environment; synchronize only the listed client types/callers and verify them by reading their contents (frontend/src/lib is broadly gitignored). New visible text must use existing translations or stop to add exact locale paths to the plan.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-34, WP-26, WP-51, WP-53.

Required shared-file / migration ordering:
- WP-41 → WP-52: `backend/app/api/v1/mentors.py`.
- WP-51 → WP-52: `backend/app/api/v1/students.py`.
- WP-35 → WP-52: `backend/app/api/v1/journals.py`, `backend/app/schemas/journal.py`, `frontend/src/lib/journals/types.ts`.
- WP-56 → WP-52: `backend/app/api/v1/finance.py`, `backend/app/schemas/ledger.py`, `frontend/src/lib/finance/types.ts`, `CONTRACT.md`.
- WP-49 → WP-52: `backend/app/schemas/user.py`, `frontend/src/lib/users/types.ts`.
- WP-63 → WP-52: `backend/app/core/deps.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-52-api-boundaries` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
