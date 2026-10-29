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
- On the VPS `deploy.sh <sha>` pulls the images, writes `/var/backups/imkon/pre-<sha>.dump`, runs `alembic upgrade head`, restarts `api` and `worker`, waits for API and worker container health, polls `/health` for 60 seconds and, on any startup or health failure, restarts the previous release. Current and previous release SHAs are in `/var/lib/imkon/current_release` and `/var/lib/imkon/previous_release`.
- Production runs `deploy.sh --register-webhook` afterwards to register the Telegram webhook.

Before `alembic upgrade head`, deployment runs `python -m scripts.repair_alembic_version` using only `DATABASE_URL`. In one locked transaction it removes the redundant `d4e5f6a7b8c9` row only when the version table contains exactly that revision and `d025a01b34e5`, and the RWP20 `outbox_event_kind.credentials_email` enum value exists. Missing RWP20 schema refuses deployment; all other version states are reported unchanged.

Deploy this release with `ALLOW_EMAILLESS_USERS=false` (the default in every environment) so new users retain an email and the previous image can serialize them during rollback. Only after the release is stable, set `ALLOW_EMAILLESS_USERS=true` in `/etc/imkon/backend.env` and run `deploy.sh --skip-migrations <current>` to activate phone-only students. Once NULL emails exist, the previous image cannot be used for rollback; disabling the flag does not repair existing NULL emails. Demo seeds require this flag explicitly enabled in disposable local development.

## 3. Roll back

- Backend: run the `Rollback Backend` workflow with the environment and the full SHA from `previous_release`. It runs `deploy.sh --skip-migrations <sha>`. This only works because migrations follow expand/contract (AGENTS.md section 3). If a migration was destructive, restore the pre-deploy dump instead (section 4).
- Frontend: see [FRONTEND_ROLLBACK.md](FRONTEND_ROLLBACK.md).

## 4. Restore

1. Stop writers: `cd /opt/imkon/deploy && export IMAGE_TAG=$(cat /var/lib/imkon/current_release) && docker compose -f docker-compose.prod.yml stop api worker`.
2. Pick a dump from `/var/backups/imkon` or fetch one with `restic restore latest --tag db --target /tmp/restore` (source `/etc/imkon/backup.env`).
3. `docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < <dump>`.
4. Restore documents if needed: `restic restore latest --tag storage --target /tmp/storage-restore`, then as root run `tar -xpf /tmp/storage-restore/storage.tar -C /var/lib/imkon/storage` and `chown -R 10001:10001 /var/lib/imkon/storage`. Older storage snapshots contain the original `/var/lib/imkon/storage` tree rather than `storage.tar`; restore those to `/` as before.
5. Start `api worker` again and check `/health`.

Nightly storage backups run `tar` in a one-off API container as UID/GID `10001:10001`, streaming `storage.tar` to restic under the `storage` tag. This reads app-owned 0600 uploads without granting the host `deploy` user filesystem access or widening upload permissions. The backup fails if either the archive command or restic fails.

The monthly `imkon-restore-check.service` (`deploy/restore_check.sh`) restores the latest off-site dump into a throwaway Postgres container and runs `alembic current` plus a row count. Run it manually after any backup change: `sudo systemctl start imkon-restore-check.service`.

## 5. Rotate secrets

Edit `/etc/imkon/backend.env`, then `deploy.sh --skip-migrations $(cat /var/lib/imkon/current_release)` to recreate containers. Changing `JWT_*` logs everyone out. Outbox encryption uses `OUTBOX_ENCRYPTION_KEYS`, a comma-separated list of unique version names and 32-byte hexadecimal keys, newest writer key first: `v2:<new_64_hex_characters>,v1:<previous_64_hex_characters>`. Generate each independent key with `openssl rand -hex 32`; never reuse JWT secrets. Production API and worker startup require a nonempty valid list and reject `TESTING=true`. Development and testing may leave the list empty to retain legacy encryption.

New payloads carry their encryption key version; readers select that exact version. Unversioned payloads still use the legacy `JWT_SECRET_KEY` derivation. Keep that JWT secret unchanged until all unversioned pending, leased and retryable payloads have drained. Afterwards JWT rotation does not affect versioned payloads.

For the initial rollout from an image that cannot read versioned payloads, pause writers and drain pending/retryable outbox work before upgrading API and worker together. Resume writers only after both run the version-aware image with the same key list. Once versioned payloads exist, rollback requires a version-aware image with the retained keys; rolling back to an older reader requires pausing writers and draining versioned work first.

To rotate outbox keys without losing queued work:

1. Generate a new key and a never-reused version identifier. Distribute it to every API and worker while leaving the current writer key first, for example `v1:<current_key>,v2:<new_key>`. Recreate all containers so every reader knows both versions before any writer switches.
2. Reorder the list to `v2:<new_key>,v1:<current_key>` and recreate all API and worker containers. New writes use v2; both versions remain readable during overlap. Keep the same full list for rollback images.
3. Keep v1 until no pending, leased or retryable payload references it and no running/rollback writer can still produce it. Retain keys separately for any backups that must be replayed. Only then remove v1 and recreate containers. Removing a key early makes its queued payloads unreadable; unknown versions fail closed.

Changing the database or Redis password requires changing it in the running service too (`ALTER USER`, `CONFIG SET requirepass`) or recreating the data directory.

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
