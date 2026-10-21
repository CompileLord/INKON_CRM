# WP-67 — Roll back every failed deploy and gate production tags on CI

Phase **3** · Priority **High** · Effort **M** · Status **in_progress** · Source: production-readiness audit 2026-10-21 (deploy #1/#2/#3/#7/#8, runbook note for #5)

## Goal

Any failure from container start through health checks triggers rollback; tag builds and production deploys require the exact SHA to have passed CI on `main`; backups can read uploads with least privilege; the worker must be ready before a release is recorded; the restore runbook works in a fresh shell.

## Exact files

`deploy/deploy.sh`, `deploy/common.sh`, `deploy/docker-compose.prod.yml`, `deploy/backup.sh`, `deploy/systemd/imkon-backup.service`, new `deploy/tests/`, `.github/workflows/build-image.yml`, `.github/workflows/deploy-backend.yml`, `docs/deploy/RUNBOOK.md`, minimal `backend/app/services/storage_service.py` / `backend/Dockerfile` if file mode or group changes.

## Dependencies

Must merge before WP-48 (shared `Dockerfile`, `deploy-backend.yml`). Branch `kitob/prod-3-deploy`.

## How to verify

Python 3.12 venv against fresh disposable PostgreSQL/Redis pods with this WP's own prefix (never imkon_db/imkon_redis): targeted tests red before / green after, full `python -m pytest app/tests -q` with exact counts, `python scripts/generate_contract.py` if a schema changed, `python -m alembic heads` (one head). Raw logs under `~/.local/state/imkon-remediation/<wp>/`.

## Acceptance criteria

- Every listed finding is fixed or rejected with evidence; each fix has a regression test that fails without it.
- AGENTS.md rules hold (no comments, typed locals, layering, files < 20 KB, expand-only migrations).
- A failing gate is recorded as blocked, not done.
