# WP-62 — Re-audit every finding and record residual risks

Phase **4** · Priority **Verification** · Effort **M** · Status **todo**

## Goal

Re-audit every finding and record residual risks. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

This is an enabling, contributor or verification package; it does not independently own a source finding.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/tests/conftest.py:10-28,59-80](../../../backend/app/tests/conftest.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/core/security.py:60-72](../../../backend/app/core/security.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/main.py:67-70](../../../backend/app/main.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:736-770](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- All repository source and all 12 original audit Markdown files may be read for the final re-audit; only the STATUS row may be written.

Snapshot excerpt from `backend/app/tests/conftest.py`:

```text
10: TEST_DATABASE_URL = "postgresql+asyncpg://linguist_user:linguist_pass_2024@localhost:5432/imkon_test_db"
11: 
12: test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool, future=True)
13: TestingSessionLocal = async_sessionmaker(
14:     bind=test_engine,
15:     class_=AsyncSession,
16:     expire_on_commit=False,
17:     autocommit=False,
```

## Step-by-step change

1. Reopen every original cited source location or its successor after all implementation packages merge; preserve original audit reports unchanged.
2. Re-run the full backend/frontend gates, explicit Critical reproduction module, migration smoke suite and representative performance/security checks; compare measurements with their recorded baselines.
3. Mark each of the 75 IDs fixed, still open, measurement-accepted or deferred with current evidence. Revisit SEC-DATA-04 with the data owner for retention/backup/financial exceptions; draft a separate future erasure WP only after that policy exists.

This future re-audit may read all source and audit reports as explicitly listed read-only context, but writes only the listed remediation results and STATUS. Existing audits are immutable. The current planning session uses no subagents; later delegation is optional according to the roadmap.

## Tests to write BEFORE the fix

- All Critical reproductions must pass with desired secure outcomes; audit all acceptance evidence and actual branch/PR completion before declaring closure. Check source ownership exceptions, migrations and compatibility debt.

## Acceptance criteria

Independent fresh source review and actual checks substantiate each disposition; unresolved policy/performance/runtime assumptions remain explicit, not hidden behind an overall score.

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


Performance / operational evidence: Repeat equal-condition latency/query/lock/RSS tests from performance WPs and report variance; do not infer speedups from static complexity alone.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Re-audit can overstate closure if it relies on old reports or unrun tests. Preserve original evidence and record unresolved claims. Rollback only the new assessment row; never alter old audits to match the desired verdict.

## Dependencies and execution order

Functional prerequisites: WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08, WP-09, WP-10, WP-11, WP-12, WP-13, WP-14, WP-15, WP-16, WP-17, WP-18, WP-19, WP-20, WP-21, WP-22, WP-23, WP-24, WP-25, WP-26, WP-27, WP-28, WP-29, WP-30, WP-31, WP-32, WP-33, WP-34, WP-35, WP-36, WP-37, WP-38, WP-39, WP-40, WP-41, WP-42, WP-43, WP-44, WP-45, WP-46, WP-47, WP-48, WP-49, WP-50, WP-51, WP-52, WP-53, WP-54, WP-55, WP-56, WP-57, WP-58, WP-59, WP-60, WP-61, WP-63, WP-64.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-62-reaudit` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
