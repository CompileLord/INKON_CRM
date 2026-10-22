# WP-70 — Resolve known vulnerabilities in the frozen dependency lock

Phase **3** · Priority **High** · Effort **M** · Status **todo** · Source: WP-48 `pip-audit --require-hashes -r backend/requirements.lock` on 2026-10-21 (20 advisories, 5 packages; log `~/.local/state/imkon-remediation/wp48/pip-audit.log`)

## Goal

The production lock carries no known advisory without a recorded, evidenced decision. Each package is upgraded to a fixed version, replaced, or accepted as unreachable with proof.

## Findings

- aiohttp 3.14.3 (8 advisories, fixed 3.14.4). Check whether it is only pulled in transitively, e.g. by aiogram.
- pillow 12.3.0 (8 advisories, fixed 13.0.0). This is a major bump, so check image upload, avatar and exam-render paths.
- certifi 2026.7.22 (fixed 2026.10.19).
- ecdsa 0.19.2 and python-jose 3.5.0 (no fixed version). Decide whether to replace python-jose with a maintained JWT library, or to prove the vulnerable code path (ECDSA signing/verification) is unused because the app signs with HS256 only.

## Exact files

`backend/requirements.txt`, `backend/requirements.lock`, `backend/requirements-ci.lock` (only if a shared package such as certifi changes), and the minimal call sites if a library is replaced (`backend/app/core/security*.py` or equivalent JWT helpers) with their tests.

## Dependencies

After WP-48 (the lock and `--require-hashes` installs exist). Regenerate the lock with hashes, and keep every non-advisory package at its frozen version.

## How to verify

`pip-audit --require-hashes -r backend/requirements.lock` exits 0, or every remaining ID has a documented reachability decision in the report. Use a Python 3.12 venv against fresh disposable PostgreSQL/Redis pods with this WP's own prefix (never imkon_db or imkon_redis). Run the full `python -m pytest app/tests -q` with exact counts, `podman build -f backend/Dockerfile backend`, and JWT round-trip and legacy-token tests if the JWT library changes. Raw logs go under `~/.local/state/imkon-remediation/wp70/`.

## Acceptance criteria

- Every advisory is fixed, or rejected with reachability evidence.
- Existing access and refresh tokens stay valid across a JWT library swap.
- AGENTS.md rules hold.
