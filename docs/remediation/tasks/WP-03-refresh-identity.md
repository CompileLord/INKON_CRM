# WP-03 — Make refresh credentials unique and atomically single-use

Phase **1** · Priority **Critical** · Effort **M** · Status **todo**

## Goal

Make refresh credentials unique and atomically single-use. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-01** (Critical:): Critical: Refresh tokens are identical across users minted in the same second. [BUS-01 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-01--critical-refresh-tokens-are-identical-across-users-minted-in-the-same-second). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **SEC-BUS-01** (Critical): Cross-user refresh produces a privileged access grant: service-level confirmation of BUS-01. [SEC-BUS-01 — report section](../../backendsecurityaudit/02-business-domain-security-audit.md#sec-bus-01--cross-user-refresh-produces-a-privileged-access-grant-service-level-confirmation-of-bus-01). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **DATA-04** (Required (no severity prefix in title)): Token lookup does not consume refresh tokens atomically. [DATA-04 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-04--token-lookup-does-not-consume-refresh-tokens-atomically). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/core/security.py:60](../../../backend/app/core/security.py) | Existing file, anchor line 60; only this WP’s stated behavior may change. |
| [backend/app/services/auth_service.py:41](../../../backend/app/services/auth_service.py) | Existing file, anchor line 41; only this WP’s stated behavior may change. |
| [backend/app/models/refresh_token.py:13](../../../backend/app/models/refresh_token.py) | Existing file, anchor line 13; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/refresh_token_repository.py:7](../../../backend/app/repositories/interfaces/refresh_token_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/repositories/sqlalchemy/refresh_token_repository.py:28](../../../backend/app/repositories/sqlalchemy/refresh_token_repository.py) | Existing file, anchor line 28; only this WP’s stated behavior may change. |
| [backend/alembic/versions/rwp03_refresh_identity.py](../../../backend/alembic/versions/rwp03_refresh_identity.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp03.py](../../../backend/app/tests/integration/test_remediation_wp03.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/core/security.py:60-72](../../../backend/app/core/security.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/auth_service.py:41-51,69-83](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/auth_service.py:41-51,69-101](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/repositories/sqlalchemy/refresh_token_repository.py:28–36](../../../backend/app/repositories/sqlalchemy/refresh_token_repository.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/models/refresh_token.py:13](../../../backend/app/models/refresh_token.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/core/security.py`:

```text
60: def create_refresh_token(expires_delta: Optional[timedelta] = None) -> str:
61:     now = datetime.now(timezone.utc)
62:     if expires_delta:
63:         expire = now + expires_delta
64:     else:
65:         expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
66: 
67:     to_encode: Dict[str, Any] = {
```

## Step-by-step change

1. Issue a random jti plus subject and refresh type; validate purpose/subject and update every issuance path.
2. Replace lookup-then-revoke with identity-bound conditional UPDATE RETURNING in the same transaction as successor insertion; require one winner.
3. In a forward migration invalidate ambiguous legacy credentials and resolve duplicate legacy hashes before adding uniqueness. Never guess which colliding user owns an old token.

Legacy sessions must sign in again. Rollback must not restore identity-free tokens; roll forward or keep refresh disabled. Keep access-token format work limited to what refresh needs.

## Tests to write BEFORE the fix

- Run WP-02 same-second test before fixing. Add same-user rotation, two-user logout isolation, malformed purpose/subject, expired credential and two-session replay cases.
- Assert failed rotation rolls back consumption and successful concurrent rotation issues exactly one successor.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp03.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

Critical rule: capture the reproducing failure **before** implementation, then demonstrate the same assertion passes afterward. No skip/xfail, weakened assertion or response-shape-only substitute. If reproducing evidence contradicts this plan, stop and report.

Explicit baseline module (run from backend):

```bash
PYTHONDONTWRITEBYTECODE=1 python -m pytest app/tests/regression/critical_reproductions.py -k refresh_cross_user_same_second -q -p no:cacheprovider
```

## Acceptance criteria

No cross-user resolution; distinct same-second credentials; exactly one successful consume; all issuance sites updated and migration rehearsed.

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

Use the exact NEW migration filename listed, a unique revision ID and the current single Alembic head after dependencies. Test upgrade, data preflight and rollback/recovery in a disposable database. Do not rewrite an applied revision or silently discard conflicting financial/authentication data.

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-02.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-03-refresh-identity` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
