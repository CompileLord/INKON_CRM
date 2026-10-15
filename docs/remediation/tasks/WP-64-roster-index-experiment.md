# WP-64 — Measure course roster plans and add only a justified index

Phase **3** · Priority **Medium (hypothesis)** · Effort **M** · Status **todo**

## Goal

Measure course roster plans and add only a justified index. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **PERF-DATA-02** (Medium): A performance migration removes the course-leading enrollment index. [PERF-DATA-02 — report section](../../backendperformanceaudit/03-data-infrastructure-performance-audit.md#perf-data-02--a-performance-migration-removes-the-course-leading-enrollment-index). Verification: Confirmed historical removal and surviving student-leading unique index. Index benefit remains an EXPLAIN hypothesis.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/models/enrollment.py:9](../../../backend/app/models/enrollment.py) | Existing file, anchor line 9; only this WP’s stated behavior may change. |
| [backend/alembic/versions/rwp64_roster_index.py](../../../backend/alembic/versions/rwp64_roster_index.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp64.py](../../../backend/app/tests/integration/test_remediation_wp64.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/alembic/versions/7d332ad357b9_add_performance_indexes.py:24–34](../../../backend/alembic/versions/7d332ad357b9_add_performance_indexes.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/alembic/versions/a1b2c3d4e5f6_add_performance_indexes.py:37–48](../../../backend/alembic/versions/a1b2c3d4e5f6_add_performance_indexes.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/repositories/sqlalchemy/user_repository.py:124–131](../../../backend/app/repositories/sqlalchemy/user_repository.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/alembic/versions/7d332ad357b9_add_performance_indexes.py`:

```text
24:     op.drop_index(op.f('ix_courses_mentor_id'), table_name='courses')
25:     op.drop_index(op.f('ix_courses_status_deleted'), table_name='courses')
26:     op.create_index('idx_courses_mentor_active', 'courses', ['mentor_id'], unique=False, postgresql_where=sa.text("status = 'active' AND is_deleted = false"))
27:     op.drop_index(op.f('ix_enrollments_course_student_deleted'), table_name='enrollments')
28:     op.drop_index(op.f('ix_enrollments_student_deleted'), table_name='enrollments')
29:     op.drop_index(op.f('ix_journal_entries_journal_student'), table_name='journal_entries')
30:     op.create_index('idx_journal_entries_student_attendance', 'journal_entries', ['student_id'], unique=False, postgresql_where=sa.text('attendance = false'))
31:     op.drop_index(op.f('ix_journal_student_summary_journal_student'), table_name='journal_student_summaries')
```

## Step-by-step change

1. Apply the complete migration chain in a disposable database and inspect course-leading index availability.
2. EXPLAIN the exact course roster/class-size predicates at representative cardinalities; compare a partial course/student index, read buffers and write overhead.
3. Add a forward concurrent index migration and matching model metadata only if evidence supports it; never edit historical applied revisions. If benefit is absent, retain the evidence and mark the hypothesis not actionable at the measured scale.

## Tests to write BEFORE the fix

- Course-filtered results stay identical, including soft deletes; migration upgrade/downgrade and invalid concurrent-index recovery are rehearsed. Verify insert/update overhead and index storage.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp64.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

A measured keep/reject decision resolves the hypothesis; an index is not added solely because an earlier migration removed one.

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


Performance / operational evidence: Use 10k/100k/1M enrollments with realistic course distributions; record EXPLAIN ANALYZE BUFFERS, actual/estimated rows, p95, index bytes and writes under equal cache conditions.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

Use the exact NEW migration filename listed, a unique revision ID and the current single Alembic head after dependencies. Test upgrade, data preflight and rollback/recovery in a disposable database. Do not rewrite an applied revision or silently discard conflicting financial/authentication data.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-42, WP-39.

Required shared-file / migration ordering:
- WP-45 → WP-64: `Alembic single-head revision chain`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-64-roster-index-experiment` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
