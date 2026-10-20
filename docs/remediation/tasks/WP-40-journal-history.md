# WP-40 — Page student journal history with a stable cursor

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Page student journal history with a stable cursor. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **DATA-11** (Required (no severity prefix in title)): Student journal history is unbounded. [DATA-11 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-11--student-journal-history-is-unbounded). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Contributes without duplicating coverage ownership: [API-11 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-11--optional-bound-aggregate-responses-and-make-chart-work-proportional-to-the-data-returned) (closure owner WP-56).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/repositories/sqlalchemy/user_repository.py:242](../../../backend/app/repositories/sqlalchemy/user_repository.py) | Existing file, anchor line 242; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/user_repository.py:7](../../../backend/app/repositories/interfaces/user_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/api/v1/students.py:56](../../../backend/app/api/v1/students.py) | Existing file, anchor line 56; only this WP’s stated behavior may change. |
| [backend/app/schemas/user.py:7](../../../backend/app/schemas/user.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [frontend/src/lib/users/types.ts:1](../../../frontend/src/lib/users/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/users/endpoints.ts:1](../../../frontend/src/lib/users/endpoints.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/users/hooks.ts:1](../../../frontend/src/lib/users/hooks.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [CONTRACT.md:1](../../../CONTRACT.md) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp40.py](../../../backend/app/tests/integration/test_remediation_wp40.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| `backend/app/repositories/sqlalchemy/student_performance_repository.py` | Replace the actual unbounded history implementation with bounded delegation; preserve WP33 ranking. |
| `backend/app/repositories/interfaces/student_journal_history_repository.py` | NEW: narrow page/access boundary and typed slice records. |
| `backend/app/repositories/sqlalchemy/student_journal_history_repository.py` | NEW: enrollment EXISTS, stable keyset and page-only summaries. |
| `backend/app/services/student_journal_history_service.py` | NEW: authorization, history workflow and legacy overflow semantics. |
| `backend/app/services/student_journal_history_cursor.py` | NEW: bounded validated filter-bound cursor codec class. |
| `backend/app/schemas/student_journal_history.py` | NEW: strict cursor/query/page response models. |
| `backend/app/core/deps.py` | Wire history service/repository with Depends. |
| `backend/app/tests/integration/test_remediation_wp40_cursor.py` | NEW: cursor validation regressions if needed for module size. |
| `backend/app/tests/integration/test_remediation_wp40_performance.py` | NEW: measured bounded rows/parameters at history scale. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |
| [frontend/src/pages/student/MyCourseDetail.tsx:1](../../../frontend/src/pages/student/MyCourseDetail.tsx) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/components/dashboard/StudentDashboard.tsx:1](../../../frontend/src/components/dashboard/StudentDashboard.tsx) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/users/endpoints.test.ts:1](../../../frontend/src/lib/users/endpoints.test.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/repositories/sqlalchemy/user_repository.py:242–277](../../../backend/app/repositories/sqlalchemy/user_repository.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/courses.py:194–216,239–259,282–308](../../../backend/app/api/v1/courses.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/finance.py:140–148,187–194](../../../backend/app/api/v1/finance.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/students.py:56–70](../../../backend/app/api/v1/students.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/cron.py:17–32](../../../backend/app/api/v1/cron.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/repositories/sqlalchemy/user_repository.py`:

```text
242: 
243:     async def get_student_journals(
244:         self,
245:         student_id: int,
246:         course_id: Optional[int] = None
247:     ) -> List[Dict[str, Any]]:
248:         enrollment_query = select(Enrollment.course_id).filter(
249:             Enrollment.student_id == student_id,
```

## Step-by-step change

1. Add a capped page operation ordered by period_start DESC,id DESC; retrieve summaries only for that page and authorize enrollment before paging.
2. Add an explicit versioned/paged endpoint and migrate the client; retire or strictly bound the legacy unbounded path in the same PR, without silent truncation. Keep contract and client behavior aligned.

If a legacy consumer outside the repository prevents retirement, stop and obtain an explicit compatibility schedule; do not leave the finding falsely closed.

## Tests to write BEFORE the fix

- Tied dates across pages have no duplicates/skips; unauthorized course filters fail; history size never increases one-page result/IN-list size beyond cap.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp40.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

No supported history path materializes a student’s full lifetime; navigation and response types are synchronized.

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


Performance / operational evidence: Measure fetched rows, SQL parameters, response bytes and RSS at 100/10k periods with a fixed page cap.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

Regenerate contract with `python backend/scripts/generate_contract.py` from repository root in the isolated test environment; synchronize only the listed client types/callers and verify them by reading their contents (frontend/src/lib is broadly gitignored). New visible text must use existing translations or stop to add exact locale paths to the plan.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-39 and the accepted WP-41 backend privacy result.

Required shared-file / migration ordering:
- WP-39 → WP-40: `backend/app/repositories/sqlalchemy/user_repository.py`.
- WP-16 → WP-40: `backend/app/repositories/interfaces/user_repository.py`, `backend/app/api/v1/students.py`.
- WP-15 → WP-40: `backend/app/schemas/user.py`, `frontend/src/lib/users/types.ts`.
- WP-35 → WP-40: `CONTRACT.md`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-40-journal-history` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.

### Current-source and staged compatibility correction (2026-10-20)

The unbounded implementation moved to student_performance_repository.py. Extract it into the bounded history repository instead of growing that 17KB performance module beyond the source limit. Preserve WP33 eligibility, zero scores and future/unknown state semantics. Root has explicitly moved WP41 privacy ahead of WP40; preserve its new schemas/Protocol method.

Backend contract: add GET /students/me/journals/page with page_size default20, maximum100, optional course_id and started_only. Return items and nullable next_cursor; fetch at most limit+1 journal rows with enrollment EXISTS and order period_start DESC,id DESC, then fetch only returned-page summaries. Authorize the requested course before paging (403 when not enrolled); student identity always comes from the authenticated caller. A strict bounded cursor carries version, student, course filter, started_only/cutoff and last date/id, rejecting malformed or cross-filter/student cursors with422. Freeze the started cutoff across pages so midnight does not change a traversal. Latest-started dashboard calls page_size1 plus started_only instead of filtering a page containing future rows.

The legacy array endpoint/repository path must use the same capped operation: preserve exact array semantics for at most100 rows and return explicit409 on overflow, without materializing the lifetime or silently truncating. This is staged integration, not permission to deploy an incompatible client: FE-R40 remains a frontend-owner release prerequisite and the WP stays incomplete until navigation and chart completeness are synchronized. Course-card aggregates already come from profile payloads after UX5d; MyCourses no longer consumes journal history. Actual current history consumers are MyCourseDetail, StudentDashboard and useStudentProgressSeries/StudentProgressPanel. Do not auto-fetch all pages to recreate an unbounded history. No frontend writes by backend executors. Regenerate contract serially after WP41; add any further frontend handoff detail to the existing UX plan/status through root.
