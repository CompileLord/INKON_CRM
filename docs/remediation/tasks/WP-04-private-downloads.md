# WP-04 — Protect private document bytes and revoke public paths

Phase **1** · Priority **Critical** · Effort **M** · Status **todo**

## Goal

Protect private document bytes and revoke public paths. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **API-01** (Critical:): Critical: Private documents are served without authentication. [API-01 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-01--critical-private-documents-are-served-without-authentication). Verification: Confirmed public mount and public caching; download guard absent. Existing listing policy must be reused explicitly.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/main.py:67](../../../backend/app/main.py) | Existing file, anchor line 67; only this WP’s stated behavior may change. |
| [backend/app/api/v1/documents.py:15](../../../backend/app/api/v1/documents.py) | Existing file, anchor line 15; only this WP’s stated behavior may change. |
| [backend/app/services/document_service.py:13](../../../backend/app/services/document_service.py) | Existing file, anchor line 13; only this WP’s stated behavior may change. |
| [backend/app/services/storage_service.py:6](../../../backend/app/services/storage_service.py) | Existing file, anchor line 6; only this WP’s stated behavior may change. |
| [backend/app/schemas/document.py:7](../../../backend/app/schemas/document.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [frontend/src/lib/documents/endpoints.ts:1](../../../frontend/src/lib/documents/endpoints.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/documents/types.ts:1](../../../frontend/src/lib/documents/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/components/documents/DocumentsTab.tsx:1](../../../frontend/src/components/documents/DocumentsTab.tsx) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [CONTRACT.md:1](../../../CONTRACT.md) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp04.py](../../../backend/app/tests/integration/test_remediation_wp04.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-04.md](../results/WP-04.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/main.py:67–70,97–101](../../../backend/app/main.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/main.py`:

```text
67: import os
68: from fastapi.staticfiles import StaticFiles
69: os.makedirs(settings.STORAGE_PATH, exist_ok=True)
70: app.mount("/storage", StaticFiles(directory=settings.STORAGE_PATH), name="storage")
71: 
72: app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth", tags=["Auth"])
73: app.include_router(users_router, prefix=f"{settings.API_V1_STR}/users", tags=["Users"])
74: app.include_router(students_router, prefix=f"{settings.API_V1_STR}/students", tags=["Students"])
```

## Step-by-step change

1. Replace whole-tree StaticFiles with explicit public avatar/course-asset mounts. Add an authenticated document-ID download that enforces current role/object policy and excludes deleted records before opening bytes.
2. Return private/no-store headers and stop public cache headers on private paths. Keep GCS objects private; do not return permanent public bucket URLs.
3. Update browser downloads to authenticated fetch/blob with prompt URL revocation, or a short-lived authorized private URL. Document purge/expiry of historical public cache copies as an operational follow-up.

Current listing permits mentors to see student documents broadly (document_service.py:138-145). Do not silently infer a new mentor-document policy from directory scope; stop for a specific policy decision if changing that behavior is necessary. Keep private files unavailable during rollback; cached external copies cannot be revoked by an application code revert.

## Tests to write BEFORE the fix

- Run WP-02 private-document test first. Seed two owners and deleted documents; test direct old storage URL, anonymous, wrong owner, authorized owner/staff, path traversal and private cache headers.
- Exercise browser download without placing bearer credentials in URLs; public avatar/course images still work.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp04.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

Critical rule: capture the reproducing failure **before** implementation, then demonstrate the same assertion passes afterward. No skip/xfail, weakened assertion or response-shape-only substitute. If reproducing evidence contradicts this plan, stop and report.

Explicit baseline module (run from backend):

```bash
PYTHONDONTWRITEBYTECODE=1 python -m pytest app/tests/regression/critical_reproductions.py -k private_document_download -q -p no:cacheprovider
```

## Acceptance criteria

No unauthenticated private bytes from old or new URLs; canonical role policy applies to bytes; browser flow and response contract stay synchronized.

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


Verification focuses on the exact behavioral/security tests above. No speculative performance benchmark is required.

Regenerate contract with `python backend/scripts/generate_contract.py` from repository root in the isolated test environment; synchronize only the listed client types/callers and verify them by reading their contents (frontend/src/lib is broadly gitignored). New visible text must use existing translations or stop to add exact locale paths to the plan.

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-02.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-04-private-downloads` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-04.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
