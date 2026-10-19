# WP-30 — Claim notification delivery and record actual outcomes

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Claim notification delivery and record actual outcomes. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-08** (Required (no prefix)): Reminder logs mark queue acceptance as successful delivery. [BUS-08 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-08--reminder-logs-mark-queue-acceptance-as-successful-delivery). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **BUS-09** (Required (no prefix)): Failed/revised notification rows can be sent by multiple workers. [BUS-09 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-09--failedrevised-notification-rows-can-be-sent-by-multiple-workers). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

Scope correction (2026-10-19): notification delivery SQL must live in the existing repository behind its interface; dependency wiring and current callers may change only to inject that interface. This preserves the repository/service boundary while adding atomic claims. The newer exam-result card delivery pipeline remains outside this package.

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/notification_service.py:120](../../../backend/app/services/notification_service.py) | Existing file, anchor line 120; only this WP’s stated behavior may change. |
| [backend/app/models/notification_log.py:10](../../../backend/app/models/notification_log.py) | Existing file, anchor line 10; only this WP’s stated behavior may change. |
| [backend/app/workers/tasks.py:42](../../../backend/app/workers/tasks.py) | Existing file, anchor line 42; only this WP’s stated behavior may change. |
| [backend/alembic/versions/rwp30_delivery_claims.py](../../../backend/alembic/versions/rwp30_delivery_claims.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/schemas/notification.py:7](../../../backend/app/schemas/notification.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [CONTRACT.md:1](../../../CONTRACT.md) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/notifications/types.ts:1](../../../frontend/src/lib/notifications/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp30.py](../../../backend/app/tests/integration/test_remediation_wp30.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| `backend/app/repositories/interfaces/notification_log_repository.py` | Extend existing notification persistence interface for atomic claims and delivery outcomes. |
| `backend/app/repositories/sqlalchemy/notification_log_repository.py` | Implement claim SQL and notification persistence. |
| `backend/app/core/deps.py` | Wire notification repository/service dependencies only. |
| `backend/app/api/v1/notifications.py` | Inject notification service only. |
| `backend/app/services/telegram_link_service.py` | Adapt existing notification service construction only. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/workers/tasks.py:42-46,235-251](../../../backend/app/workers/tasks.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/notification_service.py:120-129](../../../backend/app/services/notification_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/notification_service.py:77-102,120-135](../../../backend/app/services/notification_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/workers/tasks.py`:

```text
42: 
43: 
44: async def send_telegram_message(ctx, chat_id: int, text: str) -> None:
45:     try:
46:         await bot.send_message(chat_id, text)
47:     except (TelegramForbiddenError, TelegramBadRequest) as e:
48:         logger.error(f"Telegram send failed to {chat_id}: {e}")
49: 
```

## Step-by-step change

1. Use one delivery owner with atomic revision claim, lease and claim token. Carry notification ID into the task and finalize only the owning claim.
2. Represent queued/inflight separately from SENT; SENT follows Telegram success, permanent error follows FAILED. Recover expired leases with finite attempts.
3. Document at-least-once behavior for crash-after-send because Telegram offers no general idempotency key; do not promise exactly-once transport.

## Tests to write BEFORE the fix

- Two workers retry a FAILED/revised row: one valid claim sends. Enqueue success followed by Telegram failure records FAILED; abandoned claims retry and stale owners cannot finalize.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp30.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Logs report delivery rather than enqueue; concurrent claim races are controlled and residual remote ambiguity is documented.

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

Use the exact NEW migration filename listed, a unique revision ID and the current single Alembic head after dependencies. Test upgrade, data preflight and rollback/recovery in a disposable database. Do not rewrite an applied revision or silently discard conflicting financial/authentication data.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-29.

Required shared-file / migration ordering:
- WP-29 → WP-30: `backend/app/workers/tasks.py`.
- WP-24 → WP-30: `CONTRACT.md`.
- WP-19 → WP-30: `Alembic single-head revision chain`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-30-delivery-claims` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
