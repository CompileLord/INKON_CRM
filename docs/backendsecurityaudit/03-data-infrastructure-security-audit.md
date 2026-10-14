# Data and infrastructure security audit

## 1. Scope

All 79 owned files (58 original Python files, seven migrations and 14 infrastructure/template files; 6,658 lines) received security and performance passes. Exact inventory:

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

Read-only context: AGENTS.md, CONTRACT.md, both new audit plans, the old quality plan and all three old reports; dependency/service/router code only to trace these owned files. Applied the full security-and-hardening, performance-optimization and code-review-and-quality skills and both bundled references. The shared ../../references checklists are absent. Threat model: protect student/parent PII, private uploads, authentication state, financial history and deployment credentials across HTTP→DB/Redis, Redis→worker, local upload→build artifact and CI→cloud boundaries. STRIDE abuse cases include spoofed reset state, poisoned jobs, artifact disclosure and retained personal data.

Executed: Conda base with PYTHONDONTWRITEBYTECODE=1 parsed all 65 owned Python files and performed two read-only per-file passes. Inspected installed ARQ deserialization code without importing the app or executing a malicious payload. The orchestrator's read-only [dependency snapshot](dependency-advisory-snapshot.json) records PyPI per-version metadata for 123 of 134 installed distributions; 11 failed lookups, pip-audit unavailable and OSV batch access failed. This is a current installed-environment snapshot, not a native audit or the dependency graph shipped in Docker. No Python lockfile exists. No services, databases, app imports, deployments, integration tests or source mutations were executed. All corrected code below is proposed.

Novelty disposition: prior DATA-01/02/03/04/05/06/09 and BUS-01/02 remain context, not relabeled findings. The refresh hash is still nonunique and consumption still read-then-write; BUS-01 requires unique issuance plus persistence identity and atomic rotation. Financial mappings still lack aggregate enforcement (BUS-02); the business report owns new financial exploit/remediation details. Private document exposure API-01 remains context; SEC-DATA-02 below is the separate build/registry disclosure path. There is no independently attributed JWT/router defect in this report.

## 2. Summary

Verdict: **Request changes before using the VM bootstrap or building from an upload-bearing working directory. Security: 4/10.** Two newly reviewed infrastructure paths cross trust boundaries without adequate isolation: the VM publishes unauthenticated Redis and the image copies private storage. The score reflects conditional but severe compromise paths, not evidence that current production ingress, registry permissions or uploaded contents have been inspected. Database statements are parameterized and useful finance constraints exist, while credential handling, release provenance and personal-data disposal require explicit operational policies.

## 3. Findings

### SEC-DATA-01 — VM Redis publication allows authentication-state tampering and worker payload injection

**Impact:** High. **Category:** OWASP API8:2023 Security Misconfiguration; CWE-306, CWE-502. **Review disposition:** Critical:. **Location:** `backend/scripts/setup_free_tier_vm.sh:44–53,69`; owned connection context `backend/app/core/redis.py:17–26`.

**Problem/exploit:** The script publishes Redis with `-p "${REDIS_PORT}:6379"` on every interface, supplies neither ACL credentials nor TLS, and advertises a public-IP Redis URL. A client that can reach that port can read or replace verification/reset records, remove rate-limit state and manipulate job keys without CRM authentication. If an ARQ worker uses this Redis, a Redis writer can insert a serialized queued payload: installed ARQ's `deserialize_job_raw` defaults to `pickle.loads` before checking its job fields, so payload deserialization can execute code with worker credentials. The application's WorkerSettings has no safer serializer override. PostgreSQL is also bound to every interface, but its generated password means it is not equivalent to unauthenticated Redis.

**Evidence:** Docker Redis is run with only name/restart/port/volume/image flags. In installed ARQ, `arq/jobs.py:292–302` sets `deserializer = pickle.loads`; `arq/worker.py:519–520` calls it for the fetched job. These are observed source facts. Exploitation needs permitted network ingress, and the code-execution branch needs a connected running worker; cloud/host firewall policy was not inspected and no remote test or exploit ran. The orchestrator additionally queried the existing onboarding container from redis:7-alpine using read-only `redis-cli CONFIG GET protected-mode bind`: protected-mode was `no` and bind was `* -::*`; the image command was `["redis-server"]`. This corroborates the local image baseline accepting connections on all interfaces without protected-mode denial. Local compose still publishes only loopback. No VM/cloud firewall policy or future deployed image configuration was verified, so this observation does not prove Internet reachability.

**Corrected-code proposal:** The following shell excerpt replaces the port/image portion of the existing container command. Publish a private interface or loopback, restrict cloud/host firewall sources and introduce Redis ACL/TLS settings consistently for producer and worker. Use a data-only serializer as defense in depth, matching producer/consumer with versioned payloads; this does not authorize an untrusted Redis writer.

```bash
-p "127.0.0.1:${REDIS_PORT}:6379" \
-v /etc/imkon/redis.conf:/usr/local/etc/redis/redis.conf:ro \
redis:7-alpine redis-server /usr/local/etc/redis/redis.conf
```

```python
redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
```

For a separate Cloud Run client, bind an explicitly private VM IP, allow only its VPC sources, and use a `rediss://` ACL-backed DSN; loopback alone would break remote clients. Proposed verification: from an unauthorized network confirm connection denial; from an authorized network confirm unauthenticated command denial; test producer/worker serializer compatibility using harmless fixtures.

### SEC-DATA-02 — Local uploads enter container images and remote build artifacts

**Impact:** High, conditional on operational uploads in the local build context and broader artifact access. **Category:** OWASP API8:2023; CWE-200. **Review disposition:** Critical:. **Location:** `backend/Dockerfile:29–35`; `backend/.dockerignore:1–15`; `backend/scripts/gcp_deploy.sh:39–40`.

**Problem/exploit:** `COPY --chown=appuser:appgroup storage/ ./storage/` embeds every existing upload in the runtime image. Docker ignores .gitignore exclusions; .dockerignore excludes environment files but does not exclude storage. The local deployer submits the current backend directory to Cloud Build. A registry reader, build operator or exported-cache reader can recover private student/mentor documents from layers without the application's ownership check. Deleting a live document does not remove a previously published immutable layer. This is a distinct disclosure channel from prior API-01's HTTP StaticFiles access.

**Evidence:** Explicit storage COPY and missing storage exclusion. No operational upload contents or registry permissions were inspected. A clean CI checkout normally does not contain ignored operational uploads; this finding specifically concerns local builds or upload-bearing contexts, not an assertion that CI already leaked data.

**Corrected-code proposal:** Remove the storage COPY and exclude storage from the context. Create empty runtime directories; use private persistent storage for uploaded objects. Inspect and retire affected historical images/build caches according to actual access and retention policies.

```dockerignore
storage/
scripts/.seed_cache/
```

```dockerfile
RUN mkdir -p /app/storage && chown -R appuser:appgroup /app/storage
```

Proposed verification: build with harmless sentinel uploads in a disposable context, assert the sent context and resulting image/layers contain no sentinel, and validate normal upload/download behavior with the chosen persistent backend.

### SEC-DATA-03 — Bootstrap and administrator provisioning expose secrets to logs and process arguments

**Impact:** Medium. **Category:** CWE-532, CWE-214; OWASP API8:2023. **Review disposition:** Required (no prefix). **Location:** `backend/scripts/setup_free_tier_vm.sh:34–40,65–68`; `backend/scripts/seed_admin.py:20–22,70–89`.

**Problem/exploit:** The VM script prints the generated PostgreSQL password and a full password-bearing DSN to stdout. Session recording, copied troubleshooting output or shared provisioning logs can then provide database access to someone who was meant to see only setup status. Its container launch also passes the password in argv. Noninteractive seed-admin explicitly requires `--password`, making the superadmin credential visible to process inspection permitted by the host and potentially shell history. This is separate from prior DATA-01's fixed demo password.

**Evidence:** The password echo/DSN interpolation and argparse option are explicit; no real secret values were read. Local process visibility depends on host permissions and isolation; no unauthenticated remote process reader is assumed.

**Corrected-code proposal:** Print variable names/status only. Read the admin password through a protected file descriptor/stdin; retain getpass for interactive use. Mount a restricted PostgreSQL password file through the image-supported POSTGRES_PASSWORD_FILE mechanism rather than passing its value on argv. Save credentials to the operator's secret store through its secure channel.

```python
parser.add_argument("--password-stdin", action="store_true")
password = sys.stdin.readline().rstrip("\n") if args.password_stdin else getpass("Password: ")
```

```bash
-e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
-v /etc/imkon/postgres_password:/run/secrets/postgres_password:ro
```

Preserve password validation and protect the input/file before provisioning. Proposed verification: a dummy credential must not occur in captured stdout, shell argv or status output.

### SEC-DATA-04 — Deactivation preserves identifiable user and notification data indefinitely

**Impact:** Medium. **Category:** CWE-359; personal-data retention. **Review disposition:** Required (no prefix). **Location:** `backend/app/repositories/sqlalchemy/base_repository.py:52–61`; `backend/app/models/user.py:22–38`; `backend/app/models/notification_log.py:24–39`; `backend/app/models/document.py:15–25`.

**Problem/exploit:** soft_delete only flips is_deleted/deleted_at. Names, email, birth date, student/parent phone, chat binding and photo paths persist, while documents and notification recipient fields have independent lifetimes. Context confirms DELETE user calls soft_delete and revokes tokens without anonymizing PII or scheduling erasure. There is no owned retention/purge mechanism. An authorized operator or later storage/database compromise retains access to identities of long-deactivated users. This is a distinct retained-data exposure, not a claim that soft deletion itself violates an identified jurisdiction or that financial history should be destroyed.

**Evidence:** Only two fields change on deletion; model fields remain. Ledger foreign keys deliberately RESTRICT physical user deletion, so blindly deleting users would conflict with audit/financial preservation. The repository-wide retention/purge search found no implemented cleanup path; external operator policies/backups are unknown.

**Corrected-code proposal:** Define separate deactivation and approved erasure workflows. Keep a surrogate financial identity and lawfully required financial/audit history, anonymize unnecessary profile fields after a configured retention period, delete eligible private objects/recipient identifiers and expire backup copies under a documented policy.

```python
user.email = f"erased-{user.id}@invalid.example"
user.first_name = "Erased"
user.last_name = str(user.id)
user.phone = user.parent_phone = None
user.date_of_birth = user.parent_telegram_chat_id = None
user.password_hash = None
```

This is only the profile portion: object deletion must follow commit-safe, retryable orchestration and legal retention exceptions. Proposed verification: seed harmless PII, deactivate/erase, enumerate profile/object/notification/audit stores and assert expected retained versus removed fields.

### SEC-DATA-05 — Mutable release inputs execute with build or deployment privileges

**Impact:** Medium. **Category:** OWASP API10:2023 Unsafe Consumption; CWE-494/CWE-829. **Review disposition:** Required (no prefix). **Location:** `backend/requirements.txt:1–18`; `backend/Dockerfile:1–15`; `.github/workflows/deploy-backend.yml:80–108,124–131`; `.github/workflows/deploy-frontend.yml:24–35,95–102`; `backend/scripts/setup_free_tier_vm.sh:15–18`.

**Problem/exploit:** Python releases resolve open lower-bound ranges without an authoritative transitive lock/hash set. CI tests one resolution, Docker resolves another and the migration job installs a third unpinned set after Google authentication, with the production DB URL available. Actions use mutable major tags; the VM downloads and immediately executes an unversioned installer with system-service privileges. A compromised dependency/action/upstream installer can run in a credential-bearing release or root provisioning boundary. No compromise was observed, and TLS verification remains enabled; this is a supply-chain trust path, not an advisory-based runtime exploit claim. Frontend npm ci does preserve its lockfile, and same-workflow artifact download is not an independent untrusted-PR artifact path.

**Corrected-code proposal:** Produce a reviewed Python 3.12 transitive lock with hashes and use it consistently for tests/image/migrations, pin reviewed action commit SHAs and image digests, install Docker via a verified package repository, and keep build/package execution separate from the minimally privileged deploy job. Prefer scoped workload identity over a long-lived key; select one auth mechanism instead of providing both mutually exclusive auth inputs.

```dockerfile
COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes --prefix=/install -r requirements.lock
```

```yaml
permissions:
  contents: read
```

Grant id-token write only in the isolated deploy job that needs WIF; cloud IAM must separately restrict deploy/migration identities. SHA/digest values must come from verified releases, not invented placeholders. Proposed verification: frozen install fails on altered artifacts, identical wheel graph ships/tests, and a build job has no production credentials.

**Dependency triage — FYI (not additional vulnerability IDs):** Snapshot python-jose 3.5.0 GHSA-3qf3-8w2g-rqmx needs asymmetric-key/HMAC confusion prerequisites; the traced application uses HS256 shared secrets and no asymmetric verification keys. ecdsa 0.19.2 signing-timing advisories lack a traced signing path under HS256. PyJWT advisories concern a different installed JWT implementation than the app's jose. AnyIO process-pool advisories lack a process-pool path. urllib3 2.7.0 advisories require specific proxy or streamed untrusted compressed/chunked response behavior; owned demo downloads use urllib.request, and GCS calls use a configured trusted storage service. No demonstrated exploitable application path for these snapshot flags was established. Recheck before the next release and by 2026-10-21; update affected packages when the resolved shipping graph/configuration establishes reachability. No clean-bill-of-health claim follows from this partial snapshot.

## 4. What is done well

- SQLAlchemy expressions parameterize external search/filter values; fixed reset SQL table lists are not an SQL-injection finding.
- Finance uses Numeric money, positive row constraints and retained reversal links; journal entities have real SQLAlchemy version columns. Migrations preserve these basic constraints.
- Production image runs as a dedicated nonroot user and omits environment files from Docker context. Compose binds PostgreSQL/Redis to loopback, unlike the separate VM script.
- Rate limiting fails closed on backend errors; application Redis is shared rather than process-local. Existing race findings remain prior context.
- Seed-admin uses getpass interactively and rejects duplicate email. Backfill defaults to rollback and checks overallocated charges; integration tests contain substantial finance/RBAC invariants. Tests were read, not run.
- Frontend CI uses npm ci and deploys the artifact built by its own prerequisite job. Backend deploy job declares narrow GitHub token permissions; cloud IAM policy is unavailable for assessment.

## 5. Prioritized fixes

| Priority | Action | Effort |
| --- | --- | --- |
| 1 | Isolate/authenticate Redis and align secure producer/worker connection settings; verify ingress (SEC-DATA-01). | M |
| 2 | Exclude uploads from build context/images; inspect affected artifact history/access (SEC-DATA-02). | S–M |
| 3 | Remove secret output/argv and use protected provisioning input (SEC-DATA-03). | S |
| 4 | Freeze verified dependency/artifact provenance and isolate credential-bearing release jobs (SEC-DATA-05). | M |
| 5 | Define deactivation/erasure/backup retention with financial exceptions (SEC-DATA-04). | L |

S = localized; M = several components plus targeted validation; L = policy and cross-store workflow. No fixes were implemented. Prior BUS-01, API-01, BUS-02 and DATA safety issues remain separately actionable; this report adds new infrastructure paths rather than copying them.
