# Data and infrastructure audit

## 1. Scope and verification

All 58 exact owned files were read in full and assessed for correctness, readability/simplicity, architecture, security and performance:

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

Read-only context included AGENTS.md, CONTRACT.md, the audit plan, Docker/compose, dependency manifests, deployment workflow, main/Depends wiring, finance/auth/journal/storage services, journal generation and student cabinet tests. No migration-version finding is asserted; those files are excluded from this review. No source, environment configuration, fixtures, database, uploads or Git metadata were changed; the sole write is this report.

Executed checks used Conda base with `PYTHONDONTWRITEBYTECODE=1`: AST parsing succeeded for all 58 owned files; an AST-extracted Settings class confirmed four required split PostgreSQL fields and isolated URL-only instantiation failed on exactly those four fields; an AST-extracted limiter with an in-memory Redis double accepted two simultaneous requests at limit=1. Additional AST inspection confirmed the two destructive scripts contain no ENVIRONMENT guards and enumerated interface methods. These checks did not import the application, connect to services or run pytest. Mutation testing was omitted under the explicit no-source-edit constraint; the historical 100 passing backend tests are not an audit run, migration validation or evidence that races are covered.

## 2. Summary

Verdict: **Request changes** because the shipped configuration rejects a fresh URL-only deployment, test cleanup can erase a configured shared Redis database, and maintenance scripts can erase operational data and seed a known administrator password. Code quality is strongest in small mappings, decimal finance constraints and behavior-oriented ledger/journal tests, but grading state and token consumption still have correctness gaps. Maintainability and extensibility are reduced by incomplete protocols, generic SQL query leakage and implicit configuration contracts. Scalability benefits from async sessions, bounded common pagination and batched aggregates, but per-course ranking queries, unbounded history, non-atomic limiting and fixed per-instance pool budgets need attention.

| Goal | Score / 10 | Assessment |
| --- | --- | --- |
| Code quality | 5 | Clear mappings and useful invariant tests; correctness, error-path and isolation gaps remain. |
| Maintainability | 6 | Small modules and consistent names; global hooks, incomplete contracts and unsafe operational tooling increase coupling. |
| Extensibility | 5 | Protocol scaffolding exists; consumers still need concrete repository extras and SQLAlchemy queries. |
| Scalability | 5 | Async PostgreSQL/Redis and batches are sound foundations; races, query growth and resource budgeting remain unresolved. |

Scores are qualitative assessments, not coverage measurements or load benchmarks.

## 3. Findings

### DATA-01 — Critical: Destructive reset scripts have no environment boundary and install a known administrator password

**Severity:** Critical: · **Categories:** security, quality, maintainability.  
**Locations:** `backend/scripts/clean_db.py:42–63`; `backend/scripts/seed_demo_data.py:170–195`.

Both scripts use the ordinary application's configured engine, truncate with CASCADE immediately, then seed a superadmin with a fixed source-code password and `must_set_password=False`. The demo script also recursively removes configured storage before seeding, and commits cleanup separately from later phases: a download, seed or finance failure leaves an already-reset database. Neither checks ENVIRONMENT, requires an explicit destructive flag or verifies a disposable database/storage target. Fixed password literals are deliberately redacted here.

```python
await conn.execute(text(f"TRUNCATE TABLE {tbl} RESTART IDENTITY CASCADE;"))
shutil.rmtree(settings.STORAGE_PATH, ignore_errors=True)
await clean_database_and_storage()
must_set_password=False
```

**Fix:** Make reset tooling refuse production, require `--reset` plus an explicit disposable target, validate storage against a dedicated demo root, and provision administrator credentials through the existing secure seed flow or generate a one-time credential requiring change. Perform database reset and seeding in one controlled transaction where feasible; stage external assets before destructive work. Add a dry-run showing targets without credentials.

```python
if settings.ENVIRONMENT == "production" or not args.reset:
    raise RuntimeError("Reset requires an explicitly selected disposable environment")
```

### DATA-02 — Critical: Tests flush the application's configured Redis database

**Severity:** Critical: · **Categories:** security, quality.  
**Location:** `backend/app/tests/conftest.py:24–30,77–80`.

The PostgreSQL engine is explicitly replaced with a dedicated test engine, but Redis is imported from application configuration and `db_session` runs unrestricted `flushdb()`. A developer running integration tests with a working development or production REDIS_URL destroys that database's rate limits, verification/reset codes, cached finance results and potentially queued jobs. TESTING does not isolate the Redis destination. Tests requesting only `client` also bypass this reset, leaving rate-limit state order dependent.

```python
from app.core.redis import redis_client
await redis_client.flushdb()
```

**Fix:** Inject a dedicated test Redis connection before application imports, verify its database is explicitly disposable, and clean only a per-test prefix. Make cleanup an autouse fixture shared by API-only tests. Keep the hardcoded PostgreSQL test destination explicitly test-only and validate it before schema deletion.

```python
assert test_redis_database != application_redis_database
await test_redis.delete(*test_owned_keys)
```

### DATA-03 — Critical: Redundant required database fields prevent the documented deployment from starting

**Severity:** Critical: · **Categories:** quality, extensibility.  
**Location:** `backend/app/core/config.py:38–43,70`.

Settings requires POSTGRES_SERVER, POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB as well as DATABASE_URL, although the engine reads only DATABASE_URL. The workflow's Cloud Run env_vars passes DATABASE_URL and none of those four fields, and Docker does not copy an .env file. A fresh deployment therefore fails import-time Settings validation before the app can serve health checks. The AST-extracted class confirmed all four fields are required. The current environment's existing .env-backed setup can work; this finding concerns a fresh runtime with the workflow's variable set. Existing manually retained service variables could also mask the defect but are not a reproducible setup contract.

```python
POSTGRES_SERVER: str
POSTGRES_USER: str
POSTGRES_PASSWORD: str
POSTGRES_DB: str
DATABASE_URL: str
settings = Settings()
```

**Fix:** Use DATABASE_URL as the canonical mandatory database configuration and remove unused split requirements, or build it from split fields only when absent. Give Alembic a database-only settings boundary so migrations do not require SMTP/Telegram/JWT configuration. Validate the actual production variable-name set in a isolated configuration test without reading secret values. Also require a public HTTPS TELEGRAM_WEBHOOK_URL when Telegram is enabled: the present localhost default is unsuitable for the shipped production workflow.

### DATA-04 — Token lookup does not consume refresh tokens atomically

**Severity:** Required (no severity prefix in title) · **Categories:** security, quality.  
**Location:** `backend/app/repositories/sqlalchemy/refresh_token_repository.py:28–36`; defensive schema context `backend/app/models/refresh_token.py:13`.

The valid-token SELECT has no lock and returns the first matching row. Two transactions can read the same unrevoked token, both pass validity, then both rotate it: the subsequent ORM update filters by primary key, not by `revoked_at IS NULL`, and there is no version check. The auth service's read-then-revoke use confirms this concrete interleaving. The hash index is also nonunique, so persistence does not reject duplicate identities; the underlying token-generator collision is owned by the business/domain review and should be fixed there.

```python
query = select(RefreshToken).filter(
    RefreshToken.token_hash == token_hash,
    RefreshToken.revoked_at == None,
    RefreshToken.expires_at > now,
)
return result.scalars().first()
```

**Fix:** Add a repository `consume_valid_token` operation using `UPDATE ... WHERE token_hash = ... AND revoked_at IS NULL AND expires_at > ... RETURNING`, consumed once within the rotation transaction; no row means unauthorized. After fixing issuance and invalidating duplicate legacy tokens, add a unique token-hash constraint. Add a two-session simultaneous rotation test asserting exactly one success.

### DATA-05 — Authentication rate limits allow concurrent requests beyond the configured limit

**Severity:** Required (no severity prefix in title) · **Categories:** security, scalability.  
**Location:** `backend/app/core/rate_limiter.py:10–22`.

GET and threshold comparison occur outside the transaction containing INCR/EXPIRE. At count limit-1, any number of requests can observe the same value, all pass and all increment. A Redis transactional pipeline serializes its own writes; it cannot make an earlier GET atomic. The executed in-memory interleaving accepted two requests at limit=1.

```python
current = await redis_client.get(key)
if current and int(current) >= limit:
    ...
pipe.incr(key)
pipe.expire(key, window)
await pipe.execute()
```

**Fix:** Evaluate threshold, increment and TTL handling in one Lua script or a retrying WATCH transaction. Decide explicitly whether this is a fixed window (expire only on first increment) or an inactivity window (refresh on each accepted attempt); preserve its documented semantics. Test simultaneous calls at the boundary and Retry-After behavior.

### DATA-06 — ARQ uses a different Redis connection contract from the app

**Severity:** Required (no severity prefix in title) · **Categories:** quality, extensibility, scalability.  
**Location:** `backend/app/core/redis.py:4–7,17–26`.

The regular Redis client honors REDIS_URL including its database, authentication and TLS scheme, but ARQ creates RedisSettings from REDIS_HOST/PORT alone. Cloud Run supplies only REDIS_URL; HOST/PORT retain localhost defaults. Job enqueueing therefore targets localhost even while health checks against REDIS_URL succeed; separate database/password/TLS parameters would still be lost if host/port were set.

```python
aioredis.from_url(settings.REDIS_URL, decode_responses=True)
RedisSettings(host=settings.REDIS_HOST, port=settings.REDIS_PORT)
```

**Fix:** Construct producer and worker settings through one URL-based adapter and reuse it in both contexts. ARQ supports `RedisSettings.from_dsn(settings.REDIS_URL)` in the installed API family; verify this against the pinned version before changing it. Add a URL parsing test covering nondefault database, credentials and TLS, without printing values.

```python
redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
```

### DATA-07 — A positive score maximum is incorrectly treated as proof that a period was graded

**Severity:** Required (no severity prefix in title) · **Categories:** quality, maintainability.  
**Location:** `backend/app/repositories/sqlalchemy/user_repository.py:83–93,134–158,183–208,283–288`.

Enrollment initializes every summary with its real positive maximum before any grading. The owned test `test_summary_has_real_maximum_immediately_after_enrollment` explicitly asserts zero sum and a real maximum (`test_journals.py:300–327`). The repository nevertheless counts positive-maximum rows as `periods_graded`, averages them as zero scores, and labels every started unedited period `graded`. Future zero summaries also depress profile averages and ranking. A positive denominator prevents division by zero; it does not represent grading state. The student cabinet test claiming ungraded-period exclusion only checks a bucket and never asserts that behavior.

```python
func.count(case(((JournalStudentSummary.max_period_score > 0), 1)))
elif summary and summary.max_period_score > 0:
    state = "graded"
```

**Fix:** Model actual grading/progress explicitly (for example a summary `graded_at` or submitted/completed state), use that predicate consistently in averages/counts/ranks and journal state, and exclude future periods according to the product rule. Do not infer grading from `sum_score > 0`, because a genuinely graded zero is valid. Add fixtures for unedited, graded-zero, graded-positive and future periods and assert exact averages, rank and count.

### DATA-08 — Demo seed leaves the course sequence behind explicit IDs

**Severity:** Required (no severity prefix in title) · **Categories:** quality, maintainability.  
**Location:** `backend/scripts/seed_demo_data.py:174,349–362,397`.

Cleanup restarts identities, then course definitions explicitly insert IDs 1–4. PostgreSQL sequence defaults advance when nextval is called, not when an explicit ID is inserted. No sequence synchronization occurs afterward. The next ordinary API course creation tries ID 1 and fails with a primary-key conflict; further retries collide with the other seeded IDs.

```python
TRUNCATE TABLE ... RESTART IDENTITY CASCADE
course = Course(id=cdef["id"], ...)
await session.commit()
```

**Fix:** Let PostgreSQL assign course IDs, map seed-definition keys to actual IDs, and generate photo/payment references from that mapping. If fixed IDs are required, synchronize the sequence inside seeding and verify a subsequent ordinary INSERT works.

```sql
SELECT setval(pg_get_serial_sequence('courses', 'id'),
              (SELECT MAX(id) FROM courses), true);
```

### DATA-09 — Installment identity is not protected by persistence

**Severity:** Required (no severity prefix in title) · **Categories:** quality, scalability.  
**Location:** `backend/app/models/charge.py:24–30,33–35`.

The schema checks positivity and adds an enrollment index but permits two active tuition charges with the same enrollment and sequence. The service's documented idempotent generator first selects existing charges, then inserts: concurrent first-time invocations can both see none and each create a full schedule. That turns a retry/concurrency race into duplicate receivables. This finding concerns the missing persistence invariant; service-wide allocation races belong to the domain review.

```python
CheckConstraint("sequence_no >= 1", name="check_charge_sequence_positive")
Index("idx_charges_enrollment", "enrollment_id")
```

**Fix:** Define an active tuition installment identity with a partial unique index, allowing future fee types to reuse sequence numbers if intended. Serialize generation on its enrollment and recover a uniqueness race by reading the winning schedule. Create the matching migration and a two-session generation test.

```python
Index("uq_active_tuition_installment", "enrollment_id", "sequence_no",
      unique=True, postgresql_where=text("type = 'tuition' AND is_deleted = false"))
```

### DATA-10 — Student profile ranking performs one additional database query per course

**Severity:** Required (no severity prefix in title) · **Categories:** scalability, performance.  
**Location:** `backend/app/repositories/sqlalchemy/user_repository.py:182–208`.

Other profile data is aggregated in batches, but ranks run a full class GROUP BY query sequentially for each enrolled course and materialize every student ID just to find one index. For C courses the method executes 7+C queries when courses exist, with ranking work proportional to every class size. More history makes a single student profile increasingly expensive.

```python
for cid in course_ids:
    ...
    rank_res = await self.session.execute(rank_query)
    ranked_students = [row[0] for row in rank_res.all()]
```

**Fix:** Aggregate scores by `(course_id, student_id)` once, rank in SQL with a partitioned window, then select the current student from the ranked subquery. Choose explicit tie semantics and deterministic ordering. Verify query count stays constant as courses are added.

```sql
DENSE_RANK() OVER (PARTITION BY course_id ORDER BY avg_percentage DESC)
```

### DATA-11 — Student journal history is unbounded

**Severity:** Required (no severity prefix in title) · **Categories:** scalability, performance.  
**Location:** `backend/app/repositories/sqlalchemy/user_repository.py:242–277`.

The repository fetches every journal for every course the student has ever enrolled in, builds a full IN-list of IDs, fetches all summaries and returns all results. The student endpoint calls this directly without a bounded page. Query count is bounded but result size, memory, SQL parameters and response size grow with lifetime history.

```python
journal_course_pairs = list(journals_res.all())
journal_ids = [j.id for j, _ in journal_course_pairs]
```

**Fix:** Add an explicit paginated repository operation with a capped page size and stable `(period_start DESC, id DESC)` cursor; retrieve summaries only for that page. Expose the cursor in the API and update the contract together. Add a history test that verifies no page exceeds the cap and no tied-date item is skipped.

### DATA-12 — Repository protocols omit methods consumers already rely on

**Severity:** Required (no severity prefix in title) · **Categories:** extensibility, maintainability.  
**Locations:** `backend/app/repositories/interfaces/base_repository.py:7–29`; `backend/app/repositories/interfaces/user_repository.py:7–31`; SQL implementation context `backend/app/repositories/sqlalchemy/base_repository.py:64–99`.

BaseRepository describes six CRUD methods but no paginated feature operations. Concrete consumers call `get_paginated` with SQLAlchemy selects, and the student endpoint calls `get_student_journals`, also absent from UserRepository. An alternative object satisfying the declared protocol cannot satisfy these real consumers, and adding a generic SQLAlchemy query to the protocol would preserve technology coupling. Raw `dict`/`Dict[str, Any]` returns further hide what callers may use.

```python
class UserRepository(BaseRepository[User], Protocol):
    ...
# Implementation-only API:
async def get_student_journals(...) -> List[Dict[str, Any]]:
```

**Fix:** Define narrow typed feature methods on the owning protocols (`list_student_journals`, filtered audit/document/enrollment pages), returning a typed `Page[T]` or explicit result DTO. Keep Select construction inside SQLAlchemy implementations and wire those protocols through Depends. A small alternative repository stub should satisfy the same behavioral contract without importing SQLAlchemy.

### DATA-13 — Integration setup validates ORM metadata instead of the deployable migration chain

**Severity:** Required (no severity prefix in title) · **Categories:** quality, maintainability.  
**Location:** `backend/app/tests/conftest.py:59–65`.

The session fixture drops public and recreates tables with `Base.metadata.create_all`. This exercises model-created schemas but never verifies that `alembic upgrade head` creates the same schema from an empty database, or upgrades the prior version without data loss. A missing or broken migration can leave all integration tests green. No specific migration defect is asserted here; the verified defect is the test setup's absent deployment check.

```python
await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE;"))
await conn.run_sync(Base.metadata.create_all)
```

**Fix:** Add a separate disposable migration smoke job applying `alembic upgrade head`, comparing expected constraints/columns and testing representative pre-upgrade data. Consider creating the integration schema through Alembic once per session. Keep this additional job isolated from ordinary developer databases and do not suppress migration errors.

### DATA-14 — Optional: Generic pagination lacks stable ordering for user lists

**Severity:** Optional: · **Categories:** quality, scalability.  
**Location:** `backend/app/repositories/sqlalchemy/user_repository.py:36–46,55–65`; common helper `backend/app/repositories/sqlalchemy/base_repository.py:88–91`.

Student and mentor queries pass no ORDER BY into OFFSET/LIMIT. PostgreSQL gives no ordering guarantee without it, so page membership can change across plans or writes even where the caller requests the same filters. The common helper should not silently override deliberate feature ordering.

```python
query = select(User).filter(User.role == UserRole.STUDENT, User.is_deleted == False)
return await self.get_paginated(query, page, page_size)
```

**Fix:** Order each feature query by its intended display field with a unique ID tie-breaker, or ID alone. Use keyset pagination for frequently changing, large lists.

```python
query = query.order_by(User.last_name, User.first_name, User.id)
```

### DATA-15 — Optional: Async infrastructure lifecycle and budgets should be explicit

**Severity:** Optional: · **Categories:** maintainability, scalability.  
**Locations:** `backend/app/core/redis.py:14–26,37–41`; `backend/app/db/session.py:9–18`.

Concurrent first calls can both observe `_arq_pool is None`, await create_pool and allocate separate pools; the later assignment overwrites the first handle and only the retained handle is closed. The module-owned regular Redis client and database engine have no corresponding shutdown function, while main closes only ARQ. The engine reserves a ceiling of 30 connections per process; two maximum Cloud Run instances imply up to 60, with overlapping revisions and external workers increasing that budget. This is a resource/lifecycle exposure, not a claim that 60 exceeds an unknown database limit.

```python
if _arq_pool is None:
    _arq_pool = await create_pool(redis_settings)
# database:
pool_size=20,
max_overflow=10,
```

**Fix:** Initialize clients once in lifespan or protect lazy pool creation with a lock, close regular Redis and dispose the engine in finally, and configure per-process pool size/overflow from an explicit total connection budget. Validate cancellation/shutdown and concurrent initialization with controlled doubles.

### DATA-16 — Nit: Remove an accidental module annotation

**Severity:** Nit: · **Category:** maintainability.  
**Location:** `backend/app/models/course_mentor_history.py:23`.

```python
Length: 792
```

This parses successfully as a module variable annotation; it is not a runtime syntax error or a mapped field. It appears to be an accidental size annotation and contributes no model behavior. Remove it in a separate source-cleanup change when authorized.

## 4. What is done well

- Persistence mappings are small, consistently named and mostly explicit about nullable fields, Numeric(10,2) money, timezone-aware events and FK deletion behavior. Finance/allocation positivity, schedule/day checks and composite journal/enrollment uniqueness protect useful invariants.
- JournalEntry and JournalStudentSummary use SQLAlchemy `version_id_col`; ordinary ORM flushes participate in optimistic concurrency. The tests assert stale submissions, returned version increments, partial-batch conflicts and unchanged state on rejected score-weight changes.
- Ledger tests cover exact reversal round-trips, retained allocation history, wallet versus cash refunds, overpayment credit, allocation bounds, closed periods, read-only GET behavior and aging reconciliation. These are substantial behavior assertions, though no simultaneous-writer experiment ran during this audit.
- The base repository flushes without committing; request-scoped async session wiring can own transaction boundaries. SQL expressions are parameterized; no user-data SQL concatenation was found. Reset scripts interpolate a fixed internal table list, so their issue is destructive scope rather than an SQL injection claim.
- Common paginated responses cap page_size at 100; student profile calculations batch most aggregates and schedules. Async engine pre-ping, recycling and expire_on_commit=False are deliberate choices, not defects by themselves.
- Alembic's finance model registration works: importing `app.models.user` first executes `app.models.__init__`, which registers charge, ledger, allocation and accounting-period models; env.py additionally imports OrgSettings. Missing direct imports of finance classes in env.py are therefore not a finding.
- Finance backfill defaults to rollback, uses one transaction, refuses applying over an existing ledger and verifies no charge is overallocated. It is explicitly a one-shot migration rather than a falsely claimed idempotent operational command. Seed-admin validates input, refuses duplicate email and uses getpass interactively.
- Stateless Cloud Run storage was traced through config, Depends and storage implementations: GCS has a threaded adapter, while local storage lives per instance and may disappear on replacement. Runtime backend selection and dependency wiring are other groups' ownership; this report does not create a duplicate independent finding there. Production should be verified with shared persistent storage before horizontal deployment.
- Readability is generally good in models/protocols; the largest owned implementation is the demo seed, which mixes reset, external assets, users/courses, grades and finance and merits splitting after safety fixes. The fixed legacy Payment model/repository still supports backfill; that is not enough evidence to declare it dead code. Broad exception suppression in the global before_flush sanitizer and raw Any/dict boundaries deserve targeted cleanup, without treating every style deviation as a blocker.

## 5. Prioritized actions

| Priority | Action | Effort |
| --- | --- | --- |
| 1 | Guard reset scripts, validate disposable targets, remove fixed administrator credentials and stage assets before cleanup (DATA-01). | M |
| 2 | Isolate test Redis, remove global FLUSHDB and apply uniform per-test cleanup (DATA-02). | S |
| 3 | Make URL-only database deployment valid and isolate migration settings; validate production Telegram configuration (DATA-03). | M |
| 4 | Make refresh consumption and authentication limiting atomic; add simultaneous-request tests (DATA-04–05). | M |
| 5 | Use one Redis URL contract for app, ARQ producer and worker, with a parsing test (DATA-06). | S |
| 6 | Add explicit grading state and use it in student averages/counts/ranks/history, including graded-zero tests (DATA-07). | L |
| 7 | Repair demo course sequence behavior and protect active tuition installment identity with locking/constraint tests (DATA-08–09). | M |
| 8 | Batch rank computation and paginate student history with stable ordering (DATA-10–11, DATA-14). | M |
| 9 | Replace implementation-only SQL pagination calls with typed feature repository contracts and Depends wiring (DATA-12). | L |
| 10 | Validate migrations in a disposable job and centralize lifecycle/pool budgeting (DATA-13, DATA-15). | M |

S = localized change; M = several components plus targeted validation; L = cross-layer model/contract change. These are remediation recommendations only; source fixes, mutation tests, database operations and new test execution were outside the authorized audit.
