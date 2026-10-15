# WP-11 — Make fresh URL-only deployments and migrations boot reproducibly

Phase **1** · Priority **Critical** · Effort **M** · Status **todo**

## Goal

Make fresh URL-only deployments and migrations boot reproducibly. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **DATA-03** (Critical:): Critical: Redundant required database fields prevent the documented deployment from starting. [DATA-03 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-03--critical-redundant-required-database-fields-prevent-the-documented-deployment-from-starting). Verification: Confirmed required split fields absent from Cloud Run variable set; existing manually retained configuration may mask fresh-deploy failure.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/core/config.py:38](../../../backend/app/core/config.py) | Existing file, anchor line 38; only this WP’s stated behavior may change. |
| [backend/alembic/env.py:40](../../../backend/alembic/env.py) | Existing file, anchor line 40; only this WP’s stated behavior may change. |
| [backend/.env.example:1](../../../backend/.env.example) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [.github/workflows/deploy-backend.yml:1](../../../.github/workflows/deploy-backend.yml) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp11.py](../../../backend/app/tests/integration/test_remediation_wp11.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/core/config.py:38–43,70](../../../backend/app/core/config.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/core/config.py`:

```text
38:     POSTGRES_SERVER: str
39:     POSTGRES_USER: str
40:     POSTGRES_PASSWORD: str
41:     POSTGRES_DB: str
42:     POSTGRES_PORT: int = 5432
43:     DATABASE_URL: str
44: 
45:     REDIS_HOST: str = "localhost"
```

## Step-by-step change

1. Make DATABASE_URL canonical; remove redundant mandatory split PostgreSQL fields or construct the URL only when absent.
2. Give Alembic database-only configuration without importing SMTP/Telegram/JWT settings.
3. Validate the shipped production variable-name set with synthetic values and require a public HTTPS webhook URL when Telegram is enabled; make the enablement rule explicit.

## Tests to write BEFORE the fix

- Before fixing, instantiate configuration with only workflow-provided names and no .env; reproduce missing-field failure. Test missing DATABASE_URL, database-only Alembic initialization, and enabled Telegram with localhost webhook.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp11.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

Critical rule: capture the reproducing failure **before** implementation, then demonstrate the same assertion passes afterward. No skip/xfail, weakened assertion or response-shape-only substitute. If reproducing evidence contradicts this plan, stop and report.

## Acceptance criteria

A fresh image boots with documented settings and migrations need only database configuration; secret values never enter tests/results.

- The file allowlist is respected and all required checks have actual results recorded.
- Security, money, authorization, version and transaction invariants remain intact; no broader redesign is hidden in this PR.
- A failing gate is recorded as blocked, not done; no audit finding is closed solely because code changed.

## How to verify

Activate the repository Conda **base** environment (never create a venv):

```bash
source /workspace/miniconda3/etc/profile.d/conda.sh
conda activate base
```

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

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-02.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-11-configuration-contract` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
