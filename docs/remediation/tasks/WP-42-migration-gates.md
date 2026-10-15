# WP-42 — Test the migration chain and fail deployment on migration errors

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Test the migration chain and fail deployment on migration errors. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **DATA-13** (Required (no severity prefix in title)): Integration setup validates ORM metadata instead of the deployable migration chain. [DATA-13 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-13--integration-setup-validates-orm-metadata-instead-of-the-deployable-migration-chain). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **PERF-DATA-03** (Medium): Scoring migration rewrites every summary at least twice in one migration transaction. [PERF-DATA-03 — report section](../../backendperformanceaudit/03-data-infrastructure-performance-audit.md#perf-data-03--scoring-migration-rewrites-every-summary-at-least-twice-in-one-migration-transaction). Verification: Confirmed repeated historical updates and suppressed deployment failure. Applied revision must not be edited; benchmark only on an upgrade-requiring clone.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Authorized scope correction

The accepted WP-14 safe-deployment controls use a fake gcloud harness with no migration configuration. Once this package correctly refuses missing migration credentials, those safe-context controls need synthetic migration configuration and a harmless fake Alembic command. Authorize only that harness adaptation, preserving every upload-exclusion and guard assertion. No real deployment is authorized. A disposable empty-to-head schema comparison also confirmed that the historical migration `e8f9a0b1c2d3` creates `ix_notification_logs_user_id` and `ix_notification_logs_read_at`, while the ORM omits both. Declare those existing indexes in the model; do not drop deployed indexes or weaken comparison. Import OrgSettings explicitly in the new migration test because Alembic already includes it; no unrelated export changes are needed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [.github/workflows/deploy-backend.yml:124](../../../.github/workflows/deploy-backend.yml) | Existing file, anchor line 124; only this WP’s stated behavior may change. |
| [backend/scripts/gcp_deploy.sh:42](../../../backend/scripts/gcp_deploy.sh) | Existing file, anchor line 42; only this WP’s stated behavior may change. |
| [backend/app/tests/migrations/test_migration_chain.py](../../../backend/app/tests/migrations/test_migration_chain.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp14.py](../../../backend/app/tests/integration/test_remediation_wp14.py) | Adapt only the fake deployment harness for required synthetic migration configuration and a harmless fake Alembic command; retain all private-context and large-list assertions. |
| [backend/app/models/notification_log.py](../../../backend/app/models/notification_log.py) | Declare only the existing migrated indexes on user_id and read_at so model metadata matches the deployable schema. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |
| [backend/app/tests/integration/test_remediation_wp42.py](../../../backend/app/tests/integration/test_remediation_wp42.py) | NEW file, no existing line number; exact creation path authorized by this WP. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/tests/conftest.py:59–65](../../../backend/app/tests/conftest.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/alembic/versions/d8e9f0a1b2c3_journal_scoring_redesign.py:15–65](../../../backend/alembic/versions/d8e9f0a1b2c3_journal_scoring_redesign.py) — current source range checked during planning. Context does not grant write ownership.
- [.github/workflows/deploy-backend.yml:124–134](../../../.github/workflows/deploy-backend.yml) — current source range checked during planning. Context does not grant write ownership.
- [backend/scripts/gcp_deploy.sh:42–45](../../../backend/scripts/gcp_deploy.sh) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/tests/conftest.py`:

```text
59: @pytest_asyncio.fixture(scope="session", autouse=True)
60: async def setup_test_db() -> None:
61:     from sqlalchemy import text
62:     async with test_engine.begin() as conn:
63:         await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE;"))
64:         await conn.execute(text("CREATE SCHEMA public;"))
65:         await conn.run_sync(Base.metadata.create_all)
66:     yield
```

## Step-by-step change

1. Add a separate disposable migration job for empty-to-head and prior-revision-to-head with representative data/constraints; keep it independent from metadata.create_all tests.
2. Make missing migration credentials, migration failure and unavailable runner access block deployment; remove warning-only fallthrough and document a reachable job runner.
3. Rehearse the historical scoring upgrade with a bounded maintenance window. Do not edit an already-applied revision; if an unupgraded large database exceeds the window, stop rollout and create an approved expand/backfill plan.

## Tests to write BEFORE the fix

- Forced Alembic failure must prevent deploy. Upgrade fixtures assert exact pre-clamp-derived scores and constraints; compare head schema with models. Exercise rollback/recovery rehearsal on disposable data.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp42.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Deployment cannot serve a new image after skipped/failed migrations; migration-chain correctness and size-dependent rollout evidence are recorded.

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


Performance / operational evidence: On an upgrade-requiring clone at 10k/100k/1M summaries measure update rows, WAL, lock waits, duration and writer p95. Existing source predicts 2S+B+X updates; no forward migration can retroactively speed an applied historical revision.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-11, WP-14.

Required shared-file / migration ordering:
- WP-11 → WP-42: `.github/workflows/deploy-backend.yml`.
- WP-14 → WP-42: `backend/scripts/gcp_deploy.sh`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-42-migration-gates` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
