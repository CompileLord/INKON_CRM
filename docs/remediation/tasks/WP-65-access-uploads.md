# WP-65 — Scope mentor documents, bound uploads, unblock the worker loop

Phase **3** · Priority **High** · Effort **M** · Status **in_progress** · Source: production-readiness audit 2026-10-21 (security #1, performance #2/#9, reliability #2, quality #1/#5/#6)

## Goal

Mentors see only documents of students in their courses; uploads are rejected at the limit without full buffering; exam-image rendering stops blocking the worker event loop; regression tests that never ran or never exercised the code are fixed.

## Exact files

- `backend/app/services/document_service.py` (visibility filter, bounded upload read)
- `backend/app/services/course_service.py` (upload read only)
- `backend/app/workers/exam_result_delivery.py`, `backend/app/services/exam_result_image.py`
- `backend/app/tests/regression/critical_reproductions.py` → `test_critical_reproductions.py`
- `backend/app/tests/integration/test_coverage_gaps.py`, `test_remediation_wp20.py`, `test_document_delivery.py`, new `test_remediation_wp65.py`

Mentor profile courses and settings `extra="forbid"` are owned by WP-41 and WP-49.

## Dependencies

None. Runs in parallel with WP-66/WP-67. Branch `kitob/prod-1-access-uploads`.

## How to verify

Python 3.12 venv against fresh disposable PostgreSQL/Redis pods with this WP's own prefix (never imkon_db/imkon_redis): targeted tests red before / green after, full `python -m pytest app/tests -q` with exact counts, `python scripts/generate_contract.py` if a schema changed, `python -m alembic heads` (one head). Raw logs under `~/.local/state/imkon-remediation/<wp>/`.

## Acceptance criteria

- Every listed finding is fixed or rejected with evidence; each fix has a regression test that fails without it.
- AGENTS.md rules hold (no comments, typed locals, layering, files < 20 KB, expand-only migrations).
- A failing gate is recorded as blocked, not done.
