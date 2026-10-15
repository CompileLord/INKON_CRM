# WP-51 — Complete typed feature repository contracts

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Complete typed feature repository contracts. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **DATA-12** (Required (no severity prefix in title)): Repository protocols omit methods consumers already rely on. [DATA-12 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-12--repository-protocols-omit-methods-consumers-already-rely-on). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Contributes without duplicating coverage ownership: [API-10 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-10--optional-move-domain-calculation-and-queries-out-of-routers-and-complete-typed-response-boundaries) (closure owner WP-52).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/repositories/interfaces/base_repository.py:7](../../../backend/app/repositories/interfaces/base_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/user_repository.py:7](../../../backend/app/repositories/interfaces/user_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/audit_log_repository.py:6](../../../backend/app/repositories/interfaces/audit_log_repository.py) | Existing file, anchor line 6; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/document_repository.py:6](../../../backend/app/repositories/interfaces/document_repository.py) | Existing file, anchor line 6; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/enrollment_repository.py:6](../../../backend/app/repositories/interfaces/enrollment_repository.py) | Existing file, anchor line 6; only this WP’s stated behavior may change. |
| [backend/app/repositories/sqlalchemy/user_repository.py:21](../../../backend/app/repositories/sqlalchemy/user_repository.py) | Existing file, anchor line 21; only this WP’s stated behavior may change. |
| [backend/app/repositories/sqlalchemy/audit_log_repository.py:7](../../../backend/app/repositories/sqlalchemy/audit_log_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/repositories/sqlalchemy/document_repository.py:7](../../../backend/app/repositories/sqlalchemy/document_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/repositories/sqlalchemy/enrollment_repository.py:7](../../../backend/app/repositories/sqlalchemy/enrollment_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/services/audit_service.py:11](../../../backend/app/services/audit_service.py) | Existing file, anchor line 11; only this WP’s stated behavior may change. |
| [backend/app/services/document_service.py:13](../../../backend/app/services/document_service.py) | Existing file, anchor line 13; only this WP’s stated behavior may change. |
| [backend/app/services/enrollment_service.py:26](../../../backend/app/services/enrollment_service.py) | Existing file, anchor line 26; only this WP’s stated behavior may change. |
| [backend/app/api/v1/students.py:75](../../../backend/app/api/v1/students.py) | Existing file, anchor line 75; only this WP’s stated behavior may change. |
| [backend/app/core/deps.py:80](../../../backend/app/core/deps.py) | Existing file, anchor line 80; only this WP’s stated behavior may change. |
| [backend/app/schemas/common.py:7](../../../backend/app/schemas/common.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp51.py](../../../backend/app/tests/integration/test_remediation_wp51.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/repositories/interfaces/base_repository.py:7–29](../../../backend/app/repositories/interfaces/base_repository.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/repositories/interfaces/user_repository.py:7–31](../../../backend/app/repositories/interfaces/user_repository.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/repositories/sqlalchemy/base_repository.py:64–99](../../../backend/app/repositories/sqlalchemy/base_repository.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/courses.py:186–315](../../../backend/app/api/v1/courses.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/mentors.py:137–172](../../../backend/app/api/v1/mentors.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/students.py:75–113](../../../backend/app/api/v1/students.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/journals.py:22–29](../../../backend/app/api/v1/journals.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/finance.py:51,140–148](../../../backend/app/api/v1/finance.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/core/deps.py:80–126](../../../backend/app/core/deps.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/finance.py:55](../../../backend/app/api/v1/finance.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/repositories/interfaces/base_repository.py`:

```text
7: class BaseRepository(Protocol[T]):
8:     async def get_by_id(self, id: Any, include_deleted: bool = False) -> Optional[T]:
9:         ...
10: 
11:     async def get_list(
12:         self,
13:         skip: int = 0,
14:         limit: int = 100,
```

## Step-by-step change

1. Define typed feature page/filter/result methods matching real callers, including student history and audit/document/enrollment lists.
2. Keep SQLAlchemy Select construction inside SQL implementations and wire protocols through named dependency factories; leave generic persistence mechanics private.
3. Preserve current transaction owner and reuse existing Page/DTO types where possible; do not create pass-through wrapper layers.

## Tests to write BEFORE the fix

- A lightweight alternate repository satisfies each feature contract without importing SQLAlchemy; HTTP behavior, filters/ownership/counts and request commit/rollback remain equivalent.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp51.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Services/routers depend only on declared feature methods, with typed returns and no required implementation-only Select API.

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

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-29, WP-40, WP-44, WP-50.

Required shared-file / migration ordering:
- WP-46 → WP-51: `backend/app/repositories/interfaces/user_repository.py`, `backend/app/services/enrollment_service.py`, `backend/app/core/deps.py`.
- WP-44 → WP-51: `backend/app/repositories/sqlalchemy/user_repository.py`.
- WP-21 → WP-51: `backend/app/services/audit_service.py`.
- WP-29 → WP-51: `backend/app/services/document_service.py`.
- WP-40 → WP-51: `backend/app/api/v1/students.py`.
- WP-49 → WP-51: `backend/app/schemas/common.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-51-repository-contracts` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
