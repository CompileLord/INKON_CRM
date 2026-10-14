# WP-26 — Use the configured storage backend across API and workers

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Use the configured storage backend across API and workers. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-14** (Required (no prefix)): Configured cloud storage is bypassed by business services and workers. [BUS-14 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-14--configured-cloud-storage-is-bypassed-by-business-services-and-workers). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Contributes without duplicating coverage ownership: [API-10 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-10--optional-move-domain-calculation-and-queries-out-of-routers-and-complete-typed-response-boundaries) (closure owner WP-52); [BUS-19 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-19--optional-narrow-service-dependencies-and-split-finance-responsibilities) (closure owner WP-53).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/storage_service.py:139](../../../backend/app/services/storage_service.py) | Existing file, anchor line 139; only this WP’s stated behavior may change. |
| [backend/app/services/document_service.py:38](../../../backend/app/services/document_service.py) | Existing file, anchor line 38; only this WP’s stated behavior may change. |
| [backend/app/services/user_service.py:194](../../../backend/app/services/user_service.py) | Existing file, anchor line 194; only this WP’s stated behavior may change. |
| [backend/app/services/course_service.py:187](../../../backend/app/services/course_service.py) | Existing file, anchor line 187; only this WP’s stated behavior may change. |
| [backend/app/core/deps.py:80](../../../backend/app/core/deps.py) | Existing file, anchor line 80; only this WP’s stated behavior may change. |
| [backend/app/api/v1/documents.py:15](../../../backend/app/api/v1/documents.py) | Existing file, anchor line 15; only this WP’s stated behavior may change. |
| [backend/app/api/v1/users.py:12](../../../backend/app/api/v1/users.py) | Existing file, anchor line 12; only this WP’s stated behavior may change. |
| [backend/app/api/v1/courses.py:186](../../../backend/app/api/v1/courses.py) | Existing file, anchor line 186; only this WP’s stated behavior may change. |
| [backend/app/workers/tasks.py:110](../../../backend/app/workers/tasks.py) | Existing file, anchor line 110; only this WP’s stated behavior may change. |
| [backend/app/workers/settings.py:15](../../../backend/app/workers/settings.py) | Existing file, anchor line 15; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp26.py](../../../backend/app/tests/integration/test_remediation_wp26.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-26.md](../results/WP-26.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/document_service.py:38](../../../backend/app/services/document_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/course_service.py:187](../../../backend/app/services/course_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/user_service.py:194](../../../backend/app/services/user_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/workers/tasks.py:110-119](../../../backend/app/workers/tasks.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/storage_service.py:139-143](../../../backend/app/services/storage_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/courses.py:186–315](../../../backend/app/api/v1/courses.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/mentors.py:137–172](../../../backend/app/api/v1/mentors.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/students.py:75–113](../../../backend/app/api/v1/students.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/journals.py:22–29](../../../backend/app/api/v1/journals.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/finance.py:51,140–148](../../../backend/app/api/v1/finance.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/core/deps.py:80–126](../../../backend/app/core/deps.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/finance.py:55](../../../backend/app/api/v1/finance.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/auth_service.py:19-23](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/course_service.py:20-23](../../../backend/app/services/course_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:76-78,1198-1349,1597-1661](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/journal_service.py:392-409,565-582,666-683](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/document_service.py`:

```text
38:         self.storage_service = LocalStorageService()
39: 
40:     async def upload_document(
41:         self,
42:         file: UploadFile,
43:         owner_type: str,
44:         owner_id: int,
45:         journal_id: Optional[int],
```

## Step-by-step change

1. Inject the configured StorageService into constructors and FastAPI dependency factories; remove direct local constructors from upload paths.
2. Add a backend-neutral stream/download interface for worker attachments and private authorized URL creation, avoiding private filesystem helpers.
3. Test both local and fake object storage; keep private objects inaccessible through permanent public URLs.

## Tests to write BEFORE the fix

- Upload on API instance A and download/send on instance B using shared object-store double; local compatibility, deleted objects and denied access remain correct.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp26.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

GCS configuration selects GCS everywhere and separate workers can read permitted attachments without local disk assumptions.

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


Performance / operational evidence: Compare bounded memory for streamed attachments and connection cleanup; no unmeasured throughput claim.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-25, WP-13.

Required shared-file / migration ordering:
- WP-25 → WP-26: `backend/app/services/storage_service.py`, `backend/app/services/document_service.py`, `backend/app/services/user_service.py`, `backend/app/services/course_service.py`.
- WP-21 → WP-26: `backend/app/core/deps.py`.
- WP-04 → WP-26: `backend/app/api/v1/documents.py`.
- WP-18 → WP-26: `backend/app/workers/settings.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-26-storage-injection` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-26.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
