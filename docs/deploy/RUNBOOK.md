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

## 3. Roll back

- Backend: run the `Rollback Backend` workflow with the environment and the full SHA from `previous_release`. It runs `deploy.sh --skip-migrations <sha>`. This only works because migrations follow expand/contract (AGENTS.md section 3.3). If a migration was destructive, restore the pre-deploy dump instead (section 4).
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

Edit `/etc/imkon/backend.env`, then `deploy.sh --skip-migrations $(cat /var/lib/imkon/current_release)` to recreate containers. Changing `JWT_*` logs everyone out. `JWT_SECRET_KEY` also encrypts pending outbox payloads: drain the outbox completely and stop writers before rotating it, or pending payloads become unreadable. A separate encryption key is planned for a later package. Changing the database or Redis password requires changing it in the running service too (`ALTER USER`, `CONFIG SET requirepass`) or recreating the data directory.

## 6. Renew the Telegram webhook

Run `/opt/imkon/deploy/deploy.sh --register-webhook` on the production host. Change `TELEGRAM_BOT_SECRET_TOKEN` in `backend.env` first if rotating it.

## 7. Known gaps

- Staging on the same VPS (CD-06) is not automated; use a separate host or a second `COMPOSE_PROJECT_NAME`, `IMKON_DATA_DIR` and `API_DOMAIN` in `deploy.env`, with a different `ports` mapping for Caddy.
- `deploy.sh` backs up and restores nothing outside the database; storage is covered by the nightly restic job only.
