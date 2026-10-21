# WP-68 — Fail closed on unsafe production configuration

Phase **3** · Priority **High** · Effort **M** · Status **todo** · Source: production-readiness audit 2026-10-21 (deploy #4/#5/#6, security #3)

## Goal

1. Startup rejects `TESTING=true` with `ENVIRONMENT=production`.
2. The development CORS origin regex (localhost, LAN, `*.instatunnel.my`) applies only outside production.
3. Outbox payload encryption uses its own versioned key (`OUTBOX_ENCRYPTION_KEYS`, newest first) with old-key decryption during rotation; existing payloads encrypted with `JWT_SECRET_KEY` stay readable until drained (expand/contract).
4. `/auth/resend-code` returns the same status and body for unknown, established and onboarding accounts.
5. Set an explicit ARQ `health_check_interval` (about 30 s) so the worker healthcheck added by WP-67 (`arq --check`) detects a hung worker within a minute, not an hour.

## Exact files

`backend/app/core/config.py`, `backend/app/main.py`, `backend/app/workers/settings.py`, `backend/app/workers/outbox.py` (key lookup only), `backend/app/services/outbox_service.py`, `backend/app/services/auth_service.py`, `backend/.env.example`, `docs/deploy/RUNBOOK.md` (rotation steps), new `backend/app/tests/integration/test_remediation_wp68.py`, `CONTRACT.md` if the resend response changes.

## Dependencies

After WP-66 (shared `outbox.py`, `workers/settings.py`). WP-67 and SMS-1 are merged.

## How to verify

Python 3.12 venv against fresh disposable PostgreSQL/Redis pods with this WP's own prefix (never imkon_db/imkon_redis): targeted tests red before / green after, full `python -m pytest app/tests -q` with exact counts, `python scripts/generate_contract.py` if a schema changed, `python -m alembic heads` (one head). Raw logs under `~/.local/state/imkon-remediation/<wp>/`.

## Acceptance criteria

- Every listed finding is fixed or rejected with evidence; each fix has a regression test that fails without it.
- AGENTS.md rules hold (no comments, typed locals, layering, files < 20 KB, expand-only migrations).
- A failing gate is recorded as blocked, not done.
