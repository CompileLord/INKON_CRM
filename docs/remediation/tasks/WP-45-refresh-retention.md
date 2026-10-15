# WP-45 — Bound retention of expired authentication rows

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Bound retention of expired authentication rows. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **PERF-DATA-05** (Medium): Refresh rotation continuously enlarges an authentication table without cleanup. [PERF-DATA-05 — report section](../../backendperformanceaudit/03-data-infrastructure-performance-audit.md#perf-data-05--refresh-rotation-continuously-enlarges-an-authentication-table-without-cleanup). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/models/refresh_token.py:11](../../../backend/app/models/refresh_token.py) | Existing file, anchor line 11; only this WP’s stated behavior may change. |
| [backend/app/repositories/sqlalchemy/refresh_token_repository.py:15](../../../backend/app/repositories/sqlalchemy/refresh_token_repository.py) | Existing file, anchor line 15; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/refresh_token_repository.py:7](../../../backend/app/repositories/interfaces/refresh_token_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/workers/token_retention.py](../../../backend/app/workers/token_retention.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/workers/settings.py:15](../../../backend/app/workers/settings.py) | Existing file, anchor line 15; only this WP’s stated behavior may change. |
| [backend/alembic/versions/rwp45_refresh_retention.py](../../../backend/alembic/versions/rwp45_refresh_retention.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp45.py](../../../backend/app/tests/integration/test_remediation_wp45.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/models/refresh_token.py:11–20](../../../backend/app/models/refresh_token.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/repositories/sqlalchemy/refresh_token_repository.py:15–36](../../../backend/app/repositories/sqlalchemy/refresh_token_repository.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/alembic/versions/c592774b16d3_initial_migration.py:100–112](../../../backend/alembic/versions/c592774b16d3_initial_migration.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/models/refresh_token.py`:

```text
11:     id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
12:     user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
13:     token_hash: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
14:     expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
15:     revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
16:     created_at: Mapped[datetime] = mapped_column(
17:         DateTime(timezone=True),
18:         server_default=func.now(),
```

## Step-by-step change

1. Define expiry/revocation retention consistent with WP-03 replay detection; purge only eligible rows in bounded ordered batches.
2. Add cleanup/active-user indexes only when actual query plans justify them; schedule cleanup with bounded locks/WAL and safe retries.

## Tests to write BEFORE the fix

- Live tokens and required replay evidence survive; expired eligible rows purge in batches; crash/restart is idempotent; concurrent rotation is unaffected.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp45.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Token storage has an explicit retention policy and bounded cleanup, without weakening replay protection.

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


Performance / operational evidence: Measure daily inserts, relation/index bytes, vacuum/WAL and lookup/revoke/purge plans at 100k/1M representative rows; illustrative annual growth is not production traffic.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

Use the exact NEW migration filename listed, a unique revision ID and the current single Alembic head after dependencies. Test upgrade, data preflight and rollback/recovery in a disposable database. Do not rewrite an applied revision or silently discard conflicting financial/authentication data.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-03, WP-43.

Required shared-file / migration ordering:
- WP-03 → WP-45: `backend/app/models/refresh_token.py`, `backend/app/repositories/sqlalchemy/refresh_token_repository.py`, `backend/app/repositories/interfaces/refresh_token_repository.py`.
- WP-43 → WP-45: `backend/app/workers/settings.py`.
- WP-37 → WP-45: `Alembic single-head revision chain`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-45-refresh-retention` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
