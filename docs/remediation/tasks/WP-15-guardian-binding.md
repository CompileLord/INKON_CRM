# WP-15 — Close guardian property bypasses and bind the correct parent contact

Phase **2** · Priority **High** · Effort **M** · Status **todo**

## Goal

Close guardian property bypasses and bind the correct parent contact. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **SEC-API-01** (High): High — Self-service replaces the verified guardian delivery destination. [SEC-API-01 — report section](../../backendsecurityaudit/01-api-layer-security-audit.md#sec-api-01--high--self-service-replaces-the-verified-guardian-delivery-destination). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **BUS-17** (Required (no prefix)): Parent Telegram linking searches the student's phone instead of parent phone. [BUS-17 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-17--parent-telegram-linking-searches-the-students-phone-instead-of-parent-phone). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Authorized backend ownership correction

The user assigned this remediation session backend-only ownership while a separate Claude agent owns the frontend. On 2026-10-15 the user authorized correcting plan/documentation conflicts before implementation. Client files below are therefore read-only contract context for this executor; report the exact self-update contract delta in WP-15 results for the frontend owner. Do not edit frontend files or treat their separately owned checks as backend gates. Backend schema/contract generation, security tests and all backend acceptance criteria remain mandatory.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/schemas/user.py:32](../../../backend/app/schemas/user.py) | Existing file, anchor line 32; only this WP’s stated behavior may change. |
| [backend/app/services/user_service.py:10](../../../backend/app/services/user_service.py) | Existing file, anchor line 10; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/user_repository.py](../../../backend/app/repositories/interfaces/user_repository.py) | Add the narrow typed guardian-candidate lookup/locking contract used by the binding workflow. |
| [backend/app/repositories/sqlalchemy/user_repository.py](../../../backend/app/repositories/sqlalchemy/user_repository.py) | Implement configured parent-phone lookup with deterministic row locking; retain SQL in the repository layer. |
| [backend/app/telegram_bot/handlers/start.py:25](../../../backend/app/telegram_bot/handlers/start.py) | Existing file, anchor line 25; only this WP’s stated behavior may change. |
| [CONTRACT.md:1](../../../CONTRACT.md) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp15.py](../../../backend/app/tests/integration/test_remediation_wp15.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_integrations_and_polish.py](../../../backend/app/tests/integration/test_integrations_and_polish.py) | Update only the legacy Telegram webhook/parent-binding fixture and assertions to use distinct student and configured parent phones; retain end-to-end webhook coverage. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/schemas/user.py:32-39](../../../backend/app/schemas/user.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/users.py:28-35](../../../backend/app/api/v1/users.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/telegram_bot/handlers/start.py:25-40,52-57](../../../backend/app/telegram_bot/handlers/start.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/schemas/user.py`:

```text
32: class UserSelfUpdate(BaseModel):
33:     model_config = {"extra": "forbid"}
34:     first_name: Optional[str] = Field(None, min_length=1, max_length=100)
35:     last_name: Optional[str] = Field(None, min_length=1, max_length=100)
36:     date_of_birth: Optional[date] = None
37:     phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
38:     parent_telegram_chat_id: Optional[int] = None
39:     parent_phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
```

## Step-by-step change

1. Remove guardian chat/phone from ordinary self-update schema and assignments while preserving authorized administrator provisioning.
2. Match bot contact to the configured parent_phone, verify sender ownership and private chat, and refuse replacement of an existing binding unless an administrator explicitly resets it.
3. Normalize lookup consistently; document safe initial-binding/rebinding behavior. Put the guardian candidate query and deterministic row locks in the user repository behind its typed interface, with policy and binding mutation coordinated by the service. Test concurrent attempts against independent PostgreSQL sessions so existing bindings cannot be replaced by a losing request. A new invitation product is not required for this bounded fix.

## Tests to write BEFORE the fix

- Student PATCH guardian fields fails and leaves destination unchanged; distinct student/parent phones bind only the parent; group chat, foreign contact and unauthorized replacement fail. Shared-parent siblings bind to the verified destination under the explicit policy.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp15.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Only the configured verified guardian destination can receive results; student self-service cannot replace it.

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

Regenerate contract with `python backend/scripts/generate_contract.py` from repository root in the isolated test environment. Read `frontend/src/lib/users/types.ts` and `frontend/src/lib/users/formMapping.ts` only as client context and record required consumer synchronization for the separate frontend owner; do not write them in this backend task. New visible text must use existing translations or stop to add exact locale paths to the plan.

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-06, WP-09.

Required shared-file / migration ordering:
- WP-04 → WP-15: `CONTRACT.md`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-15-guardian-binding` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
