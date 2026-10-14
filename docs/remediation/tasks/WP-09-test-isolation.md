# WP-09 — Make test database and Redis cleanup explicitly disposable

Phase **1** · Priority **Critical** · Effort **M** · Status **todo**

## Goal

Make test database and Redis cleanup explicitly disposable. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **DATA-02** (Critical:): Critical: Tests flush the application's configured Redis database. [DATA-02 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-02--critical-tests-flush-the-applications-configured-redis-database). Verification: Confirmed imported app Redis FLUSHDB; baseline must isolate Redis before imports and verify disposable PostgreSQL target.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/tests/conftest.py:24](../../../backend/app/tests/conftest.py) | Existing file, anchor line 24; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp09.py](../../../backend/app/tests/integration/test_remediation_wp09.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-09.md](../results/WP-09.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/tests/conftest.py:24–30,77–80](../../../backend/app/tests/conftest.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/tests/conftest.py`:

```text
24: from app.main import app
25: from app.core.config import settings
26: from app.core.deps import get_db_session
27: from app.core.security import hash_password, create_access_token
28: from app.core.redis import redis_client
29: from app.db.base import Base
30: from app.models.user import User, UserRole
31: from app.models.refresh_token import RefreshToken
```

## Step-by-step change

1. Validate dedicated test PostgreSQL and Redis targets before application imports or destructive fixture execution. Never derive test Redis from the ordinary runtime fallback.
2. Replace unrestricted FLUSHDB with run-owned key cleanup on a dedicated disposable connection and ensure API-only tests get the same cleanup. Inject both request and worker database factories consistently.

Run the WP-01 suite baseline in isolation before changing fixtures, then rerun after. Keep infrastructure safety tests independent of destructive fixture setup where necessary by launching controlled subprocesses.

## Tests to write BEFORE the fix

- Before fixing, a fake production/shared target must be rejected before any delete/flush/drop call. Test client-only cleanup, failure cleanup and a sentinel key belonging to another namespace.
- Use subprocesses to verify configuration is applied before module import; do not test safety by flushing a real shared database.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp09.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

Critical rule: capture the reproducing failure **before** implementation, then demonstrate the same assertion passes afterward. No skip/xfail, weakened assertion or response-shape-only substitute. If reproducing evidence contradicts this plan, stop and report.

## Acceptance criteria

Tests cannot erase application/shared Redis state; target guards cover PostgreSQL schema deletion and all fixture variants.

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

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-01.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-09-test-isolation` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-09.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
