# WP-66 — Charge delivery attempts only on transport and bound SMTP time

Phase **3** · Priority **High** · Effort **M** · Status **in_progress** · Source: production-readiness audit 2026-10-21 (reliability #3/#4/#5/#6/#7, performance #10)

## Goal

Outbox events in a slow batch no longer lose attempts without a send; SMTP has an overall deadline below the lease and settlement checks ownership; course archival uses the business timezone; queue-table downgrades refuse while work is outstanding; migrations run with bounded lock and statement timeouts.

## Exact files

- `backend/app/workers/outbox.py`, `backend/app/repositories/sqlalchemy/outbox_repository.py`, `backend/app/services/email_service.py`
- `backend/app/workers/tasks.py`, `backend/app/workers/settings.py`
- `backend/alembic/env.py`; `downgrade()` only of `fin1a_debt_reminder_notifications.py`, `be3_exam_result_notifications.py`
- new `backend/app/tests/integration/test_remediation_wp66.py`

## Dependencies

WP-18, WP-30 (done). Branch `kitob/prod-2-delivery`.

## How to verify

Python 3.12 venv against fresh disposable PostgreSQL/Redis pods with this WP's own prefix (never imkon_db/imkon_redis): targeted tests red before / green after, full `python -m pytest app/tests -q` with exact counts, `python scripts/generate_contract.py` if a schema changed, `python -m alembic heads` (one head). Raw logs under `~/.local/state/imkon-remediation/<wp>/`.

## Acceptance criteria

- Every listed finding is fixed or rejected with evidence; each fix has a regression test that fails without it.
- AGENTS.md rules hold (no comments, typed locals, layering, files < 20 KB, expand-only migrations).
- A failing gate is recorded as blocked, not done.
