# WP-17 — Make password recovery single-use and invalidate old access

Phase **2** · Priority **High** · Effort **M** · Status **todo**

## Goal

Make password recovery single-use and invalidate old access. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **SEC-BUS-03** (High): Password recovery leaves previously stolen access tokens usable. [SEC-BUS-03 — report section](../../backendsecurityaudit/02-business-domain-security-audit.md#sec-bus-03--password-recovery-leaves-previously-stolen-access-tokens-usable). Verification: Confirmed no credential epoch in access JWT or current-user check; continued validity bounded by expiry.
- **BUS-05** (Required (no prefix)): Password reset grants can be reused after successful reset. [BUS-05 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-05--password-reset-grants-can-be-reused-after-successful-reset). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Authorized scope correction

Source inspection on 2026-10-15 found that atomic user locking belongs in the repository contract and implementation. These paths are added before implementation to keep SQL out of authentication workflows and serialize reset with login/refresh issuance. Preserve existing token rotation and guardian/directory behavior. The legacy WP-06 full-access test manually signs a token; add its current auth_version claim so it still tests valid full access rather than weakening epoch validation.

The new head exposes two existing test assumptions. The WP-03 valid reset fixture needs its current epoch. WP-11’s database-configuration offline probe must retain its previously working boundary `c9e3f0a1b2c4` before the database-dependent WP-07 preflight, rather than moving with each new head. Its online test must still upgrade to the actual current head. Never modify the applied WP-07 migration or claim full-chain offline support. WP-27 has released this test file; its completed lifecycle changes remain frozen for independent audit.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/core/security.py:47](../../../backend/app/core/security.py) | Existing file, anchor line 47; only this WP’s stated behavior may change. |
| [backend/app/core/deps.py:14](../../../backend/app/core/deps.py) | Existing file, anchor line 14; only this WP’s stated behavior may change. |
| [backend/app/services/auth_service.py:194](../../../backend/app/services/auth_service.py) | Existing file, anchor line 194; only this WP’s stated behavior may change. |
| [backend/app/models/user.py:9](../../../backend/app/models/user.py) | Existing file, anchor line 9; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/user_repository.py](../../../backend/app/repositories/interfaces/user_repository.py) | Add narrowly typed user-locking operations for credential workflows. |
| [backend/app/repositories/sqlalchemy/user_repository.py](../../../backend/app/repositories/sqlalchemy/user_repository.py) | Implement user locking and fresh epoch reads; preserve existing guardian and directory queries. |
| [backend/alembic/versions/rwp17_auth_version.py](../../../backend/alembic/versions/rwp17_auth_version.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp17.py](../../../backend/app/tests/integration/test_remediation_wp17.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp06.py](../../../backend/app/tests/integration/test_remediation_wp06.py) | Keep valid full-access and reset fixtures aligned with the current epoch and immutable reset subject; preserve their successful access, identity and setup-scope assertions. |
| [backend/app/tests/integration/test_remediation_wp03.py](../../../backend/app/tests/integration/test_remediation_wp03.py) | Bind the manually signed valid reset fixture to the persisted user ID and current epoch; preserve identity-bound refresh assertions. |
| [backend/app/tests/integration/test_remediation_wp11.py](../../../backend/app/tests/integration/test_remediation_wp11.py) | Keep its database-only offline initialization probe at the historical offline-renderable boundary before WP-07, independent of later heads; preserve full current-head online migration checks and all other tests. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/auth_service.py:194-198,302-305](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/core/security.py:47-54](../../../backend/app/core/security.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/auth_service.py:262-270,280-305](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/auth_service.py`:

```text
194:         user.password_hash = hash_password(new_password)
195:         user.must_set_password = False
196:         await self.user_repo.update(user)
197: 
198:         await self.revoke_all_user_tokens(user.id)
199: 
200:         access_token = create_access_token(user.id, user.role)
201:         refresh_token = create_refresh_token()
```

## Step-by-step change

1. Add persisted auth_version and require it in newly issued access and reset grants. Lock/version the user during reset confirmation and increment the epoch atomically with password change and refresh revocation.
2. Bind reset grant to immutable persisted user ID, purpose, strict integer issue/expiry times within the five-minute grant lifetime, and current epoch; only one concurrent reset may match and advance that epoch. Update all token issuance paths and reject legacy/missing epochs after the coordinated cutover.

This merges two defects under one credential-epoch root cause without introducing a second reset storage system. Expect reauthentication during rollout; do not roll back by accepting old epochs. Existing test helpers call create_access_token with two arguments. A generator default epoch of zero may preserve new-user fixtures, but every runtime issuance must explicitly pass the loaded user epoch and validation must reject missing epochs; never add a permissive validation fallback to satisfy tests.

Audit correction: the first completed candidate accepted grants without expiry and selected the reset account by mutable email. A disposable database probe issued a real student grant, reassigned that email to a superadmin, and the old grant changed the superadmin password. Tests must reject absent/malformed/expired/future or overlong time claims and prevent a grant from following a reassigned email to another account. Cover successful recovery/revocation for privileged and student accounts and issuance at nonzero epochs. Preserve every existing acceptance criterion.

Audit correction 2: a real disposable PostgreSQL interleaving committed auth_version=1 after the downgrade safety count but before DROP COLUMN; downgrade then succeeded and deleted the revocation. Serialize downgrade safety inspection with credential writers before checking epochs. Add a regression using independent database sessions and explicit synchronization, proving a concurrent committed revocation cannot be discarded. Retain safe zero-epoch downgrade/re-upgrade and unsafe nonzero-epoch refusal checks. This is the second independent failed audit; the existing Sol-low executor takes over correction after its WP-13 work completes, preserving the current candidate and all acceptance gates.

## Tests to write BEFORE the fix

- Before fixing, replay a valid reset grant and use a pre-recovery access token. Test concurrent confirmations, rollback, privileged/student accounts and successful new access/refresh pairs.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp17.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

One reset grant cannot change the password twice; all prior access and refresh credentials fail after recovery commits; rollback cannot consume the only usable recovery state.

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

Use the exact NEW migration filename listed, a unique revision ID and the current single Alembic head after dependencies. Test upgrade, data preflight and rollback/recovery in a disposable database. Do not rewrite an applied revision or silently discard conflicting financial/authentication data.

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-03, WP-06.

Required shared-file / migration ordering:
- WP-06 → WP-17: `backend/app/core/security.py`, `backend/app/core/deps.py`, `backend/app/services/auth_service.py`.
- WP-07 → WP-17: `Alembic single-head revision chain`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-17-recovery-revocation` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
