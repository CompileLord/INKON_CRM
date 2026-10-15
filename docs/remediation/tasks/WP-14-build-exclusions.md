# WP-14 — Keep private uploads out of build uploads and image layers

Phase **2** · Priority **High** · Effort **S** · Status **todo**

## Goal

Keep private uploads out of build uploads and image layers. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **SEC-DATA-02** (High): Local uploads enter container images and remote build artifacts. [SEC-DATA-02 — report section](../../backendsecurityaudit/03-data-infrastructure-security-audit.md#sec-data-02--local-uploads-enter-container-images-and-remote-build-artifacts). Verification: Confirmed storage COPY and absent Docker exclusion. Google Cloud Build upload also needs explicit .gcloudignore; Docker ignore alone is insufficient.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/Dockerfile:29](../../../backend/Dockerfile) | Existing file, anchor line 29; only this WP’s stated behavior may change. |
| [backend/.dockerignore:1](../../../backend/.dockerignore) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/.gcloudignore](../../../backend/.gcloudignore) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/scripts/gcp_deploy.sh:39](../../../backend/scripts/gcp_deploy.sh) | Existing file, anchor line 39; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp14.py](../../../backend/app/tests/integration/test_remediation_wp14.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/Dockerfile:29–35](../../../backend/Dockerfile) — current source range checked during planning. Context does not grant write ownership.
- [backend/.dockerignore:1–15](../../../backend/.dockerignore) — current source range checked during planning. Context does not grant write ownership.
- [backend/scripts/gcp_deploy.sh:39–40](../../../backend/scripts/gcp_deploy.sh) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/Dockerfile`:

```text
29: COPY --chown=appuser:appgroup alembic.ini .
30: COPY --chown=appuser:appgroup alembic/ ./alembic/
31: COPY --chown=appuser:appgroup app/ ./app/
32: COPY --chown=appuser:appgroup scripts/ ./scripts/
33: COPY --chown=appuser:appgroup storage/ ./storage/
34: 
35: RUN mkdir -p /app/storage && chown -R appuser:appgroup /app/storage
36: 
```

## Step-by-step change

Execution correction (2026-10-15): the upload-listing guard must reject unsafe files even in a listing large enough for an early-exiting grep to cause upstream SIGPIPE under `pipefail`. Add a large-list regression using a fake gcloud command; never exercise an actual deployment. Two independent completed-result FAIL audits (ignore re-inclusion coverage, then this production guard bypass) trigger AGENTS.md §4.7 escalation to GPT-6.1 Sol low. Preserve the original executor identity, worktree, source changes, evidence and every acceptance gate. The bounded remaining source ownership is `backend/scripts/gcp_deploy.sh` and `backend/app/tests/integration/test_remediation_wp14.py`; other original source changes are preserved.

1. Remove COPY storage and create empty writable runtime directories. Exclude uploads and seed caches from both Docker context and the Cloud Build upload context (.gcloudignore).
2. Build from a disposable context containing a harmless sentinel and inspect sent files plus all image layers. Inventory potentially affected historic artifacts through an operator procedure; do not delete artifacts without the required release owner decision.

## Tests to write BEFORE the fix

- Ensure sentinel uploads never appear in gcloud upload listings, Docker context or exported image layers; image boot and normal private upload/download smoke checks succeed.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp14.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

No operational upload enters either remote build artifacts or runtime images. Historical cleanup is tracked with owner/evidence rather than claimed complete.

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

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-04.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**S**: localized change or narrowly scoped evidence collection.

Use branch `remediation/wp-14-build-exclusions` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
