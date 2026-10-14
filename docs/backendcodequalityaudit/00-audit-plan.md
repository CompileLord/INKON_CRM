# Backend code quality audit plan

## Project overview

IMKON CRM is a Python 3.12/FastAPI application backed by async SQLAlchemy/asyncpg PostgreSQL, Redis/ARQ, Pydantic v2, SMTP, Telegram/aiogram and optional Google Cloud Storage. Entry point: backend/app/main.py (module-level app with lifespan). Routers are backend/app/api/v1, DTOs backend/app/schemas, services backend/app/services, persistence backend/app/models and repositories, wiring backend/app/core/deps.py. Deployment targets Google Cloud Run.

Repository: CompileLord/INKON_CRM. Scope: all 124 nongenerated backend Python files (13,950 lines), including scripts, Alembic environment and tests. The seven backend/alembic/versions/*.py migration version files are excluded; read them as context only and mention a specific clear problem if verified. No Python files exist elsewhere in the repository outside these and the excluded migrations. Virtual environments, node_modules, __pycache__, .git, build outputs and generated outputs are excluded. The contract generator is handwritten source and remains in scope; its generated CONTRACT.md output is context only.

## Method and constraints

Read @code-review-and-quality in full at /run/codex-environment/codex-home/skills/code-review-and-quality/SKILL.md. Apply its five axes (correctness, readability/simplicity, architecture, security, performance) to every owned file and explicitly evaluate code quality, maintainability, extensibility and scalability. Severity labels: Critical: (merge blocker); Required (no prefix, must address); Optional: / Consider:; Nit:; FYI. Scores are qualitative audit assessments, not measured coverage or benchmark results.

Read relevant tests before implementation. Only verified, actionable findings with exact file/line references and excerpts belong in reports. Do not claim every style deviation is a defect; acknowledge idiomatic FastAPI Depends and SQLAlchemy behavior. Source mutation testing is omitted because the user's no-source-edit instruction overrides the skill's mutation experiment. The referenced security/performance checklists and companion skills are not bundled; use the available main skill without inventing their rules.

Only writes inside docs/backendcodequalityaudit/ are authorized. Do not change source, task trackers, dependency manifests, Git metadata, environment settings, databases, fixtures or uploads. Do not run existing integration tests or app imports that create files/state outside the allowed directory. AST parsing and in-memory analysis are permitted; set PYTHONDONTWRITEBYTECODE=1 and use Conda base for Python. Previous onboarding observed 100 backend tests passing; that is historical evidence, not an audit test run. Record any checks actually run during this audit separately. No commits or pushes.

## Repository exploration

Inspected AGENTS.md, the entry point/lifespan/middleware, core configuration and Depends wiring, DB engine/session/mixins, model registration, routers/schemas/services/repositories inventory, integration fixture architecture and representative finance tests, Alembic env, Dockerfile, compose, requirements/pyproject and backend CI workflow. Frontend, product/design plans and CONTRACT.md are context only. Docker uses a nonroot Python 3.12 image; compose supplies PostgreSQL 16 and Redis 7; CI runs pytest before Cloud Run deployment. Configuration is instantiated at import time. Tests create ORM tables rather than apply migrations and use a dedicated PostgreSQL database.

## Ownership and balancing

Exactly one reviewer owns each file. Group A: 44 files / 4,178 lines. Group B: 22 files / 4,643 lines, including the complex finance and journal services. Group C: 58 files / 5,129 lines, including many small model/protocol modules and larger invariant tests/scripts. Complexity and line counts are reasonably balanced despite differing file counts.

## Group A — API layer

Output: docs/backendcodequalityaudit/01-api-layer-audit.md

Special attention: Authorization and object-level access, token scope enforcement, request validation and typing, schemas versus actual behavior, router/service boundaries, dependency lifecycle, response handling and middleware/static storage exposure. Review API/RBAC tests first. Trace security findings into services/models as read-only context.

### Exact owned file list

- `backend/app/api/v1/audit_logs.py`
- `backend/app/api/v1/auth.py`
- `backend/app/api/v1/courses.py`
- `backend/app/api/v1/cron.py`
- `backend/app/api/v1/documents.py`
- `backend/app/api/v1/enrollments.py`
- `backend/app/api/v1/finance.py`
- `backend/app/api/v1/journals.py`
- `backend/app/api/v1/mentors.py`
- `backend/app/api/v1/notifications.py`
- `backend/app/api/v1/settings.py`
- `backend/app/api/v1/students.py`
- `backend/app/api/v1/telegram.py`
- `backend/app/api/v1/users.py`
- `backend/app/core/deps.py`
- `backend/app/main.py`
- `backend/app/schemas/accounting_period.py`
- `backend/app/schemas/analytics.py`
- `backend/app/schemas/audit_log.py`
- `backend/app/schemas/auth.py`
- `backend/app/schemas/charge.py`
- `backend/app/schemas/common.py`
- `backend/app/schemas/course.py`
- `backend/app/schemas/debt.py`
- `backend/app/schemas/document.py`
- `backend/app/schemas/enrollment.py`
- `backend/app/schemas/journal.py`
- `backend/app/schemas/ledger.py`
- `backend/app/schemas/notification.py`
- `backend/app/schemas/org_settings.py`
- `backend/app/schemas/payment.py`
- `backend/app/schemas/receipt.py`
- `backend/app/schemas/user.py`
- `backend/app/tests/integration/test_auth_api.py`
- `backend/app/tests/integration/test_avatar.py`
- `backend/app/tests/integration/test_course_copy.py`
- `backend/app/tests/integration/test_courses.py`
- `backend/app/tests/integration/test_coverage_gaps.py`
- `backend/app/tests/integration/test_documents.py`
- `backend/app/tests/integration/test_endpoints_rbac.py`
- `backend/app/tests/integration/test_integrations_and_polish.py`
- `backend/app/tests/integration/test_rbac.py`
- `backend/app/tests/integration/test_settings.py`
- `backend/app/tests/integration/test_student_cabinet_backend.py`

### Read-only context

- `AGENTS.md`
- `CONTRACT.md`
- `backend/app/core/config.py`
- `backend/app/core/security.py`
- `backend/app/core/rate_limiter.py`
- `backend/app/db/session.py`
- `backend/app/tests/conftest.py`
- `backend/app/services/auth_service.py`
- `backend/app/services/document_service.py`
- `backend/app/services/storage_service.py`

Any file owned by another group may additionally be read to follow a dependency or verify test intent; it must not receive an independent finding in this group's report. Attribute findings to owned files only.

## Group B — Business and domain logic

Output: docs/backendcodequalityaudit/02-business-domain-audit.md

Special attention: Transactional boundaries, ledger correctness and concurrent writers, journal optimistic concurrency, service/repository layering, runtime dependency injection, password hashing and file/image blocking in async functions, background jobs and delivery, cache correctness and invalidation, Telegram behavior, complexity and extensibility. Read cross-group finance/journal tests first.

### Exact owned file list

- `backend/app/core/schedule_utils.py`
- `backend/app/core/scoring.py`
- `backend/app/core/security.py`
- `backend/app/services/audit_service.py`
- `backend/app/services/auth_service.py`
- `backend/app/services/course_service.py`
- `backend/app/services/document_service.py`
- `backend/app/services/email_service.py`
- `backend/app/services/enrollment_service.py`
- `backend/app/services/finance_service.py`
- `backend/app/services/journal_generation_service.py`
- `backend/app/services/journal_service.py`
- `backend/app/services/notification_service.py`
- `backend/app/services/settings_service.py`
- `backend/app/services/storage_service.py`
- `backend/app/services/sum_calculation_service.py`
- `backend/app/services/user_service.py`
- `backend/app/telegram_bot/bot.py`
- `backend/app/telegram_bot/handlers/start.py`
- `backend/app/workers/__init__.py`
- `backend/app/workers/settings.py`
- `backend/app/workers/tasks.py`

### Read-only context

- `AGENTS.md`
- `CONTRACT.md`
- `backend/app/core/config.py`
- `backend/app/core/deps.py`
- `backend/app/core/redis.py`
- `backend/app/core/rate_limiter.py`
- `backend/app/db/session.py`
- `backend/app/tests/conftest.py`
- `backend/app/tests/integration/test_finance.py`
- `backend/app/tests/integration/test_finance_invariants.py`
- `backend/app/tests/integration/test_finance_redesign.py`
- `backend/app/tests/integration/test_journals.py`
- `backend/app/api/v1/finance.py`
- `backend/app/api/v1/auth.py`

Any file owned by another group may additionally be read to follow a dependency or verify test intent; it must not receive an independent finding in this group's report. Attribute findings to owned files only.

## Group C — Data and infrastructure

Output: docs/backendcodequalityaudit/03-data-infrastructure-audit.md

Special attention: Persistence constraints/indexes/locking, eager loading and pagination, protocol/API consistency, connection and session lifecycle, Redis atomicity and configuration, Alembic model registration, safe/idempotent scripts, representative test coverage and destructive fixture isolation, mismatch between deployment environment and Settings requirements, stateless Cloud Run storage. Read tests first. Inspect migration versions only for clear corroborating problems.

### Exact owned file list

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

### Read-only context

- `AGENTS.md`
- `CONTRACT.md`
- `backend/Dockerfile`
- `docker-compose.yml`
- `backend/requirements.txt`
- `backend/pyproject.toml`
- `.github/workflows/deploy-backend.yml`
- `backend/app/main.py`
- `backend/app/core/deps.py`
- `backend/app/services/finance_service.py`
- `backend/app/services/auth_service.py`
- `backend/app/services/journal_service.py`
- `backend/app/services/storage_service.py`

Any file owned by another group may additionally be read to follow a dependency or verify test intent; it must not receive an independent finding in this group's report. Attribute findings to owned files only.

## Deliverables and orchestrator verification

Each reviewer writes exactly its one report, containing (1) scope listing every owned file, (2) 3–5 sentence summary, overall verdict, and four 1–10 scores, (3) severity-ordered findings with ID, severity, category, exact location, problem, evidence and concrete recommendation, (4) strengths, (5) top 5–10 prioritized actions with S/M/L effort. Cover all four goals explicitly; clean files need no fabricated findings.

Launch all three reviewers with GPT 6.1 Sol / medium reasoning. After completion, verify files and structure, compare reported scope to the unique inventory, and spot-check 2–3 highest-severity findings per report against original source. Correct unsupported claims only in reports. Confirm source checksums remain unchanged. Final response: report links, scores by group, top three critical issues, and validation limitations.


## Final orchestrator verification

All three requested reports exist and follow the required five-part structure, including four scores and effort estimates. Their scope lists exactly match this plan: 44 API, 22 business/domain and 58 data/infrastructure files, 124 unique files with no overlap or omission. All agents used GPT 6.1 Sol with medium reasoning and independently read the complete installed skill.

The orchestrator checked three Critical findings in each report against the original source:

| Report | Findings checked | Evidence and outcome |
| --- | --- | --- |
| API | API-01, API-02, API-03 | Public StaticFiles mount plus predictable document paths bypass document access guards; general auth ignores restricted scope and the alternative guard has no callers; missing cron secret skips comparison. All retained. |
| Business/domain | BUS-01, BUS-02, BUS-03 | Original refresh generator extracted and executed in memory at fixed time yields identical tokens with exp/iat only, and repository lookup is hash-only; ledger read/insert interleavings have no shared lock or aggregate invariant; refund target lookup does not exclude a prior void. All retained. |
| Data/infrastructure | DATA-01, DATA-02, DATA-03 | Reset scripts use the configured engine/storage without production/disposable-target guards and create a fixed privileged account; fixture FLUSHDB uses app-configured Redis; required POSTGRES fields are omitted from URL-only Cloud Run configuration. All retained with configuration-dependent scope explicit. |

An additional spot-check corrected API-07 to distinguish missing/zero-maximum summaries from preinitialized ungraded summaries with positive maxima. Two data protocol line ranges and one document deletion range were corrected to the actual source bounds. No unsupported Critical finding remained in these nine checks; other findings remain documented static/in-memory analyses, not measured production failures.

Read-only validation: AST parsing succeeded for all 124 Python files. Reviewers also exercised isolated schema/settings/rate-limit/Decimal logic without importing the application or touching services. No pytest, mutation testing, load testing or database operations were performed during this audit. A checksum comparison verified all 451 inventoried files outside the audit directory unchanged. Only the four final Markdown audit documents were retained. No source changes, task-tracker edits, commits, pushes or configuration changes were made.
