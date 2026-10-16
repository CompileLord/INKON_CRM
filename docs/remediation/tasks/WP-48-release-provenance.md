# WP-48 — Freeze release dependencies and isolate deployment credentials

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Freeze release dependencies and isolate deployment credentials. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **SEC-DATA-05** (Medium): Mutable release inputs execute with build or deployment privileges. [SEC-DATA-05 — report section](../../backendsecurityaudit/03-data-infrastructure-security-audit.md#sec-data-05--mutable-release-inputs-execute-with-build-or-deployment-privileges). Verification: Confirmed mutable dependency/action/image/installer inputs; installed advisory flags are FYI, not separately proven exploits.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/requirements.txt:1](../../../backend/requirements.txt) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/requirements.lock](../../../backend/requirements.lock) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/pyproject.toml:1](../../../backend/pyproject.toml) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/Dockerfile:1](../../../backend/Dockerfile) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [.github/workflows/deploy-backend.yml:80](../../../.github/workflows/deploy-backend.yml) | Existing file, anchor line 80; only this WP’s stated behavior may change. |
| [.github/workflows/deploy-frontend.yml:24](../../../.github/workflows/deploy-frontend.yml) | Existing file, anchor line 24; only this WP’s stated behavior may change. |
| [backend/scripts/setup_free_tier_vm.sh:15](../../../backend/scripts/setup_free_tier_vm.sh) | Existing file, anchor line 15; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp48.py](../../../backend/app/tests/integration/test_remediation_wp48.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/requirements.txt:1–18](../../../backend/requirements.txt) — current source range checked during planning. Context does not grant write ownership.
- [backend/Dockerfile:1–15](../../../backend/Dockerfile) — current source range checked during planning. Context does not grant write ownership.
- [.github/workflows/deploy-backend.yml:80–108,124–131](../../../.github/workflows/deploy-backend.yml) — current source range checked during planning. Context does not grant write ownership.
- [.github/workflows/deploy-frontend.yml:24–35,95–102](../../../.github/workflows/deploy-frontend.yml) — current source range checked during planning. Context does not grant write ownership.
- [backend/scripts/setup_free_tier_vm.sh:15–18](../../../backend/scripts/setup_free_tier_vm.sh) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/requirements.txt`:

```text
1: fastapi>=0.110.0
2: uvicorn>=0.28.0
3: sqlalchemy[asyncio]>=2.0.28
4: asyncpg>=0.29.0
5: alembic>=1.13.1
6: pydantic[email]>=2.6.4
7: pydantic-settings>=2.2.1
8: python-jose[cryptography]>=3.3.0
```

## Step-by-step change

1. Resolve and review a Python 3.12 transitive lock with hashes; use identical locked dependencies for tests, image and migrations and keep manifests aligned.
2. Pin actions to reviewed commit SHAs and base image digests; replace curl-to-root installer with verified package installation. Separate package/build execution from the minimally privileged deploy/migration identity and select one supported Google auth mode.
3. Recheck advisory reachability against the actual shipping graph; do not promote installed-environment FYI flags into proven runtime vulnerabilities.

If IAM/WIF resources require an external owner, record the concrete required configuration and keep rollout blocked until verified; repository edits cannot prove external IAM. No deployment is authorized by this planning task.

## Tests to write BEFORE the fix

- Altered artifacts fail hash verification; test/image/migration wheel graphs match. Build job cannot access production secrets; workflows remain parseable and trusted PRs cannot obtain deployment credentials.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp48.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Releases have reproducible reviewed inputs and a documented privilege boundary. Real SHA/digest values come from verified upstream releases.

- The file allowlist is respected and all required checks have actual results recorded.
- Security, money, authorization, version and transaction invariants remain intact; no broader redesign is hidden in this PR.
- A failing gate is recorded as blocked, not done; no audit finding is closed solely because code changed.

## How to verify

Use the available system environment, as permitted by current AGENTS.md. Backend verification must use the Python version declared by `backend/Dockerfile` (currently Python 3.12); Conda is optional. A passing suite under another Python version does not establish deployment compatibility.

Before and after the change, using the dedicated disposable runtime from WP-01/WP-09:

```bash
cd /workspace/INKON_CRM/backend
PYTHONDONTWRITEBYTECODE=1 python -m pytest app/tests -q -p no:cacheprovider
cd /workspace/INKON_CRM/frontend
npx vitest run
npx tsc --noEmit
```

Also run the targeted tests described here. Configure test storage/temp output and service targets **before imports**; the original fixture drops a PostgreSQL schema and flushes application-configured Redis. Never run it against ordinary shared services. Record exact commands, exit codes, baseline failures and new failures in this WP’s concise STATUS.md row. No test result in this plan is an executed remediation result. Do not claim success from historical onboarding. Existing unrelated frontend/typecheck failures must be recorded and escalated, not silently fixed outside scope.


Verification focuses on the exact behavioral/security tests above. No speculative performance benchmark is required.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-42, WP-43, WP-47.

Required shared-file / migration ordering:
- WP-14 → WP-48: `backend/Dockerfile`.
- WP-43 → WP-48: `.github/workflows/deploy-backend.yml`.
- WP-47 → WP-48: `backend/scripts/setup_free_tier_vm.sh`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-48-release-provenance` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
