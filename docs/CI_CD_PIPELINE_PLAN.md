# CI/CD Pipeline Plan

Status of each task lives in [STATUS_CI_CD_PIPELINE.md](../STATUS_CI_CD_PIPELINE.md). This file is the stable specification; do not edit it to excuse a failed implementation.

## 1. Target topology

| Component | Where | Notes |
| --- | --- | --- |
| Frontend (Vite SPA) | Cloudflare Pages, project `imkon-crm`, `https://crm.kitobedu.com` | Static build; `VITE_API_BASE_URL` baked in at build time |
| Backend API (FastAPI) | VPS, Docker Compose, `https://api-crm.kitobedu.com` | One image, two processes: `api` and `worker` |
| Worker (arq) | VPS, same image | Runs queued tasks and the arq `cron_jobs` (`archive_expired_courses`, `check_payment_reminders`) |
| PostgreSQL 16 | VPS container, no public port | Data in `/var/lib/imkon/postgres` |
| Redis 7 | VPS container, no public port | Data in `/var/lib/imkon/redis` |
| User documents and images | VPS bind mount `/var/lib/imkon/storage` → `/app/storage` | `LocalStorageService` (`STORAGE_PATH`), owned by UID 10001 (`appuser`) |
| Reverse proxy / TLS | Caddy on the VPS | Only public entry point (80/443) |
| Images | GHCR `ghcr.io/compilelord/inkon_crm-api:<sha>` | Immutable SHA tags for rollback |

Frontend and API share the parent domain `shadowme.pro`, so they are same-site: auth cookies do not need `SameSite=None`.

```
PR   ──► ci.yml (parallel gates) ──► CF Pages preview (→ staging API)
main ──► ci.yml ──► build-image.yml (ghcr:<sha>) ──► deploy-backend (staging, auto) ──► deploy-frontend (staging alias)
tag v* / dispatch ──► production approval ──► backup → migrate → swap → /health → CF Pages production
```

## 2. Current state (read on 2026-10-16)

- `.github/workflows/deploy-backend.yml` targets **Google Cloud Run** (Artifact Registry, self-hosted migration runner, GCS bucket, `BACKEND_CORS_ORIGINS=["*"]`). It must be replaced, not extended.
- `.github/workflows/deploy-frontend.yml` already deploys to Cloudflare Pages via `wrangler-action@v4` on push to `main`; it runs `tsc` and `vitest` but not `eslint`, and it has no PR previews and no gating on backend deploy.
- Neither workflow runs on pull requests, so nothing blocks a broken merge.
- Backend tests need `TEST_DATABASE_URL` / `TEST_REDIS_URL` pointing to `localhost` (Redis on port 6379); `conftest.py` refuses other hosts. The existing test job also installs `redis-server` and `openssl` for TLS tests — keep that.
- `/health` exists in `backend/app/main.py` and checks DB and Redis.
- `get_storage_service()` in `backend/app/core/deps.py` always returns `LocalStorageService`; `GoogleCloudStorageService`, `GCS_BUCKET_NAME`, `google-cloud-storage` and `backend/scripts/gcp_deploy.sh` are leftovers.
- `/storage/avatar` and `/storage/course` are publicly mounted; other documents go through authorized endpoints. Caddy must not expose `/app/storage` directly.
- `frontend/public/_redirects` exists (SPA fallback). No `_headers` file.
- `backend/scripts/setup_free_tier_vm.sh` provisions Postgres + Redis (with TLS/ACL) on a VM; reuse its hardening ideas for the VPS.
- No Python linter is configured (no ruff/mypy). No Dependabot.
- `CRON_SECRET` protects `/api/v1/cron`; with the arq worker running cron jobs, the HTTP cron route is only needed if an external scheduler is kept.

## 3. Phases and tasks

Each task ID is used in the status file. Tasks run in dependency order.

### Phase 1 — CI quality gates

**CI-01 · Create `ci.yml` for PRs and `main`.**
Triggers `pull_request` and `push` to `main`, `concurrency` cancelling superseded PR runs, `dorny/paths-filter` to skip backend jobs for frontend-only changes and vice versa. Jobs:

| Job | Steps |
| --- | --- |
| `backend-test` | Postgres 16 + Redis 7 services, `redis-server`/`openssl` apt packages, env copied from the current test job, `alembic upgrade head`, `python -m pytest app/tests -q` |
| `migrations-check` | Fresh DB: `alembic upgrade head`, `alembic check`, `alembic downgrade -1 && alembic upgrade head` |
| `contract-check` | `python backend/scripts/generate_contract.py` then `git diff --exit-code CONTRACT.md` |
| `frontend` | `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` |
| `docker-build` | Build `backend/Dockerfile` without push |

Acceptance: a PR with a deliberately failing test, a type error and an un-regenerated contract each turn the run red; a clean PR is green; total wall time under 10 minutes.

**CI-02 · Python lint baseline.** Add `ruff` to dev dependencies with a config in `backend/pyproject.toml`, fix or explicitly scope the initial violations, add `ruff check` and `ruff format --check` to `ci.yml`. `mypy` optional and non-blocking at first.

**CI-03 · Security scans.** `npm audit --audit-level=high` (frontend), `pip-audit -r backend/requirements.txt`, `gitleaks` on the diff, Trivy scan of the built image failing on HIGH/CRITICAL with fixes available.

**CI-04 · Dependabot.** `.github/dependabot.yml` for `pip` (`/backend`), `npm` (`/frontend`), `docker` (`/backend`), `github-actions` (`/`), weekly, grouped minor/patch updates.

**CI-05 · Branch protection.** On GitHub: require all `ci.yml` jobs, block force-push and deletion of `main`. Manual repository setting — record who applied it.

### Phase 2 — Backend artifact

**CD-01 · `build-image.yml`.** On push to `main` and on `v*` tags after `ci.yml` succeeds (`workflow_run` or a reusable workflow call): buildx, `cache-from/to: type=gha`, push `ghcr.io/compilelord/inkon_crm-api:<sha>` plus `:main` or `:vX.Y.Z`. Permissions limited to `packages: write`, `contents: read`.

**CD-02 · Remove Cloud Run leftovers.** Delete the Cloud Run workflow, `GoogleCloudStorageService`, `GCS_BUCKET_NAME`, `google-cloud-storage` dependency and `scripts/gcp_deploy.sh`, with tests still green. Separate commit from feature work.

### Phase 3 — VPS production environment

**VPS-01 · Host provisioning script `deploy/provision_vps.sh`.** Docker Engine + Compose plugin, `deploy` user (SSH key only), `PasswordAuthentication no`, `ufw` allowing 22/80/443, fail2ban, unattended-upgrades, Docker log rotation (`json-file`, `max-size`), directories `/var/lib/imkon/{postgres,redis,storage,caddy}` and `/etc/imkon` (mode 700). Idempotent.

**VPS-02 · `deploy/docker-compose.prod.yml` + `deploy/Caddyfile`.** Services `caddy`, `api`, `worker`, `db`, `redis`; `image: ghcr.io/compilelord/inkon_crm-api:${IMAGE_TAG}`; `env_file: /etc/imkon/backend.env`; healthchecks (`/health` for api, `pg_isready`, `redis-cli ping`); `restart: unless-stopped`; internal network only for db/redis. Caddy proxies `api-crm.kitobedu.com` → `api:8080`, sets security headers and an upload body limit matching the backend's limit.

**VPS-03 · Production configuration.** Template `deploy/backend.env.example` (no real values). Production values: `ENVIRONMENT=production`, `BACKEND_CORS_ORIGINS=["https://crm.kitobedu.com"]` (never `*`), `TELEGRAM_WEBHOOK_URL=https://api-crm.kitobedu.com/api/v1/telegram/webhook`, strong JWT secrets, Redis password/ACL. Secrets live only on the VPS in `/etc/imkon/backend.env` (mode 600).

**VPS-04 · Storage verification.** Upload an avatar, a course image and a private document in staging; confirm they persist across `docker compose up -d --force-recreate`, public mounts serve only avatar/course media, and private documents require auth.

### Phase 4 — Backend deployment workflow

**CD-03 · `deploy/deploy.sh <sha>` on the VPS.** Steps, failing fast:
1. `docker compose pull` for the tag.
2. `pg_dump -Fc` to `/var/backups/imkon/pre-<sha>.dump`.
3. `docker compose run --rm api alembic upgrade head`.
4. `IMAGE_TAG=<sha> docker compose up -d api worker`.
5. Poll `https://api-crm.kitobedu.com/health` for 60 s; on failure restore the previous `IMAGE_TAG` and exit non-zero.
6. Write `<sha>` to `/var/lib/imkon/current_release`, previous to `previous_release`.

**CD-04 · `deploy-backend.yml` (replaces the Cloud Run file).** GitHub Environments `staging` (auto on `main`) and `production` (required reviewer, triggered by `v*` tag or `workflow_dispatch`). SSH with `VPS_HOST`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`; runs `deploy.sh`. `concurrency: deploy-${{ environment }}` without cancellation. After a production deploy, run `scripts/register_telegram_webhook.py` inside the container.

**CD-05 · `rollback.yml`.** `workflow_dispatch` with `environment` and `sha` inputs; redeploys that image tag with `deploy.sh --skip-migrations`. Requires all migrations to be backward-compatible (expand/contract); document that rule in `AGENTS.md` §3.

**CD-06 · Staging environment.** Second Compose project `-p imkon-staging` on the same VPS with its own DB, Redis DB, storage directory and subdomain `api-staging-crm.kitobedu.com`. Drop if the VPS lacks RAM; record the decision.

### Phase 5 — Frontend on Cloudflare Pages

**FE-01 · Rework `deploy-frontend.yml`.** Build once in `ci.yml` (`frontend` job) and deploy the artifact. PRs: deploy a preview branch built against the staging API and comment the URL on the PR. `main`: staging alias. Production: only after `deploy-backend` production succeeds (`needs` / `workflow_run`), built with `VITE_API_BASE_URL=https://api-crm.kitobedu.com/api/v1`. Remove the hardcoded fallback URL in favor of per-environment variables.

**FE-02 · `frontend/public/_headers`.** CSP (`connect-src` limited to the API origin), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`, `no-cache` for `index.html`.

**FE-03 · Frontend rollback procedure.** Document re-promoting a previous deployment (dashboard or `wrangler pages deployment`) in the runbook.

### Phase 6 — Data safety and operations

**OPS-01 · Backups.** VPS cron/systemd timer: nightly `pg_dump -Fc`, nightly `restic` backup of dumps and `/var/lib/imkon/storage` to an off-site target (Backblaze B2 or Cloudflare R2). Retention 7 daily / 4 weekly / 6 monthly. Pre-deploy dumps pruned after 14 days.

**OPS-02 · Restore drill.** `deploy/restore_check.sh`: restore the latest off-site dump into a throwaway Postgres container, run `alembic current` and a row-count smoke query; run monthly and after backup changes.

**OPS-03 · Monitoring.** External uptime check on `/health` and on the Pages URL, disk usage alert (storage grows), optional Sentry for API and frontend. Post-deploy `frontend/scripts/smoke-test.mjs` against staging and production.

**OPS-04 · Runbook.** `docs/deploy/RUNBOOK.md`: first-time setup, deploy, rollback (backend and frontend), restore, rotate secrets, renew Telegram webhook.

## 4. Secrets inventory

| Secret | Location | Used by |
| --- | --- | --- |
| `VPS_HOST`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` | GitHub Environment (staging/production) | `deploy-backend.yml`, `rollback.yml` |
| GHCR pull token | VPS `docker login` (read-only PAT or deploy token) | `docker compose pull` |
| `CLOUDFLARE_API_TOKEN` (Pages:Edit only), `CLOUDFLARE_ACCOUNT_ID` | GitHub repository secrets | `deploy-frontend.yml` |
| `VITE_API_BASE_URL` | GitHub Environment variable | frontend build |
| App secrets (JWT, SMTP, Telegram, DB, Redis) | `/etc/imkon/backend.env` on the VPS only | `api`, `worker` |
| Backup repository credentials | `/etc/imkon/backup.env` on the VPS only | `restic` |

CI uses only test-only placeholder values; production secrets never enter workflow files.

## 5. Rules for agents

- Follow `AGENTS.md`; commit per task with Conventional Commits (scope `ci`, `deploy` or `ops`).
- Update the task's row in `STATUS_CI_CD_PIPELINE.md` when it starts, finishes or blocks. Do not mark `finished` until its acceptance check was actually run; put the evidence (run URL, command output summary) in the Notes column.
- Tasks needing the VPS, GitHub settings or Cloudflare dashboard require the user's credentials; mark them `blocked` with the reason instead of guessing.
- Never run deploy, migration or restore commands against production without explicit user approval.
