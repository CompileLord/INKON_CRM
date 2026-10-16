# WP-25 — Make upload keys unique and deletion independent

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Make upload keys unique and deletion independent. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-04** (Required (no prefix)): Uploaded documents with the same filename overwrite previous documents. [BUS-04 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-04--uploaded-documents-with-the-same-filename-overwrite-previous-documents). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Authorized scope correction

Current main removed GCS, WP04 already made document names unique, and the existing outbox handles only encrypted mail. Full rollback/crash-safe orphan recovery therefore requires the exact storage-intent, repository, worker, migration and resource-lifecycle paths below. This is one storage-lifecycle fix; no email redesign, API schema change or general storage injection refactor. The independently bounded reservation engine avoids deadlock when authentication retains the sole request-pool connection. Preserve all original acceptance criteria.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/storage_service.py:40](../../../backend/app/services/storage_service.py) | Existing file, anchor line 40; only this WP’s stated behavior may change. |
| [backend/app/services/document_service.py:75](../../../backend/app/services/document_service.py) | Existing file, anchor line 75; only this WP’s stated behavior may change. |
| [backend/app/services/user_service.py:10](../../../backend/app/services/user_service.py) | Existing file, anchor line 10; only this WP’s stated behavior may change. |
| [backend/app/services/course_service.py:19](../../../backend/app/services/course_service.py) | Existing file, anchor line 19; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp25.py](../../../backend/app/tests/integration/test_remediation_wp25.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/services/document_file_storage.py](../../../backend/app/services/document_file_storage.py) | Preserve private-document confinement and immutable key contract. |
| [backend/app/services/storage_lifecycle_service.py](../../../backend/app/services/storage_lifecycle_service.py) | NEW typed reservation, adoption and durable cleanup orchestration. |
| [backend/app/models/storage_intent.py](../../../backend/app/models/storage_intent.py) | NEW durable staging/deletion intent mapping. |
| [backend/app/models/__init__.py](../../../backend/app/models/__init__.py) | Register storage intent mapping. |
| [backend/app/repositories/interfaces/storage_intent_repository.py](../../../backend/app/repositories/interfaces/storage_intent_repository.py) | NEW narrow staging, claim and reference-check contracts. |
| [backend/app/repositories/sqlalchemy/storage_intent_repository.py](../../../backend/app/repositories/sqlalchemy/storage_intent_repository.py) | NEW SQL implementation; no HTTP or filesystem business logic. |
| [backend/app/workers/storage_cleanup.py](../../../backend/app/workers/storage_cleanup.py) | NEW bounded retryable storage-intent processor. |
| [backend/app/workers/settings.py](../../../backend/app/workers/settings.py) | Register cleanup and its resource lifecycle. |
| [backend/alembic/versions/rwp25_storage_intents.py](../../../backend/alembic/versions/rwp25_storage_intents.py) | NEW additive migration, parent accepted WP19 revision c91f0a4b7e19. |
| [backend/app/repositories/interfaces/course_repository.py](../../../backend/app/repositories/interfaces/course_repository.py) | Narrow course row-lock lookup contract. |
| [backend/app/repositories/sqlalchemy/course_repository.py](../../../backend/app/repositories/sqlalchemy/course_repository.py) | Course row lock and reload implementation. |
| [backend/app/tests/integration/test_avatar.py](../../../backend/app/tests/integration/test_avatar.py) | Replace immediate-deletion assertion with committed-intent and actual eventual-cleanup assertions. |
| [backend/app/db/storage_intent_session.py](../../../backend/app/db/storage_intent_session.py) | NEW separately bounded reservation engine/session owner. |
| [backend/app/main.py](../../../backend/app/main.py) | Dispose the separately bounded storage-intent engine during API shutdown. |
| [backend/app/tests/integration/test_remediation_wp13.py](../../../backend/app/tests/integration/test_remediation_wp13.py) | Adapt the ARQ-only document producer fake to the lifecycle boundary; preserve exact enqueue and added-document assertions. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/storage_service.py:40-62,112-120](../../../backend/app/services/storage_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/document_service.py:75-86,112-121](../../../backend/app/services/document_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/storage_service.py`:

```text
40:         
41:         # Get only the basename to strip any path components
42:         filename = os.path.basename(filename)
43:         filename = re.sub(r'[^a-zA-Z0-9_.-]', '', filename)
44:         if not filename or filename in ('.', '..'):
45:             filename = f"file_{uuid.uuid4().hex}"
46: 
47:         target_dir = os.path.abspath(os.path.join(self.storage_path, entity_type, str(entity_id)))
```

## Step-by-step change

1. Generate immutable UUID/object keys for current local storage while retaining original filename metadata and safe image extensions. Create files exclusively; collisions must never overwrite. Preserve WP04 document UUIDs and confinement; GCS was removed from main and is outside this task.
2. Use separate durable storage intents; preserve the email-only encrypted outbox. Reserve each exact key in a short independent committed transaction before writing bytes. Its bounded engine has pool_size=1, max_overflow=0 and finite checkout/statement timeouts, adding at most one DB connection per API or cleanup-worker process. API and worker lifecycles dispose their own engines; never commit the request transaction or reuse its occupied pool for reservations.
3. Lock avatar/course owners and reload current paths before replacement. Reservation rows have no owner foreign keys. The request locks a still-pending staging intent before writing, then adopts it and records old-object cleanup in the same transaction as reference updates. A claimed/removed reservation cannot be adopted. Rollback, partial write or process death leaves independently committed staging intents recoverable.
4. Document deletion soft-deletes metadata and enqueues cleanup in the same request transaction. Delete bytes only through committed intents. Cleanup claims eligible rows with SKIP LOCKED, never locks owner rows, and uses MVCC reference checks. Protect all user/course photo references and active documents, including shared legacy paths. Claimed cleanup must survive worker restart, deletion-before-settlement crashes and retryable failures; never silently discard unresolved intents after a retry limit.
5. Validate canonical relative paths at reservation and deletion: approved entity prefix, positive owner id, maximum 255 characters, no traversal/absolute/root paths and symlink-safe confinement. Preserve valid legacy resolution. No directory-scan erasure or operational-data cleanup. Request/worker races must never delete an active adopted object.

## Tests to write BEFORE the fix

- Two identical filenames under one owner and across journals retain distinct bytes; deleting one preserves the other. Failed replacement leaves old photo/document usable and eventually removes orphan staged objects.
- Real request commit versus rollback, failed thumbnail writes, interrupted-upload and cleanup-worker restart, deletion-before-settlement retry, concurrent replacements using independent PostgreSQL sessions, worker-versus-upload lock barriers, shared legacy paths, path confinement and unchanged filename/MIME/size metadata.
- A held sole request-pool connection must not prevent bounded independent reservation. Resource shutdown and migration upgrade/data preservation/downgrade/recovery must pass. Run the actual worker for eventual deletion; do not replace the existing avatar assertion with a weaker intent-only check.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp25.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Uploads never overwrite another document by filename; replacements and deletes have documented transaction/cleanup behavior.

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

Functional prerequisites: WP-04, WP-18.

Required shared-file / migration ordering:
- WP-04 → WP-25: `backend/app/services/storage_service.py`, `backend/app/services/document_service.py`.
- WP-18 → WP-25: `backend/app/services/user_service.py`.
- WP-19 → WP-25: `backend/app/models/__init__.py`, `Alembic single-head revision chain`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-25-immutable-storage-keys` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
