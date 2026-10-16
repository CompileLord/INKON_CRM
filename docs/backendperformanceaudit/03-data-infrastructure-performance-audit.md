# Data and infrastructure performance audit

## 1. Scope

All 79 owned files (58 original Python files, seven migrations, 14 infrastructure/template files; 6,658 lines) received separate security and performance passes. Exact inventory:

- `backend/alembic/env.py`
- `backend/app/core/config.py`
- `backend/app/core/rate_limiter.py`
- `backend/app/core/redis.py`
- `backend/app/db/base.py`
- `backend/app/db/session.py`
- `backend/app/models/__init__.py`
- `backend/app/models/accounting_period.py`
- `backend/app/models/allocation.py`
- `backend/app/models/audit_log.py`
- `backend/app/models/charge.py`
- `backend/app/models/course.py`
- `backend/app/models/course_mentor_history.py`
- `backend/app/models/course_schedule.py`
- `backend/app/models/document.py`
- `backend/app/models/enrollment.py`
- `backend/app/models/journal.py`
- `backend/app/models/journal_entry.py`
- `backend/app/models/journal_student_summary.py`
- `backend/app/models/ledger.py`
- `backend/app/models/notification_log.py`
- `backend/app/models/org_settings.py`
- `backend/app/models/payment.py`
- `backend/app/models/refresh_token.py`
- `backend/app/models/user.py`
- `backend/app/repositories/interfaces/audit_log_repository.py`
- `backend/app/repositories/interfaces/base_repository.py`
- `backend/app/repositories/interfaces/course_repository.py`
- `backend/app/repositories/interfaces/document_repository.py`
- `backend/app/repositories/interfaces/enrollment_repository.py`
- `backend/app/repositories/interfaces/journal_repository.py`
- `backend/app/repositories/interfaces/notification_log_repository.py`
- `backend/app/repositories/interfaces/payment_repository.py`
- `backend/app/repositories/interfaces/refresh_token_repository.py`
- `backend/app/repositories/interfaces/user_repository.py`
- `backend/app/repositories/sqlalchemy/audit_log_repository.py`
- `backend/app/repositories/sqlalchemy/base_repository.py`
- `backend/app/repositories/sqlalchemy/course_repository.py`
- `backend/app/repositories/sqlalchemy/document_repository.py`
- `backend/app/repositories/sqlalchemy/enrollment_repository.py`
- `backend/app/repositories/sqlalchemy/journal_repository.py`
- `backend/app/repositories/sqlalchemy/notification_log_repository.py`
- `backend/app/repositories/sqlalchemy/payment_repository.py`
- `backend/app/repositories/sqlalchemy/refresh_token_repository.py`
- `backend/app/repositories/sqlalchemy/user_repository.py`
- `backend/app/tests/conftest.py`
- `backend/app/tests/integration/test_audit_logs.py`
- `backend/app/tests/integration/test_enrollment.py`
- `backend/app/tests/integration/test_finance.py`
- `backend/app/tests/integration/test_finance_invariants.py`
- `backend/app/tests/integration/test_finance_redesign.py`
- `backend/app/tests/integration/test_journals.py`
- `backend/app/tests/integration/test_mentor_history.py`
- `backend/scripts/backfill_finance.py`
- `backend/scripts/clean_db.py`
- `backend/scripts/generate_contract.py`
- `backend/scripts/seed_admin.py`
- `backend/scripts/seed_demo_data.py`
- `backend/requirements.txt`
- `backend/pyproject.toml`
- `backend/Dockerfile`
- `backend/.dockerignore`
- `backend/.env.example`
- `docker-compose.yml`
- `.github/workflows/deploy-backend.yml`
- `.github/workflows/deploy-frontend.yml`
- `.gitignore`
- `backend/alembic.ini`
- `backend/alembic/README`
- `backend/alembic/script.py.mako`
- `backend/scripts/gcp_deploy.sh`
- `backend/scripts/setup_free_tier_vm.sh`
- `backend/alembic/versions/7d332ad357b9_add_performance_indexes.py`
- `backend/alembic/versions/a1b2c3d4e5f6_add_performance_indexes.py`
- `backend/alembic/versions/b7c1d2e3f4a5_finance_charge_credit_ledger.py`
- `backend/alembic/versions/c592774b16d3_initial_migration.py`
- `backend/alembic/versions/d8e9f0a1b2c3_journal_scoring_redesign.py`
- `backend/alembic/versions/e8f9a0b1c2d3_add_user_id_and_read_at_to_notification_logs.py`
- `backend/alembic/versions/f9a0b1c2d3e4_create_org_settings.py`

Read-only context: AGENTS.md, CONTRACT.md, both new plans, old quality plan and all three quality reports, and other groups' code only to trace calls/transaction lifetimes. Applied all three complete installed skills and both bundled pattern references. Shared referenced checklists are not installed. Only this performance report and the corresponding security report were written by this reviewer.

Executed: Conda base with PYTHONDONTWRITEBYTECODE=1 parsed all 65 owned Python files. An AST-extracted get_paginated method ran against in-memory SQLAlchemy statements and an async session double: total=0/page=1 performed two execute calls; total=1,000,000/page=50,000/page_size=20 performed two calls and compiled LIMIT 20 OFFSET 999980. The first extraction attempt failed because the isolated namespace omitted select; after supplying that dependency, both checks completed. These are executed control-flow/SQL-construction checks, not database timings or query plans. Two per-file read-only passes and source operation counts were completed. No app imports, existing integration tests, services, DB operations, migration execution, load tests or deployments ran; source mutation experiments were omitted under the user constraint. All patches/benchmarks below are proposals, not measured wins.

Prior-report disposition: DATA-10 (7+C student-profile queries), DATA-11 (unbounded journal history), DATA-14 (unstable list order), DATA-15 (ARQ lazy initialization race/lifecycle and per-instance pool), DATA-06 (Redis DSN divergence), BUS-15 (bcrypt/image blocking), BUS-20 (domain query loops), API-11 (large chart/history payloads) remain context. Source verifies those mechanisms; they are not simply issued new IDs. PERF-DATA-01 adds a distinct timeout/configuration budget analysis; PERF-DATA-02/03 inspect newly included migration effects; PERF-DATA-04 contains new executed operation/offset evidence; PERF-DATA-05 adds retained authentication-table growth.

## 2. Summary

Verdict: **Measure and remediate the migration, query-shape and infrastructure budgets before scaling. Performance/scalability: 5/10.** Async SQLAlchemy and shared Redis are sound foundations, but deployment paths and persistence growth have no integrated capacity policy. New evidence includes migration index removals, repeated summary-table updates, two query executions for empty pages and a compiled deep offset near one million skipped rows. No production latency, database saturation or index plan was measured, so the findings separate deterministic source growth from bottleneck hypotheses; none is claimed as a demonstrated High latency incident.

## 3. Findings

### PERF-DATA-01 — Deployment alternatives multiply pool ceilings without an execution-time budget

**Impact:** Medium. **Category:** concurrency/database. **Review disposition:** Required (no prefix). **Location:** `backend/app/db/session.py:9–18`; `backend/scripts/gcp_deploy.sh:11–16,56–63`; `.github/workflows/deploy-backend.yml:140–151`; `backend/Dockerfile:41`.

**Problem/new evidence:** The one-worker image has a 20+10 connection ceiling per process. The old DATA-15 quantified the workflow's two-instance ceiling (60); the independent local deployer's default five instances creates a different 150-connection ceiling. Two overlapping maximum revisions of that five-instance configuration could reach 300 before worker/migration/admin clients, subject to actual revision traffic/scaling. These are configured upper bounds, not reserved-at-start connections or observed utilization. Pool checkout is bounded at 30 seconds, while no explicit asyncpg command_timeout, PostgreSQL statement_timeout or transaction idle timeout is configured here. A slow query/lock can occupy a connection beyond the checkout wait and amplify queueing across unrelated requests.

**Source evidence:** pool_size=20, max_overflow=10, pool_timeout=30; script MAX_INSTANCES=5; CI --max-instances=2. get_db_session in read-only context commits after the handler, so checked-out request transactions can persist across subsequent external awaits. FastAPI dependency reuse shares one request session; it is not an extra pool per dependency.

**Defendable model:** If measured average connection hold time is H seconds and DB-taking requests arrive at λ/s, mean occupied connections is approximately λ×H. Increasing pool size cannot reduce H. Headroom must cover all simultaneous revisions/processes and PostgreSQL reserved/operational connections. Database max_connections and real traffic are unknown: exhaustion is a hypothesis.

**Corrected-code proposal:** Make pool/overflow settings configurable from one deployment-wide connection budget; agree revision and worker headroom, then set independent query/lock budgets appropriate to the workload. Timeout values below are illustrative, not established SLAs.

```python
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_WAIT_SECONDS,
    connect_args={
        "command_timeout": settings.DB_COMMAND_SECONDS,
        "server_settings": {
            "statement_timeout": str(settings.DB_STATEMENT_MS),
            "lock_timeout": str(settings.DB_LOCK_MS),
            "idle_in_transaction_session_timeout": str(settings.DB_IDLE_TX_MS),
        },
    },
)
```

Do not abort finance work blindly without rollback/retry/idempotency policy. Apply separate longer bounded budgets to maintenance migrations. Proposed measurement: instrument checkout wait/hold duration, active/idle-in-transaction sessions, λ, event-loop lag and p95/p99 by route at 1/2/5 instances with rollout overlap and workers. Induce a harmless lock wait on a disposable DB; verify bounded errors and successful rollback. Keep only values that improve latency within the actual connection budget.

### PERF-DATA-02 — A performance migration removes the course-leading enrollment index

**Impact:** Medium (query bottleneck hypothesis). **Category:** database. **Review disposition:** Required (no prefix) to measure and resolve the migration/query mismatch. **Location:** `backend/alembic/versions/7d332ad357b9_add_performance_indexes.py:24–34`; creation context `backend/alembic/versions/a1b2c3d4e5f6_add_performance_indexes.py:37–48`; hot owned query `backend/app/repositories/sqlalchemy/user_repository.py:124–131`.

**Problem/new evidence:** a1b2 adds (course_id, student_id, is_deleted), then its successor removes it. No later migration restores a course-leading enrollment index. The surviving unique (student_id, course_id) constraint supports student-prefix lookup; it is not a substitute for a course-prefix seek. Student-profile class_size filters course_id IN (...) plus is_deleted=False and groups by course. Read-only journal/enrollment/chart paths also filter rosters by course. As enrollment history E grows while a requested course cohort n stays bounded, these calls may require broad scans rather than a selective course range. This newly reviewed migration effect was excluded from the old quality audit.

**Evidence/caveats:** The seven-migration chain was read; actual production schema is not inspected. PostgreSQL planner choices, index skip-scan capabilities, selectivity, cache and cardinality matter. Removing duplicate journal/summary/notification indexes here is not itself a defect: corresponding UNIQUE constraints still supply equivalent prefixes. Legacy payment indexes with the different idx_payment_* names from the initial migration remain, so this report does not incorrectly claim they all disappeared. The attendance=false partial index does not cover arbitrary student summary lookups, but no separate blanket missing-index finding is asserted.

**Corrected-code proposal:** If representative EXPLAIN supports it, add a forward migration for course roster lookup. Prefer a partial index only if the live row distribution makes it worthwhile.

```python
with op.get_context().autocommit_block():
    op.create_index(
        "idx_enrollments_live_course_student",
        "enrollments", ["course_id", "student_id"],
        postgresql_where=sa.text("is_deleted = false"),
        postgresql_concurrently=True,
    )
```

Do not edit an already-applied historical revision. Proposed measurement: apply the full chain in a disposable database, inspect pg_indexes, then EXPLAIN (ANALYZE, BUFFERS) the exact class_size/roster queries at E=10k/100k/1M with realistic course distributions. Compare actual/estimated rows, heap/index reads and sort costs; compare enrollment insert/update overhead and index bytes. Revert an index that does not improve the targeted workload beyond noise.

### PERF-DATA-03 — Scoring migration rewrites every summary at least twice in one migration transaction

**Impact:** Medium, size-dependent rollout risk. **Category:** database/concurrency/startup. **Review disposition:** Required (no prefix). **Location:** `backend/alembic/versions/d8e9f0a1b2c3_journal_scoring_redesign.py:15–65`; deployment coupling `.github/workflows/deploy-backend.yml:124–134`; `backend/scripts/gcp_deploy.sh:42–45`.

**Problem/new quantified evidence:** For S summary rows, the unconditional homework/attendance UPDATE changes S rows; the final joined maximum/sum UPDATE changes S rows with valid journal FKs. Additional bonus/exam clamps update B and X rows, so row-update operations are 2S+B+X, bounded by 4S. At S=1M, source therefore prescribes between 2M and 4M summary row updates, plus the journal update and constraint validation. This is a statement/row-operation model, not a timing or WAL-byte measurement. Alembic executes the revision transactionally; added-column locks and updates can block writers until commit. Both deploy paths proceed even when migrations fail, so timeout/lock failure may leave the old schema serving the new image.

**Evidence:** Four explicit summary UPDATE statements; two have no selective predicate beyond the valid FK join. The scripts' `alembic upgrade head || echo ...` suppresses failure. This is distinct from prior DATA-13's absent migration tests: newly included source proves rollout work/failure handling.

**Corrected-code proposal:** Preserve the original pre-clamp homework derivation while combining all summary transformations into one UPDATE when a measured maintenance window suffices. For large production datasets, use expand/backfill/validate phases with bounded batches and a forward-compatible application rollout; SQL expressions below show the one-pass logic, not a migration already tested.

```sql
UPDATE journal_student_summaries s
SET homework_score = s.sum_score - s.exam_score - s.bonus_score,
    attendance_score = s.attendance_count,
    bonus_score = LEAST(s.bonus_score, 20),
    exam_score = LEAST(s.exam_score, j.exam_max_score),
    max_period_score = s.total_lessons * 6 + j.exam_max_score,
    sum_score = (s.sum_score - s.exam_score - s.bonus_score)
                + s.attendance_count + LEAST(s.exam_score, j.exam_max_score)
                + LEAST(s.bonus_score, 20)
FROM journals j WHERE j.id = s.journal_id;
```

All RHS expressions refer to old row values; that preserves existing homework semantics. Make migration failure stop deployment; include tested settings/dependencies in the migration runner. Proposed measurement: representative sanitized database copy at 10k/100k/1M summaries; record affected rows, wall time, WAL delta, dead tuples, lock waits and ordinary writer p95 through the upgrade. Assert exact score outputs and constraint behavior before accepting a faster plan. No migration was run here.

### PERF-DATA-04 — Every paginated search pays COUNT and OFFSET work, including empty results

**Impact:** Medium. **Category:** database. **Review disposition:** Required (no prefix). **Location:** `backend/app/repositories/sqlalchemy/base_repository.py:70–91`; `backend/app/repositories/sqlalchemy/user_repository.py:36–46,55–65`.

**Problem/new executed evidence:** The helper counts a complete subquery before fetching the page; empty total=0 fails the `total_pages > 0` short-circuit and still executes the data query. The memory double executed two calls for an empty first page. For page=50,000/page_size=20/total=1M, it executed two calls and compiled OFFSET 999980. PostgreSQL must produce/discard the preceding offset rows rather than seek directly to page membership, though the actual plan/read volume is unknown. Student/mentor search applies three case-insensitive `%term%` predicates; ordinary email B-tree uniqueness does not make a leading wildcard selective. Each search pays count plus page predicate evaluation, and deep pages add discard work. This is new control-flow/SQL evidence, beyond prior DATA-14's ordering correctness finding.

**Defendable growth:** Exact count typically considers the full matching relation; page work grows with offset K plus returned cap P. At the demonstrated request K=999980 and P=20. The double does not estimate query time or prove one million physical reads. For sparse searches the cost depends on total candidate users, not only response size.

**Corrected-code proposal:** Return immediately for total=0; use stable keyset pagination and optional counts for large interactive lists. If substring search is required and measured expensive, evaluate trigram/full-text rather than adding another plain B-tree; retain the existing role/permission filter.

```python
if total == 0:
    return {"items": [], "total": 0, "page": page,
            "page_size": page_size, "total_pages": 0}
query = query.where(User.id > after_id).order_by(User.id).limit(page_size + 1)
```

The cursor example is an alternative repository/API contract, not a drop-in replacement for page numbers. If the UI requires exact page totals, preserve them through a measured alternative instead of silently changing behavior. Proposed measurement: count DB statements and p50/p95 at 10k/100k/1M users with empty, common and rare search terms; first/last/deep pages under equal cache conditions. Record EXPLAIN buffers, actual rows and index write/storage cost. Verify role isolation, stable ordering, wildcard semantics and pagination without duplicates/skips.

### PERF-DATA-05 — Refresh rotation continuously enlarges an authentication table without cleanup

**Impact:** Medium, long-term growth hypothesis. **Category:** database. **Review disposition:** Required (no prefix). **Location:** `backend/app/models/refresh_token.py:11–20`; `backend/app/repositories/sqlalchemy/refresh_token_repository.py:15–36`; migration `backend/alembic/versions/c592774b16d3_initial_migration.py:100–112`.

**Problem/new evidence:** Each login/rotation inserts a new RefreshToken. Revocation only updates revoked_at and valid lookup tests expires_at; no scheduled expired/revoked-row purge or expires_at cleanup index exists in the owned chain. Read-only auth context confirms insertion on each rotation. User deactivation retains rows; only physical deletion cascades. The token_hash index avoids a blanket full-table-scan claim for ordinary refresh lookup, but expired rows continue consuming heap/index/vacuum/backup storage, while per-user revoke_all must identify a user's active tokens without a user-leading index.

**Defendable growth:** At R persisted login/rotations per day, after D days without purge the table receives approximately R×D rows. An illustrative workload of 1,000 active sessions rotating hourly yields 24,000 rows/day and 8.76M/year; that is a workload model, not observed production traffic. Unknown actual session behavior determines urgency. Prior BUS-01/DATA-04 identity/replay defects remain separate correctness context: pruning does not fix them.

**Corrected-code proposal:** Define a short revoked-token replay-detection retention window and expiry retention, delete eligible rows in bounded batches, and evaluate an expiry index plus user-active lookup index using actual plans. Keep tokens needed for family replay detection until its security window ends; clean them only after implementing correct identity/rotation policy.

```sql
WITH doomed AS (
  SELECT id FROM refresh_tokens
  WHERE expires_at < :retention_cutoff
  ORDER BY expires_at, id LIMIT :batch_size
)
DELETE FROM refresh_tokens t USING doomed d WHERE t.id = d.id;
```

A forward migration can add (expires_at,id) when justified; rollout concurrently if the table is large. Proposed measurement: sample daily inserts, pg_total_relation_size, expired/revoked fraction, vacuum/backup time and EXPLAIN on hash lookup/revoke/purge at 100k/1M/10M rows. Measure bounded purge lock/WAL effects and verify no live session or retained replay evidence is deleted.

## 4. What is done well

- One async engine/session factory per process, no commit in generic repository writes, expire_on_commit=False, pre-ping/recycle and request rollback are deliberate useful patterns. They are not automatically defects.
- Common page size is capped at 100; many profile aggregates and payment decorations are batched. Parameterized SQL lets query plans be examined safely.
- Existing UNIQUE constraints retain useful journal/student/date and summary prefixes even when redundant explicit indexes are removed. Finance migrations add targeted student/date/type/allocation indexes; the active-allocation index exists, so it is not reported missing.
- Redis uses shared state and ARQ pooling rather than a new producer connection on every warm enqueue. Cold initialization/lifecycle defects already covered by DATA-15 remain context; no new fabricated benchmark is assigned to them.
- The image uses one worker, explicit memory/instance flags and a nonroot runtime; Docker Buildx reuses CI cache. These make capacity measurements reproducible once process/revision budgets agree.
- Tests assert finance reconciliation, exact reversals and optimistic versions. Backfill uses one controlled transaction and defaults to rollback; its own large-data duration should be measured before operational use, without relabeling previously reported domain query loops.

## 5. Prioritized fixes

| Priority | Action | Effort |
| --- | --- | --- |
| 1 | Profile migration work/locks and fail deployment on migration errors (PERF-DATA-03). | M–L |
| 2 | Establish revision/worker connection and timeout budgets across CI/local deployers (PERF-DATA-01). | M |
| 3 | Measure course-prefix roster plans on the actual migration chain; restore a justified index (PERF-DATA-02). | M |
| 4 | Short-circuit empty pages; evaluate cursor/count/search plan changes with large datasets (PERF-DATA-04). | S–M |
| 5 | Measure refresh-row accumulation and implement bounded security-aware cleanup (PERF-DATA-05). | M |

S = localized; M = multiple components and measurement; L = staged rollout. These recommendations are independent experiments: fixed datasets/hardware/cache conditions, repeated runs, query/hold/lock metrics and correctness gates are required before claiming improvement. No optimization, integration test, query plan or production benchmark was executed during this audit.
