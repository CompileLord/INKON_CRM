# WP-16 — Restrict student directory count and results to mentor ownership

Phase **2** · Priority **High** · Effort **M** · Status **todo**

## Goal

Restrict student directory count and results to mentor ownership. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **SEC-API-02** (High): High — A mentor can enumerate every student's and parent's personal data. [SEC-API-02 — report section](../../backendsecurityaudit/01-api-layer-security-audit.md#sec-api-02--high--a-mentor-can-enumerate-every-students-and-parents-personal-data). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/api/v1/students.py:18](../../../backend/app/api/v1/students.py) | Existing file, anchor line 18; only this WP’s stated behavior may change. |
| [backend/app/services/user_service.py:10](../../../backend/app/services/user_service.py) | Existing file, anchor line 10; only this WP’s stated behavior may change. |
| [backend/app/repositories/sqlalchemy/user_repository.py:21](../../../backend/app/repositories/sqlalchemy/user_repository.py) | Existing file, anchor line 21; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/user_repository.py:7](../../../backend/app/repositories/interfaces/user_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp16.py](../../../backend/app/tests/integration/test_remediation_wp16.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-16.md](../results/WP-16.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/api/v1/students.py:18-31](../../../backend/app/api/v1/students.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/schemas/user.py:42-58](../../../backend/app/schemas/user.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/api/v1/students.py`:

```text
18: @router.get("/", response_model=PaginatedResponse[UserResponse])
19: async def get_students(
20:     search: Optional[str] = None,
21:     pagination: PaginationParams = Depends(),
22:     current_user: User = Depends(get_current_user),
23:     db: AsyncSession = Depends(get_db_session)
24: ) -> dict:
25:     if current_user.role not in [UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.MENTOR]:
```

## Step-by-step change

1. Derive mentor_id from the authenticated principal, never the request; pass it through service/protocol to the repository.
2. Apply the same nondeleted-course/enrollment ownership predicate to count, search and page queries. Preserve administrator/accountant directory access and explicitly state withdrawn-enrollment policy.

## Tests to write BEFORE the fix

- Seed two mentors, unrelated students and parent contacts. Test own-course results, unrelated search/total exclusion and a mentor with zero courses.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp16.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

No unrelated student or parent PII leaks through items, search or total counts.

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


Verification focuses on the exact behavioral/security tests above. No speculative performance benchmark is required.

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-15.

Required shared-file / migration ordering:
- WP-15 → WP-16: `backend/app/services/user_service.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-16-mentor-directory` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-16.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
