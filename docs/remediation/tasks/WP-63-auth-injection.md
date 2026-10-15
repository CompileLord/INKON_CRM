# WP-63 — Inject narrow authentication collaborators

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Inject narrow authentication collaborators. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

This is an enabling, contributor or verification package; it does not independently own a source finding.

Contributes without duplicating coverage ownership: [BUS-19 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-19--optional-narrow-service-dependencies-and-split-finance-responsibilities) (closure owner WP-53).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/auth_service.py:19](../../../backend/app/services/auth_service.py) | Existing file, anchor line 19; only this WP’s stated behavior may change. |
| [backend/app/core/deps.py:14](../../../backend/app/core/deps.py) | Existing file, anchor line 14; only this WP’s stated behavior may change. |
| [backend/app/api/v1/auth.py:23](../../../backend/app/api/v1/auth.py) | Existing file, anchor line 23; only this WP’s stated behavior may change. |
| [backend/app/services/user_service.py:10](../../../backend/app/services/user_service.py) | Existing file, anchor line 10; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/user_repository.py:7](../../../backend/app/repositories/interfaces/user_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/refresh_token_repository.py:7](../../../backend/app/repositories/interfaces/refresh_token_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/services/email_service.py:10](../../../backend/app/services/email_service.py) | Existing file, anchor line 10; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp63.py](../../../backend/app/tests/integration/test_remediation_wp63.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/auth_service.py:19-23](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/course_service.py:20-23](../../../backend/app/services/course_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:76-78,1198-1349,1597-1661](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/journal_service.py:392-409,565-582,666-683](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
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

1. Accept typed user/token/mail-or-outbox collaborators in AuthService and supply them through named Depends factories and explicit nested-service composition.
2. Remove concrete construction from auth business methods while preserving one request transaction owner. This is a bounded contribution to BUS-19, uniquely owned by WP-53.

## Tests to write BEFORE the fix

- Run auth behavior/recovery/scope/replay tests with SQL implementations and narrow doubles; no hidden service commit or optional insecure fallback appears.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp63.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Auth workflows can substitute declared collaborators without changing route logic or security behavior.

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

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-60, WP-51.

Required shared-file / migration ordering:
- WP-60 → WP-63: `backend/app/services/auth_service.py`, `backend/app/services/user_service.py`.
- WP-51 → WP-63: `backend/app/core/deps.py`, `backend/app/repositories/interfaces/user_repository.py`.
- WP-22 → WP-63: `backend/app/api/v1/auth.py`.
- WP-45 → WP-63: `backend/app/repositories/interfaces/refresh_token_repository.py`.
- WP-18 → WP-63: `backend/app/services/email_service.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-63-auth-injection` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
