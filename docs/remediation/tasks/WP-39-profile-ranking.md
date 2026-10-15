# WP-39 — Compute student ranks in one partitioned query

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Compute student ranks in one partitioned query. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **DATA-10** (Required (no severity prefix in title)): Student profile ranking performs one additional database query per course. [DATA-10 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-10--student-profile-ranking-performs-one-additional-database-query-per-course). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/repositories/sqlalchemy/user_repository.py:182](../../../backend/app/repositories/sqlalchemy/user_repository.py) | Existing file, anchor line 182; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp39.py](../../../backend/app/tests/integration/test_remediation_wp39.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/repositories/sqlalchemy/user_repository.py:182–208](../../../backend/app/repositories/sqlalchemy/user_repository.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/repositories/sqlalchemy/user_repository.py`:

```text
182:             rank_map = {}
183:             for cid in course_ids:
184:                 rank_query = select(
185:                     JournalStudentSummary.student_id,
186:                     func.avg(
187:                         case(
188:                             (JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
189:                             else_=0.0
```

## Step-by-step change

1. Aggregate by course/student once and rank through a partitioned SQL window before selecting the requesting student.
2. Preserve WP-33 grading/cohort semantics with an explicit tie rule and deterministic ordering; avoid materializing all class IDs per course.

## Tests to write BEFORE the fix

- Profiles across 1/10/100 courses have constant query-count growth for ranking; equal-score ties, zero grades and missing periods match specified results.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp39.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

No sequential rank query per course; exact rank and authorization behavior preserved.

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


Performance / operational evidence: Compare SQL count, returned rows, buffers and p95 on identical seeded rosters; source baseline adds one query per course.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-33, WP-16.

Required shared-file / migration ordering:
- WP-33 → WP-39: `backend/app/repositories/sqlalchemy/user_repository.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-39-profile-ranking` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
