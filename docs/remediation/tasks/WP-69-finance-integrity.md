# WP-69 — Idempotent payments, ordered copy locks, cached debtor pages

Phase **3** · Priority **High** · Effort **L** · Status **todo** · Source: production-readiness audit 2026-10-21 (reliability #1, performance #1/#6/#8/#12)

## Goal

1. `POST` payment accepts an `Idempotency-Key`; a unique constraint scoped to the recorder makes a retried request return the original payment instead of inserting and allocating twice. Expand-only migration.
2. Course copy acquires every affected student lock in sorted order before invalidating the shared cache generation, removing the copy/payment lock inversion.
3. Debtor table count and page are cached about 600 s under the finance generation; queuing a reminder invalidates them.
4. Outstanding-credit and aging analytics are aggregated in SQL (`SUM(GREATEST(...))`, conditional buckets), not in Python.
5. Measure `(role, is_deleted, id)` on users and `(course_id, period_start)` on journals with EXPLAIN on representative data; add only indexes the plans justify.

## Exact files

Decided at start against the post-WP-53 finance layout (`finance_service` façade plus reporting collaborator), `backend/app/services/course_service.py` (copy locking), `backend/app/api/v1/finance.py`, `backend/app/schemas/payment.py`, one new migration, new `backend/app/tests/integration/test_remediation_wp69.py`, `CONTRACT.md`, `frontend/src/lib/finance/types.ts`. The frontend must send the key: hand this to a frontend executor in the same release.

## Dependencies

After WP-46 (course copy), WP-56 → WP-54 → WP-53 (finance split and batching); before WP-62.

## How to verify

Python 3.12 venv against fresh disposable PostgreSQL/Redis pods with this WP's own prefix (never imkon_db/imkon_redis): targeted tests red before / green after, full `python -m pytest app/tests -q` with exact counts, `python scripts/generate_contract.py` if a schema changed, `python -m alembic heads` (one head). Raw logs under `~/.local/state/imkon-remediation/<wp>/`.

## Acceptance criteria

- Every listed finding is fixed or rejected with evidence; each fix has a regression test that fails without it.
- AGENTS.md rules hold (no comments, typed locals, layering, files < 20 KB, expand-only migrations).
- A failing gate is recorded as blocked, not done.
