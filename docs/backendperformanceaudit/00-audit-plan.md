# Backend performance audit plan

## Project and scope

Python 3.12 FastAPI IMKON CRM, module app backend/app/main.py, async SQLAlchemy/asyncpg PostgreSQL, Redis/ARQ, Pydantic v2, bcrypt/JWT, SMTP, aiogram Telegram, optional GCS. Domains: users, enrollment/courses/journals, financial charges/ledger/allocation and notifications; deployment Google Cloud Run or VM.

The original 124 backend Python files retain exactly the ownership in docs/backendcodequalityaudit/00-audit-plan.md: A=44, B=22, C=58, with no overlaps/omissions (inventory verified). This audit additionally includes seven migration versions and 16 infrastructure/template/shell files, for 147 owned files total. The old quality plan and all three reports were read as untrusted context; their claims must be reverified. Generated outputs, real .env files, caches, virtual environments, node_modules and Git internals are excluded.

## Method and constraints

All reviewers use GPT 6.1 Sol with medium reasoning. Previous sessions were unavailable; replacements receive self-contained context. Every owned file receives both security and performance review; clean files need no fabricated findings. Read all three installed SKILL.md files and both bundled references directories in full: /run/codex-environment/codex-home/skills/{security-and-hardening,performance-optimization,code-review-and-quality}/. Their additional ../../references shared checklists are not installed; do not invent them.

Use the review skill's evidence/reachability method and action labels alongside the user's requested impact scales: security Critical/High/Medium/Low; performance High/Medium/Low. State Review disposition separately (Critical:, Required/no prefix, Optional:/Consider:, Nit:, FYI). Map impact to actual reachable consequences, not merely style. Security method starts with assets, trust boundaries and STRIDE abuse cases; performance method separates demonstrated operations from unmeasured latency/production hypotheses.

Novelty rule: reference earlier finding IDs. BUS-01 (same-second refresh collision), API-01 (private static documents), BUS-02 (ledger concurrent overspend) get only newly verified exploit detail, severity reassessment or concrete remediation, never copied findings. Every other new finding must represent a distinct vulnerability/impact/path or genuinely new quantified evidence/measurement insight; simple repeats from prior reports belong in context only. Do not infer remote attacker control over fixed admin configuration or constant shell/SQL strings.

Only writes inside docs/backendsecurityaudit/ and docs/backendperformanceaudit/ are allowed. No source changes, old-report edits, task tracker edits, commits/pushes, dependency installations, app imports, destructive fixture/test runs, deployments or service mutations. Use Conda base (/workspace/miniconda3), PYTHONDONTWRITEBYTECODE=1 and memory-only analysis/doubles. Optional network advisory queries are read-only; caches/output must be disabled or written within the allowed folders. No real credentials/PII are printed. Dependency manifests are unpinned ranges, no Python lockfile exists; auditing installed versions is a point-in-time check, not proof all allowed versions are safe. No optimization is implemented, and measurement plans are not claimed as executed tests.

## Measurement strategy

Likely hot paths are autosave, authentication and profile/chart reads, ledger writes/reporting and reminder jobs. Capture p50/p95/p99 latency, throughput, event-loop lag, DB execute/query counts and pool wait, affected rows/flush counts, decoded payload/RSS, and cache hit/miss/coalescing rates. Compare realistic bounded data sizes and traffic concurrency; do not fabricate timings, query plans or load-test results. Missing-index claims remain hypotheses until EXPLAIN/representative cardinalities justify them. Any future fix requires equal conditions, repeated before/after measurements and correctness gates.

## Group A — api-layer

Outputs: docs/backendsecurityaudit/01-api-layer-security-audit.md and docs/backendperformanceaudit/01-api-layer-performance-audit.md.

Security focus: JWT scope/type and Depends guards, self/admin property permissions and IDOR, request bounds and uploads, data returned to peers, CORS/headers/CSRF applicability, malicious JWT claim shapes, protected vs anonymous endpoint trust boundaries.

Performance focus: Batch sizes and nested payloads, chart fetch/compute work and response amplification, auth dependency transactions, maintenance request lifetime, request serialization and throttling.

Likely hot paths: PUT /api/v1/journals/{id}/entries; GET /api/v1/courses/{id}/progress-chart; GET journal detail; student/mentor profiles; login/reset routes; cron maintenance.

### Exact original Python ownership

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

### Additional owned dependency/infrastructure files

- `backend/test_live_backend.sh`
- `backend/test_live_all_groups.sh`

### Read-only context

AGENTS.md, CONTRACT.md, docs/backendcodequalityaudit/00-audit-plan.md and all three old reports; both new plans; every file owned by other groups may be opened only to trace dependencies/reachability, not independently audited. No file ownership overlaps.

## Group B — business-domain

Outputs: docs/backendsecurityaudit/02-business-domain-security-audit.md and docs/backendperformanceaudit/02-business-domain-performance-audit.md.

Security focus: Token identity/session lifecycle and revocation, financial security interleavings, upload format/path policy, parent/notification identity, secrets/logging, async session error handling, business authorization and service object ownership.

Performance focus: CPU work/event loop blocking, external calls while holding sessions, finance analytics cache stampedes and key design, ledger write amplification, journal recalculation/flushes, worker task limits/retries/timeouts, storage and queue object reuse.

Likely hot paths: Login/password reset; upload/avatar/document workflows; payment/allocation/refund commands; journal autosave; analytics cache misses; payment/exam notification jobs.

### Exact original Python ownership

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

### Additional owned dependency/infrastructure files

None; worker/server runtime Python files remain in the original list.

### Read-only context

AGENTS.md, CONTRACT.md, docs/backendcodequalityaudit/00-audit-plan.md and all three old reports; both new plans; every file owned by other groups may be opened only to trace dependencies/reachability, not independently audited. No file ownership overlaps.

## Group C — data-infrastructure

Outputs: docs/backendsecurityaudit/03-data-infrastructure-security-audit.md and docs/backendperformanceaudit/03-data-infrastructure-performance-audit.md.

Security focus: Advisories/reachability and dependency installation boundary, Docker/CI privilege and secrets, VM network exposure and auth, deployment trust, migrations/database constraints, data retention/erasure, sensitive fields/logs, Redis atomicity and transport.

Performance focus: Query/index shapes with migration context, DB pool budgets vs server/worker concurrency, engine/session lifetime and timeouts, retention/storage growth, CI resource settings, Redis pool creation, migration rollout/backfill behaviour.

Likely hot paths: Student profile/rank/history, common COUNT/OFFSET pagination; auth refresh hash lookup; active allocation and payment date aggregate scans; Redis jobs and limits; cold starts and shared DB connection budget.

### Exact original Python ownership

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

### Additional owned dependency/infrastructure files

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

### Read-only context

AGENTS.md, CONTRACT.md, docs/backendcodequalityaudit/00-audit-plan.md and all three old reports; both new plans; every file owned by other groups may be opened only to trace dependencies/reachability, not independently audited. No file ownership overlaps.

## Outputs and final verification

Security report: (1) exact Scope, (2) verdict/security score 1–10, (3) impact-ordered findings, ID, severity, OWASP API/CWE category, file:lines, realistic exploit scenario, concise source evidence and corrected-code proposal, (4) strengths, (5) prioritized S/M/L fixes. Performance report: same five sections with performance/scalability score, impact High/Medium/Low, category async/database/caching/concurrency/payload/startup, reachable workload growth, corrected-code proposal and precise measurement/verification plan per finding. Hypotheses must be labeled.

The orchestrator waits for all six reports, checks structure and exact owned-file coverage, checks every Critical/High security and every High performance claim against source, edits only audit reports to correct/remove false positives, and checks hashes for files outside the two allowed audit folders. Final reply gives files, group scores, confirmed status of the three known risks and top security/performance priorities.

## Final orchestrator verification

Both plans and all six reports are complete. Original ownership is unchanged; inventories match exactly across both audits: A 46 files, B 22, C 79 (147 total, including all original 124 backend Python files). Scores for performance/scalability: API 5/10; business/domain 4/10; data/infrastructure 5/10. All 131 Python files including newly included migrations passed AST parsing.

Every High performance finding was checked against source:

| Finding | Verification | Limits |
| --- | --- | --- |
| PERF-BUS-01 High | SMTP has no timeout; Python global socket timeout is None. Reset/resend lookup or user INSERT precedes awaited SMTP; yield-session commit occurs after handler return. A stalled call can hold the checked-out DB transaction plus thread. | No stalled SMTP/load test ran; capacity/latency effect is a hypothesis with explicit pool/thread/transaction measurement plan. SMTP itself is correctly thread-offloaded. |
| PERF-BUS-02 High | AST independently counted 7 get_analytics execute sites, 3 credit aggregates, 1 aging query and 2 debt queries: 13 SELECTs per cold computation. No miss coalescing surrounds read/compute/set. | Up to 13R queries for R synchronized misses is source-derived, not measured production latency or DB cost. |

All other performance findings have Medium impact. New evidence includes executed original-handler synthetic chart operation/response counts, duplicate-batch acceptance and original-login budget reset; statically quantified K+2 autosave flush invocations (not necessarily K+2 SQL round trips), request pool churn, cache SCAN growth and course-copy row creation; isolated pagination control flow and compiled deep offset; migration row-update models and capacity/retention estimates. Every proposal states what to measure and how to preserve correctness. No index benefit, production bottleneck threshold, measured optimization win or global performance budget compliance is asserted.

Important corrections: permanent Redis socket-leak claims were rejected because GC may close a writer; missing explicit closure is churn/cleanup uncertainty. SMTP transaction retention was distinguished from event-loop blocking. Connection ceilings are maximum potential use, not preallocated reservations. Migration index choices remain EXPLAIN hypotheses; a duplicate index removal is not inherently a defect. Prior findings are referenced only when adding new quantified evidence or a distinct reachable path.

Source/old-audit integrity matched 455 inventoried files outside both allowed audit directories, with no additions/removals in that inventory. Only these plans/reports and the security advisory JSON evidence were written. No application import, integration/load test, DB execution, migration or optimization was performed. The sole orchestrator live-service observation was a read-only local Redis configuration query for security reachability, not a performance benchmark.
