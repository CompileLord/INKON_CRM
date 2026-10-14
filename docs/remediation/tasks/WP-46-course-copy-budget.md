# WP-46 — Bound and measure synchronous course-copy creation

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Bound and measure synchronous course-copy creation. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **PERF-BUS-06** (Medium): Course copying materializes each student's entire destination lifetime in one transaction. [PERF-BUS-06 — report section](../../backendperformanceaudit/02-business-domain-performance-audit.md#perf-bus-06--course-copying-materializes-each-students-entire-destination-lifetime-in-one-transaction). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Contributes without duplicating coverage ownership: [BUS-19 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-19--optional-narrow-service-dependencies-and-split-finance-responsibilities) (closure owner WP-53).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/course_service.py:234](../../../backend/app/services/course_service.py) | Existing file, anchor line 234; only this WP’s stated behavior may change. |
| [backend/app/services/enrollment_service.py:90](../../../backend/app/services/enrollment_service.py) | Existing file, anchor line 90; only this WP’s stated behavior may change. |
| [backend/app/core/schedule_utils.py:6](../../../backend/app/core/schedule_utils.py) | Existing file, anchor line 6; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/course_repository.py:7](../../../backend/app/repositories/interfaces/course_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/user_repository.py:7](../../../backend/app/repositories/interfaces/user_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/core/deps.py:14](../../../backend/app/core/deps.py) | Existing file, anchor line 14; only this WP’s stated behavior may change. |
| [backend/app/api/v1/courses.py:24](../../../backend/app/api/v1/courses.py) | Existing file, anchor line 24; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp46.py](../../../backend/app/tests/integration/test_remediation_wp46.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-46.md](../results/WP-46.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/course_service.py:234-264](../../../backend/app/services/course_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/enrollment_service.py:90-139](../../../backend/app/services/enrollment_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/journal_generation_service.py:17-68](../../../backend/app/services/journal_generation_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:430-478](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/auth_service.py:19-23](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/course_service.py:20-23](../../../backend/app/services/course_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:76-78,1198-1349,1597-1661](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/journal_service.py:392-409,565-582,666-683](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/course_service.py`:

```text
234:     async def copy_course(self, new_course_data: CourseCreate, source_course_id: int, current_user: User) -> Course:
235:         from app.models.enrollment import Enrollment, EnrollmentStatus
236:         from app.services.enrollment_service import EnrollmentService
237: 
238:         new_course = await self.create_course(new_course_data, current_user)
239: 
240:         enroll_query = select(Enrollment).filter(
241:             Enrollment.course_id == source_course_id,
```

## Step-by-step change

1. Compute destination lesson dates once and pass typed precomputed inputs through enrollment. Inject the existing course/user protocols so this path can be characterized without concrete constructors.
2. Establish a documented synchronous roster/duration/row budget and reject oversized copies before destination mutation; preserve current transaction behavior and define existing skipped-enrollment handling explicitly.
3. Do not introduce a multi-commit background-copy product in this PR. If required by measured real workloads, stop and propose a separate resumable-copy WP.

## Tests to write BEFORE the fix

- At the boundary, output matches ordinary enrollment/maxima/charges; excessive copy is rejected before writes; repeated dates are computed once; no duplicate enrollment/installment on retry.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp46.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

One copy cannot create an unbounded lifetime footprint; retained synchronous path has measured limits and clear failure semantics.

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


Performance / operational evidence: Vary students and course duration; record inserted rows, flush/execute count, transaction duration and peak RSS versus N(1+L+J+M) source model.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-26, WP-33, WP-37.

Required shared-file / migration ordering:
- WP-26 → WP-46: `backend/app/services/course_service.py`, `backend/app/core/deps.py`.
- WP-33 → WP-46: `backend/app/services/enrollment_service.py`.
- WP-40 → WP-46: `backend/app/repositories/interfaces/user_repository.py`.
- WP-34 → WP-46: `backend/app/api/v1/courses.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-46-course-copy-budget` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-46.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
