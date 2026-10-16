# Backend security audit plan

## Project and scope

Python 3.12 FastAPI IMKON CRM, module app backend/app/main.py, async SQLAlchemy/asyncpg PostgreSQL, Redis/ARQ, Pydantic v2, bcrypt/JWT, SMTP, aiogram Telegram, optional GCS. Domains: users, enrollment/courses/journals, financial charges/ledger/allocation and notifications; deployment Google Cloud Run or VM.

The original 124 backend Python files retain exactly the ownership in docs/backendcodequalityaudit/00-audit-plan.md: A=44, B=22, C=58, with no overlaps/omissions (inventory verified). This audit additionally includes seven migration versions and 16 infrastructure/template/shell files, for 147 owned files total. The old quality plan and all three reports were read as untrusted context; their claims must be reverified. Generated outputs, real .env files, caches, virtual environments, node_modules and Git internals are excluded.

## Method and constraints

All reviewers use GPT 6.1 Sol with medium reasoning. Previous sessions were unavailable; replacements receive self-contained context. Every owned file receives both security and performance review; clean files need no fabricated findings. Read all three installed SKILL.md files and both bundled references directories in full: /run/codex-environment/codex-home/skills/{security-and-hardening,performance-optimization,code-review-and-quality}/. Their additional ../../references shared checklists are not installed; do not invent them.

Use the review skill's evidence/reachability method and action labels alongside the user's requested impact scales: security Critical/High/Medium/Low; performance High/Medium/Low. State Review disposition separately (Critical:, Required/no prefix, Optional:/Consider:, Nit:, FYI). Map impact to actual reachable consequences, not merely style. Security method starts with assets, trust boundaries and STRIDE abuse cases; performance method separates demonstrated operations from unmeasured latency/production hypotheses.

Novelty rule: reference earlier finding IDs. BUS-01 (same-second refresh collision), API-01 (private static documents), BUS-02 (ledger concurrent overspend) get only newly verified exploit detail, severity reassessment or concrete remediation, never copied findings. Every other new finding must represent a distinct vulnerability/impact/path or genuinely new quantified evidence/measurement insight; simple repeats from prior reports belong in context only. Do not infer remote attacker control over fixed admin configuration or constant shell/SQL strings.

Only writes inside docs/backendsecurityaudit/ and docs/backendperformanceaudit/ are allowed. No source changes, old-report edits, task tracker edits, commits/pushes, dependency installations, app imports, destructive fixture/test runs, deployments or service mutations. Use Conda base (/workspace/miniconda3), PYTHONDONTWRITEBYTECODE=1 and memory-only analysis/doubles. Optional network advisory queries are read-only; caches/output must be disabled or written within the allowed folders. No real credentials/PII are printed. Dependency manifests are unpinned ranges, no Python lockfile exists; auditing installed versions is a point-in-time check, not proof all allowed versions are safe. No optimization is implemented, and measurement plans are not claimed as executed tests.

## Threat model

Assets: account/session credentials, student/parent contact and grade data, documents/images, financial ledger integrity, administrator operations, DB/Redis contents, deployment credentials. Boundaries: anonymous HTTP to auth routes; authenticated role to resource/property guards; multipart input to disk/decoders; Telegram update to binding; API producers to Redis/ARQ consumers; instances to PostgreSQL/shared cache/storage; CI/VM operators to package and deployment services. Evaluate spoofing, tampering, repudiation, disclosure, DoS and privilege escalation at each relevant boundary. The bearer-token backend does not automatically inherit cookie-session CSRF assumptions.

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

All six reports exist, follow the five required sections and list their exact owned files. Coverage was verified with no overlap/omission: A 46, B 22, C 79, total 147 files (original 124 Python files plus seven migrations and 16 other files). AST parsing passed for all 131 Python files. Security scores: API 4/10, business/domain 3/10, data/infrastructure 4/10; performance/scalability scores respectively 5/10, 4/10, 5/10.

Every Critical/High security finding was independently checked:

| Finding | Checked source and evidence | Outcome |
| --- | --- | --- |
| SEC-API-01 High | Self-update DTO accepts guardian fields; PATCH /users/me passes caller ID; service assigns the chat; worker uses it for document/grade delivery. PRD describes guardian contact confirmation. | Retained, scoped to own student's guardian destination, not cross-student access. |
| SEC-API-02 High | Student list admits mentors but carries no mentor filter; service/repository use role/deletion/search only; response includes student/parent contact fields. PRD own-course rule applies. | Retained; global directory enumeration bypasses the scoped detail policy. |
| SEC-BUS-01 Critical, extension of BUS-01 | Original generator has exp/iat only; refresh hash lookup is identity-free and uses matched row user_id. Reviewer executed original service/helpers with frozen time and synthetic repository/users to obtain administrator subject from student refresh. | Confirmed; actual DB first-row order and targeted victim selection are not guaranteed. |
| SEC-BUS-02 High | SMTP.starttls has no context; installed Python uses _create_stdlib_context with CERT_NONE and check_hostname=False. Credentials/recovery codes follow TLS negotiation. | Retained; on-path/DNS/route attacker prerequisite explicit. |
| SEC-BUS-03 High | Password reset updates hash and revokes refresh rows only; access JWT and normal dependency carry/check no credential epoch. | Retained, bounded by existing 30-minute access expiry; no indefinite compromise claim. |
| SEC-DATA-01 High | VM script all-interface port mapping lacks Redis ACL/TLS; local existing redis:7-alpine container read-only CONFIG GET shows protected-mode=no, bind all interfaces. Installed ARQ decoder uses pickle.loads and WorkerSettings has no override. | Retained; VM firewall/network access unverified; worker execution requires a connected worker. Compose itself remains loopback-bound. |
| SEC-DATA-02 High | Dockerfile copies storage, dockerignore omits storage exclusion, local deploy submits that context. | Retained only for upload-bearing builds and artifact readers; clean CI checkout leakage is not claimed. |

Known-risk status: BUS-01 refresh collision remains Critical with new service-level evidence; API-01 unauthenticated private static documents remains Critical (new SEC-DATA-02 adds artifact distribution exposure); BUS-02 financial over-allocation/over-refund remains Critical after rechecking aggregate reads, append-only inserts, row constraints and absent shared serialization. SEC-BUS-04 adds a distinct check-versus-period-close race and a month-lock design; it does not prohibit normal late settlement of an old obligation. These baseline risks are confirmed mechanisms, not claims of production exploitation.

During review, an ambiguous closed-month allocation claim was dropped, the duplicate guardian-property finding was assigned to API alone, and citation ranges were corrected. Pool cleanup was qualified: Redis destructors may close connections on GC, so missing explicit close is reported as churn/nondeterministic cleanup rather than a guaranteed permanent socket leak. Unverified advisory flags were not promoted to exploitable vulnerabilities.

Read-only dependency metadata: 123 successful PyPI per-version lookups out of 134 installed distributions; 11 non-PyPI/Conda lookups failed. Full results are in dependency-advisory-snapshot.json. pip-audit was absent and no package was installed; OSV batch lookup failed. This is partial point-in-time evidence, not an authoritative native/lockfile/container audit or proof of vulnerability absence. No real credentials or private uploads were examined.

Checksum verification matched 455 inventoried repository files outside the two allowed audit directories, including all old audit documents, with no additions/removals in that inventory. Only the two plans, six reports and advisory JSON evidence are retained. No source changes, mutations, deployments, commits or state-changing service requests occurred. No integration tests, DB race tests, packet interception, malicious queue payload, production load test or EXPLAIN benchmark ran.
