# WP-58 — Bound chart periods and staff series without leaking peers

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Bound chart periods and staff series without leaking peers. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

This is an enabling, contributor or verification package; it does not independently own a source finding.

Contributes without duplicating coverage ownership: [API-11 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-11--optional-bound-aggregate-responses-and-make-chart-work-proportional-to-the-data-returned) (closure owner WP-56).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/api/v1/courses.py:194](../../../backend/app/api/v1/courses.py) | Existing file, anchor line 194; only this WP’s stated behavior may change. |
| [backend/app/services/course_progress_service.py](../../../backend/app/services/course_progress_service.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/repositories/sqlalchemy/course_progress_repository.py](../../../backend/app/repositories/sqlalchemy/course_progress_repository.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/schemas/course_progress.py](../../../backend/app/schemas/course_progress.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [frontend/src/lib/courses/endpoints.ts:1](../../../frontend/src/lib/courses/endpoints.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/courses/hooks.ts:1](../../../frontend/src/lib/courses/hooks.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/courses/types.ts:1](../../../frontend/src/lib/courses/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/pages/CourseProfile.tsx:1](../../../frontend/src/pages/CourseProfile.tsx) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/pages/student/MyCourseDetail.tsx:1](../../../frontend/src/pages/student/MyCourseDetail.tsx) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [CONTRACT.md:1](../../../CONTRACT.md) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp58.py](../../../backend/app/tests/integration/test_remediation_wp58.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |
| [frontend/src/components/student/StudentTrendChart.tsx:1](../../../frontend/src/components/student/StudentTrendChart.tsx) | Existing file, anchor line 1; only this WP’s stated behavior may change. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/api/v1/courses.py:194–216,239–259,282–308](../../../backend/app/api/v1/courses.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/finance.py:140–148,187–194](../../../backend/app/api/v1/finance.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/students.py:56–70](../../../backend/app/api/v1/students.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/cron.py:17–32](../../../backend/app/api/v1/cron.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/api/v1/courses.py`:

```text
194:     journals = await get_course_journals(id, db)
195:     journal_ids = [j.id for j in journals]
196: 
197:     enroll_stmt = (
198:         select(Enrollment)
199:         .options(joinedload(Enrollment.student))
200:         .filter(
201:             Enrollment.course_id == id,
```

## Step-by-step change

1. Add explicit bounded period range and capped staff roster-series paging; keep student output to its own series plus authorized aggregate.
2. Make historical/range-dependent ranking and average semantics explicit and aligned with WP-34; update client navigation and types. This is the remaining chart contribution to API-11.

## Tests to write BEFORE the fix

- Large histories/rosters never exceed bounds; all pages preserve access filtering and deterministic range behavior; no peer identifiers appear in student output.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp58.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Chart computation/input/output scale with the chosen bounded range/page, not the entire course lifetime.

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


Performance / operational evidence: Measure query rows, response bytes, RSS and loop lag at 30/300 students and 52/104/1000 periods with equal requested ranges.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

Regenerate contract with `python backend/scripts/generate_contract.py` from repository root in the isolated test environment; synchronize only the listed client types/callers and verify them by reading their contents (frontend/src/lib is broadly gitignored). New visible text must use existing translations or stop to add exact locale paths to the plan.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-34.

Required shared-file / migration ordering:
- WP-46 → WP-58: `backend/app/api/v1/courses.py`.
- WP-34 → WP-58: `backend/app/services/course_progress_service.py`, `backend/app/repositories/sqlalchemy/course_progress_repository.py`, `backend/app/schemas/course_progress.py`, `frontend/src/lib/courses/types.ts`, `frontend/src/components/student/StudentTrendChart.tsx`.
- WP-41 → WP-58: `frontend/src/pages/student/MyCourseDetail.tsx`.
- WP-57 → WP-58: `CONTRACT.md`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-58-chart-bounds` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
