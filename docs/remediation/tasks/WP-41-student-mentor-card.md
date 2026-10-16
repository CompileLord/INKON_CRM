# WP-41 — Return only authorized mentor information to students

Phase **3** · Priority **Medium** · Effort **S** · Status **todo**

## Goal

Return only authorized mentor information to students. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **SEC-API-03** (Medium): Medium — One mentor relationship exposes courses the student cannot otherwise access. [SEC-API-03 — report section](../../backendsecurityaudit/01-api-layer-security-audit.md#sec-api-03--medium--one-mentor-relationship-exposes-courses-the-student-cannot-otherwise-access). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/api/v1/mentors.py:66](../../../backend/app/api/v1/mentors.py) | Existing file, anchor line 66; only this WP’s stated behavior may change. |
| [backend/app/schemas/user.py:42](../../../backend/app/schemas/user.py) | Existing file, anchor line 42; only this WP’s stated behavior may change. |
| [frontend/src/lib/users/types.ts:1](../../../frontend/src/lib/users/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/pages/MentorProfile.tsx:1](../../../frontend/src/pages/MentorProfile.tsx) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [CONTRACT.md:1](../../../CONTRACT.md) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp41.py](../../../backend/app/tests/integration/test_remediation_wp41.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |
| [frontend/src/lib/users/hooks.ts:1](../../../frontend/src/lib/users/hooks.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/users/endpoints.ts:1](../../../frontend/src/lib/users/endpoints.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/pages/student/MyCourseDetail.tsx:1](../../../frontend/src/pages/student/MyCourseDetail.tsx) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/components/dashboard/StudentDashboard.tsx:1](../../../frontend/src/components/dashboard/StudentDashboard.tsx) | Existing file, anchor line 1; only this WP’s stated behavior may change. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/api/v1/mentors.py:66-108](../../../backend/app/api/v1/mentors.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/schemas/user.py:42-58,120-124](../../../backend/app/schemas/user.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/api/v1/mentors.py`:

```text
66: @router.get("/{id}/profile", response_model=MentorProfileResponse)
67: async def get_mentor_profile(
68:     id: int,
69:     current_user: User = Depends(get_current_user),
70:     db: AsyncSession = Depends(get_db_session)
71: ) -> dict:
72:     if current_user.role == UserRole.MENTOR and current_user.id != id:
73:         raise HTTPException(
```

## Step-by-step change

1. Keep the enrollment existence guard but return a dedicated student mentor card or strictly enrolled-course projection.
2. Exclude unrelated courses and private contact/parent/DOB fields; staff responses retain their permitted complete shape. Update discriminator/union handling deliberately.

## Tests to write BEFORE the fix

- Student enrolled only in A cannot learn B via mentor profile; forbidden contact fields absent even when populated; authorized mentor/admin profile still works.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp41.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Student profile responses cannot bypass direct-course authorization or leak unneeded personal properties.

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


Verification focuses on the exact behavioral/security tests above. No speculative performance benchmark is required.

Regenerate contract with `python backend/scripts/generate_contract.py` from repository root in the isolated test environment; synchronize only the listed client types/callers and verify them by reading their contents (frontend/src/lib is broadly gitignored). New visible text must use existing translations or stop to add exact locale paths to the plan.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-40.

Required shared-file / migration ordering:
- WP-40 → WP-41: `backend/app/schemas/user.py`, `frontend/src/lib/users/types.ts`, `CONTRACT.md`, `frontend/src/lib/users/hooks.ts`, `frontend/src/lib/users/endpoints.ts`, `frontend/src/pages/student/MyCourseDetail.tsx`, `frontend/src/components/dashboard/StudentDashboard.tsx`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**S**: localized change or narrowly scoped evidence collection.

Use branch `remediation/wp-41-student-mentor-card` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
