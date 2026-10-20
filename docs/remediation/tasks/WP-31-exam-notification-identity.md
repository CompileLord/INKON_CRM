# WP-31 — Separate sibling notifications and document revisions

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Separate sibling notifications and document revisions. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-10** (Required (no prefix)): Exam notifications collide for siblings and suppress document-only updates. [BUS-10 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-10--exam-notifications-collide-for-siblings-and-suppress-document-only-updates). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

Scope correction (2026-10-19): WP-30 moves atomic notification persistence behind its existing repository interface. Fingerprint reservation must use that boundary rather than adding SQL to the service. The newer BE-3 image scheduling pipeline remains unchanged; this package owns the legacy document/exam notification path.

| File | Snapshot location / intent |
|---|---|
| [backend/app/workers/tasks.py:87](../../../backend/app/workers/tasks.py) | Existing file, anchor line 87; only this WP’s stated behavior may change. |
| [backend/app/services/notification_service.py:12](../../../backend/app/services/notification_service.py) | Existing file, anchor line 12; only this WP’s stated behavior may change. |
| [backend/app/models/notification_log.py:10](../../../backend/app/models/notification_log.py) | Existing file, anchor line 10; only this WP’s stated behavior may change. |
| [backend/alembic/versions/rwp31_exam_revision.py](../../../backend/alembic/versions/rwp31_exam_revision.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp31.py](../../../backend/app/tests/integration/test_remediation_wp31.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| `backend/app/tests/integration/test_remediation_wp31_migration.py` | Migration/cutover tests extracted to keep every file below the enforced 20 KB limit. |
| `backend/app/repositories/interfaces/notification_log_repository.py` | Extend atomic reservation boundary for per-student revision fingerprints. |
| `backend/app/repositories/sqlalchemy/notification_log_repository.py` | Persist and compare delivery identity without journal/sibling collisions. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/workers/tasks.py:87-101,127-134,138-139](../../../backend/app/workers/tasks.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/workers/tasks.py`:

```text
87:         recipient = str(student.parent_telegram_chat_id)
88:         notification_date = date.today()
89: 
90:         async def check_revision_func() -> bool:
91:             log_stmt = select(NotificationLog).filter(
92:                 NotificationLog.recipient == recipient,
93:                 NotificationLog.type == NotificationType.EXAM_RESULT,
94:                 NotificationLog.related_entity_id == journal_id,
```

## Step-by-step change

1. Key exam notifications by student summary or explicit student+journal identity rather than journal alone.
2. Persist a revision fingerprint including score/summary version and document identity; safely migrate/retire legacy idempotency identities without resending all history.
3. Select the newest active document deterministically by upload timestamp and ID; deliver the matching student attachment. Preserve BE-3 score scheduling and its independent photo-delivery pipeline.
4. Preserve the named `uq_notification_log` conflict interface and prior-image reads. Do not destructively rekey legacy history, collide journal IDs with summary IDs, or label ambiguous sibling history as proven delivery. Propose the precise cutover/baseline treatment before implementing it. Same revision replay, including across dates, must not create new deliveries.

## Tests to write BEFORE the fix

- Siblings sharing chat and score each receive their own result; same revision deduplicates; new document with unchanged score triggers one correct attachment; retry remains safe.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp31.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

No sibling suppression/misattribution and document-only revisions are delivered once per claim semantics.

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

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-30.

Required shared-file / migration ordering:
- WP-30 → WP-31: `backend/app/workers/tasks.py`, `backend/app/services/notification_service.py`, `backend/app/models/notification_log.py`, `Alembic single-head revision chain`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-31-exam-notification-identity` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
