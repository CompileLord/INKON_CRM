# WP-25 — Make upload keys unique and deletion independent

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Make upload keys unique and deletion independent. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-04** (Required (no prefix)): Uploaded documents with the same filename overwrite previous documents. [BUS-04 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-04--uploaded-documents-with-the-same-filename-overwrite-previous-documents). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/storage_service.py:40](../../../backend/app/services/storage_service.py) | Existing file, anchor line 40; only this WP’s stated behavior may change. |
| [backend/app/services/document_service.py:75](../../../backend/app/services/document_service.py) | Existing file, anchor line 75; only this WP’s stated behavior may change. |
| [backend/app/services/user_service.py:10](../../../backend/app/services/user_service.py) | Existing file, anchor line 10; only this WP’s stated behavior may change. |
| [backend/app/services/course_service.py:19](../../../backend/app/services/course_service.py) | Existing file, anchor line 19; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp25.py](../../../backend/app/tests/integration/test_remediation_wp25.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
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

1. Generate immutable UUID/object keys for both local and GCS writes while retaining original filename metadata.
2. Stage replacement images under new keys; remove previous objects only after successful DB commit through the established outbox or an explicitly durable cleanup intent. Preserve legacy object resolution.

## Tests to write BEFORE the fix

- Two identical filenames under one owner and across journals retain distinct bytes; deleting one preserves the other. Failed replacement leaves old photo/document usable and eventually removes orphan staged objects.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp25.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Uploads never overwrite another document by filename; replacements and deletes have documented transaction/cleanup behavior.

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

Functional prerequisites: WP-04, WP-18.

Required shared-file / migration ordering:
- WP-04 → WP-25: `backend/app/services/storage_service.py`, `backend/app/services/document_service.py`.
- WP-18 → WP-25: `backend/app/services/user_service.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-25-immutable-storage-keys` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
