# WP-34 — Unify chart cohorts and make summary grouping linear

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Unify chart cohorts and make summary grouping linear. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **API-07** (Required (no prefix)): Progress chart uses inconsistent populations and average rules. [API-07 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-07--progress-chart-uses-inconsistent-populations-and-average-rules). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **PERF-API-01** (Medium): Medium — Measured student chart processing grows quadratically in periods. [PERF-API-01 — report section](../../backendperformanceaudit/01-api-layer-performance-audit.md#perf-api-01--medium--measured-student-chart-processing-grows-quadratically-in-periods). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Contributes without duplicating coverage ownership: [API-10 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-10--optional-move-domain-calculation-and-queries-out-of-routers-and-complete-typed-response-boundaries) (closure owner WP-52); [API-11 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-11--optional-bound-aggregate-responses-and-make-chart-work-proportional-to-the-data-returned) (closure owner WP-56).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/api/v1/courses.py:197](../../../backend/app/api/v1/courses.py) | Existing file, anchor line 197; only this WP’s stated behavior may change. |
| [backend/app/services/course_progress_service.py](../../../backend/app/services/course_progress_service.py) | Existing service; extend only this WP’s chart workflow. |
| [backend/app/repositories/sqlalchemy/course_progress_repository.py](../../../backend/app/repositories/sqlalchemy/course_progress_repository.py) | Existing repository; extend typed chart snapshot without changing unrelated staff-progress semantics. |
| `backend/app/repositories/interfaces/course_progress_repository.py` | Carry explicit grading evidence and chart cohort/color fields through repository DTOs. |
| [backend/app/schemas/course_progress.py](../../../backend/app/schemas/course_progress.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [CONTRACT.md:1](../../../CONTRACT.md) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/courses/types.ts:1](../../../frontend/src/lib/courses/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp34.py](../../../backend/app/tests/integration/test_remediation_wp34.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| `backend/app/tests/integration/test_integrations_and_polish.py` | After WP32 releases ownership: only test_progress_chart_endpoint intended-grade fixture; preserve other tests. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |


Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/api/v1/courses.py:197–216,225–269,282–298](../../../backend/app/api/v1/courses.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/courses.py:194-218,237-259](../../../backend/app/api/v1/courses.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/courses.py:186–315](../../../backend/app/api/v1/courses.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/mentors.py:137–172](../../../backend/app/api/v1/mentors.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/students.py:75–113](../../../backend/app/api/v1/students.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/journals.py:22–29](../../../backend/app/api/v1/journals.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/finance.py:51,140–148](../../../backend/app/api/v1/finance.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/core/deps.py:80–126](../../../backend/app/core/deps.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/finance.py:55](../../../backend/app/api/v1/finance.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/courses.py:194–216,239–259,282–308](../../../backend/app/api/v1/courses.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/finance.py:140–148,187–194](../../../backend/app/api/v1/finance.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/students.py:56–70](../../../backend/app/api/v1/students.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/cron.py:17–32](../../../backend/app/api/v1/cron.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/api/v1/courses.py`:

```text
197:     enroll_stmt = (
198:         select(Enrollment)
199:         .options(joinedload(Enrollment.student))
200:         .filter(
201:             Enrollment.course_id == id,
202:             Enrollment.status == EnrollmentStatus.ACTIVE,
203:             Enrollment.is_deleted == False
204:         )
```

## Step-by-step change

Policy (2026-10-20): Active nondeleted student enrollment cohort defines class means/size/ranks; authorized historical self stays separate. Ratios require explicit TRUE grading, started period and positive maximum; deliberate zero counts, unknown/ungraded/max-zero ratios are null. Preserve ordered future slots as upcoming/null. Student mean averages eligible periods; trailing class mean averages eligible active students’ unrounded means. Rank descending unrounded mean then student ID, absent for ineligible students. Emit aligned grading metadata; preserve unrelated staff/class-progress semantics. CONTRACT.md is explicitly exempt in the existing generated-file hook.

1. Extract the existing chart operation into a typed CourseProgressService/repository result with one active/historical cohort and explicit graded-period denominator.
2. Return an absent rank for students outside the ranked cohort instead of class_size+1; coordinate nullable type in the client contract.
3. Index retained summaries once by journal/student so grouping is O(S+J), preserving privacy; this fixes computation, while request range/roster bounds are WP-58.
4. Return explicit grading metadata to distinguish graded zero from unknown/ungraded periods. The previously listed StudentTrendChart does not exist. Frontend source is separately owned: provide exact contract/consumer handoff and coordinate actual caller paths before changing frontend files; do not create a speculative component. Keep this a contract-consumer adjustment, not a redesign.

## Tests to write BEFORE the fix

- Use missing/zero-max/untouched-positive-max/graded-zero periods and withdrawn students. Assert identical policy for staff/student means, valid ranks, and no peer identities in student response. Instrument summary-ID reads.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp34.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Exact cohort/mean/rank tests pass; repeated J×S scans are removed without broadening data visibility.

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


Performance / operational evidence: At 30/300 students and 52/104 periods measure summary inspections, response bytes, query count, loop lag/RSS/p95 under equal conditions. No timing gain is assumed.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

Regenerate contract with `python backend/scripts/generate_contract.py` from repository root in the isolated test environment; synchronize only the listed client types/callers and verify them by reading their contents (frontend/src/lib is broadly gitignored). New visible text must use existing translations or stop to add exact locale paths to the plan.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-33.

Required shared-file / migration ordering:
- WP-26 → WP-34: `backend/app/api/v1/courses.py`.
- WP-30 → WP-34: `CONTRACT.md`.
- WP-24 → WP-34: `frontend/src/lib/courses/types.ts`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-34-course-progress` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
