# Backend Deployment Runbook

Topology: Caddy, API, arq worker, PostgreSQL and Redis run with Docker Compose on a VPS. Images come from `ghcr.io/compilelord/inkon_crm-api:<sha>`. Frontend rollback is documented in [FRONTEND_ROLLBACK.md](FRONTEND_ROLLBACK.md).

## 1. First-time setup

1. Point DNS for `api-crm.kitobedu.com` (and `api-staging-crm.kitobedu.com` for staging) at the VPS.
2. As root on the VPS, copy the repository's `deploy/` directory and run `DEPLOY_PUBLIC_KEY="<ssh public key>" ./provision_vps.sh`. It is idempotent.
3. As the `deploy` user create `/etc/imkon/backend.env` from `deploy/backend.env.example` (mode 600) with real secrets. Generate secrets with `openssl rand -hex 32`. `BACKEND_CORS_ORIGINS` must stay `["https://crm.kitobedu.com"]`. The `DATABASE_URL` and `REDIS_URL` passwords must match `POSTGRES_PASSWORD` and `REDIS_PASSWORD`.
4. Create `/etc/imkon/deploy.env` from `deploy/deploy.env.example`. For a staging host set `API_DOMAIN=api-staging-crm.kitobedu.com`.
5. Create `/etc/imkon/backup.env` (mode 600) with `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` and the Backblaze B2 or Cloudflare R2 credentials, then run `restic init` once with that environment.
6. `docker login ghcr.io` as `deploy` with a read-only token (`read:packages`).
7. Enable the timers: `sudo systemctl enable --now imkon-backup.timer imkon-restore-check.timer`.
8. GitHub: create Environments `staging` and `production` (production with required reviewers). In each add secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` (output of `ssh-keyscan <host>`).

## 2. Deploy

- Staging deploys automatically after `CI` and `Build Image` succeed on `main`.
- Production deploys when a `v*` tag is pushed to a commit that passed CI on `main`, after reviewer approval. It can also be started with the `Deploy Backend` workflow (`workflow_dispatch`, environment and full SHA).
- On the VPS `deploy.sh <sha>` pulls the images, writes `/var/backups/imkon/pre-<sha>.dump`, runs `alembic upgrade head`, restarts `api` and `worker`, polls `/health` for 60 seconds and, on failure, restarts the previous release. Current and previous release SHAs are in `/var/lib/imkon/current_release` and `/var/lib/imkon/previous_release`.
- Production runs `deploy.sh --register-webhook` afterwards to register the Telegram webhook.

## 3. Roll back

- Backend: run the `Rollback Backend` workflow with the environment and the full SHA from `previous_release`. It runs `deploy.sh --skip-migrations <sha>`. This only works because migrations follow expand/contract (AGENTS.md section 3.3). If a migration was destructive, restore the pre-deploy dump instead (section 4).
- Frontend: see [FRONTEND_ROLLBACK.md](FRONTEND_ROLLBACK.md).

## 4. Restore

1. Stop writers: `cd /opt/imkon/deploy && IMAGE_TAG=$(cat /var/lib/imkon/current_release) docker compose -f docker-compose.prod.yml stop api worker`.
2. Pick a dump from `/var/backups/imkon` or fetch one with `restic restore latest --tag db --target /tmp/restore` (source `/etc/imkon/backup.env`).
3. `docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < <dump>`.
4. Restore documents if needed: `restic restore latest --tag storage --target /`, then `chown -R 10001:10001 /var/lib/imkon/storage`.
5. Start `api worker` again and check `/health`.

The monthly `imkon-restore-check.service` (`deploy/restore_check.sh`) restores the latest off-site dump into a throwaway Postgres container and runs `alembic current` plus a row count. Run it manually after any backup change: `sudo systemctl start imkon-restore-check.service`.

## 5. Rotate secrets

Edit `/etc/imkon/backend.env`, then `deploy.sh --skip-migrations $(cat /var/lib/imkon/current_release)` to recreate containers. Changing `JWT_*` logs everyone out. Changing the database or Redis password requires changing it in the running service too (`ALTER USER`, `CONFIG SET requirepass`) or recreating the data directory.

## 6. Renew the Telegram webhook

Run `/opt/imkon/deploy/deploy.sh --register-webhook` on the production host. Change `TELEGRAM_BOT_SECRET_TOKEN` in `backend.env` first if rotating it.

## 7. Known gaps

- Staging on the same VPS (CD-06) is not automated; use a separate host or a second `COMPOSE_PROJECT_NAME`, `IMKON_DATA_DIR` and `API_DOMAIN` in `deploy.env`, with a different `ports` mapping for Caddy.
- `deploy.sh` backs up and restores nothing outside the database; storage is covered by the nightly restic job only.

## Database connection budget and shutdown

The supported Compose topology runs one single-process API and one ARQ worker. Both services declare one replica. CI invokes the same budget-validated deployment script. Scaling either service or adding Uvicorn workers requires a new validated topology; do not override these process counts with `--scale` or `--workers`.

PostgreSQL is configured with `max_connections=100`. `DB_CONNECTION_BUDGET` may be smaller, never larger. Each process has a main pool ceiling of `DB_POOL_SIZE + DB_MAX_OVERFLOW` (default 8 + 2), plus one storage-intent connection. Worker cleanup shares that storage-intent engine, so it adds no second pool. The worker also owns its outbox pool (default 2 + 0). One revision therefore has a configured ceiling of `2 × (10 + 1) + 2 = 24`. Two overlapping revisions reserve 48, maintenance reserves 2, and administration reserves 10: total 60 of 100. These are configured upper bounds, not measured open connections. The remaining 40 are unallocated headroom; they do not authorize additional application processes. Maintenance commands must be serialized within their two-connection reserve; deployments already use the deployment lock. Backups and restore checks must not overlap other maintenance beyond this reserve.

`deploy.sh` runs `python -m app.db.connection_policy` inside the release image, without database dependencies, before starting data services or running backups/migrations. Invalid budgets and deadlines fail before application resources open. This validates declared configuration, not live server limits or production demand. Direct API/worker startup validates the same settings before engine construction.

Request and worker main/outbox connections use 15-second statement, 2-second lock, 15-second idle-in-transaction and 5-second pool checkout deadlines. Storage-intent connections retain their existing 5-second statement and 1-second lock deadlines, with the configured 15-second idle transaction deadline. Alembic retains NullPool and separate 300-second statement, 10-second lock and 300-second idle transaction deadlines. A timeout requires rollback before reuse; session context cleanup releases failed transactions. Do not enlarge pools to mask slow transaction holds. Adjust deadlines only after disposable workload checks, including notification delivery, outbox processing and storage cleanup.

API and worker shutdown close the bot session, producer ARQ pool, normal Redis client, main engine and storage-intent engine. Worker startup failure unwinds any started outbox/cleanup worker. Cleanup attempts all remaining resources after a close failure and finishes under cancellation before propagating the cancellation or cleanup error. This does not change webhook registration or notification retry policy.

A failed ARQ producer close retains the owned handle and blocks producer use until `close_arq_pool()` succeeds on retry. Cancelled initialization retains any created pool whose cleanup fails; cancellation remains the primary error, with the cleanup failure chained. Cleanup of other process resources still runs. Close failures must be treated as shutdown failures, not successful disposal.
