# WP-43 — Own client lifetimes and configure a deployment connection budget

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Own client lifetimes and configure a deployment connection budget. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **DATA-15** (Optional:): Optional: Async infrastructure lifecycle and budgets should be explicit. [DATA-15 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-15--optional-async-infrastructure-lifecycle-and-budgets-should-be-explicit). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **PERF-DATA-01** (Medium): Deployment alternatives multiply pool ceilings without an execution-time budget. [PERF-DATA-01 — report section](../../backendperformanceaudit/03-data-infrastructure-performance-audit.md#perf-data-01--deployment-alternatives-multiply-pool-ceilings-without-an-execution-time-budget). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/core/redis.py:14](../../../backend/app/core/redis.py) | Existing file, anchor line 14; only this WP’s stated behavior may change. |
| [backend/app/db/session.py:9](../../../backend/app/db/session.py) | Existing file, anchor line 9; only this WP’s stated behavior may change. |
| [backend/app/main.py:24](../../../backend/app/main.py) | Existing file, anchor line 24; only this WP’s stated behavior may change. |
| [backend/app/core/config.py:7](../../../backend/app/core/config.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/workers/settings.py:15](../../../backend/app/workers/settings.py) | Existing file, anchor line 15; only this WP’s stated behavior may change. |
| [.github/workflows/deploy-backend.yml:140](../../../.github/workflows/deploy-backend.yml) | Existing file, anchor line 140; only this WP’s stated behavior may change. |
| [backend/scripts/gcp_deploy.sh:11](../../../backend/scripts/gcp_deploy.sh) | Existing file, anchor line 11; only this WP’s stated behavior may change. |
| [backend/.env.example:1](../../../backend/.env.example) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp43.py](../../../backend/app/tests/integration/test_remediation_wp43.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-43.md](../results/WP-43.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/core/redis.py:14–26,37–41](../../../backend/app/core/redis.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/db/session.py:9–18](../../../backend/app/db/session.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/scripts/gcp_deploy.sh:11–16,56–63](../../../backend/scripts/gcp_deploy.sh) — current source range checked during planning. Context does not grant write ownership.
- [.github/workflows/deploy-backend.yml:140–151](../../../.github/workflows/deploy-backend.yml) — current source range checked during planning. Context does not grant write ownership.
- [backend/Dockerfile:41](../../../backend/Dockerfile) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/core/redis.py`:

```text
14: _arq_pool = None
15: 
16: 
17: async def get_arq_pool():
18:     global _arq_pool
19:     if _arq_pool is None:
20:         from arq import create_pool
21:         from arq.connections import RedisSettings
```

## Step-by-step change

1. Initialize the shared ARQ producer once (or lock lazy creation); close ARQ, normal Redis, bot session and DB engine in cancellation-safe finally paths for API/worker owners.
2. Make pool size/overflow and query/lock/idle transaction deadlines explicit from a total DB budget including workers and overlapping revisions. Align local and CI deployment instance limits.
3. Use separate maintenance deadlines; never compensate for long transaction holds by blindly enlarging pools.

## Tests to write BEFORE the fix

- Concurrent cold initialization produces one pool; partial startup/cancellation releases resources. Controlled lock wait times out with rollback and subsequent requests succeed.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp43.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

No overwritten pool handle or unclosed process-owned client; configured ceilings fit a recorded DB budget and timeout policy.

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


Performance / operational evidence: Measure checkout wait/hold, idle-in-transaction sessions, p95/p99 at 1/2/5 instances with revision overlap; 150/300 are potential ceilings, not observed use.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-13, WP-18, WP-27, WP-42.

Required shared-file / migration ordering:
- WP-13 → WP-43: `backend/app/core/redis.py`, `backend/.env.example`.
- WP-35 → WP-43: `backend/app/main.py`.
- WP-11 → WP-43: `backend/app/core/config.py`.
- WP-26 → WP-43: `backend/app/workers/settings.py`.
- WP-42 → WP-43: `.github/workflows/deploy-backend.yml`, `backend/scripts/gcp_deploy.sh`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-43-resource-lifecycle` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-43.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
