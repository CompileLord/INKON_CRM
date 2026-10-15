# WP-23 — Atomically count and consume verification/reset codes

Phase **2** · Priority **High (remediation priority)** · Effort **M** · Status **todo**

## Goal

Atomically count and consume verification/reset codes. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-06** (Required (no prefix)): Reset-code attempts and consumption are not atomic. [BUS-06 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-06--reset-code-attempts-and-consumption-are-not-atomic). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/auth_service.py:125](../../../backend/app/services/auth_service.py) | Existing file, anchor line 125; only this WP’s stated behavior may change. |
| [backend/app/core/verification_codes.py](../../../backend/app/core/verification_codes.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp23.py](../../../backend/app/tests/integration/test_remediation_wp23.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/auth_service.py:125-150,236-261](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/auth_service.py`:

```text
125:         raw_data = await redis_client.get(key)
126:         if not raw_data:
127:             raise HTTPException(
128:                 status_code=status.HTTP_400_BAD_REQUEST,
129:                 detail="Verification code expired or not requested"
130:             )
131: 
132:         data = json.loads(raw_data)
```

## Step-by-step change

1. Implement atomic compare, attempt count and single-use consume for both code namespaces using a typed Redis result. Preserve TTL and maximum attempts.
2. Integrate without resetting cooldown/capacity keys; define recovery if DB work fails after consumption and never issue multiple grants from one code.

## Tests to write BEFORE the fix

- Five concurrent failures exhaust exactly the intended budget; simultaneous correct submissions issue at most one grant; expiry, malformed state and Redis error do not authorize.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp23.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

No lost attempt increments or duplicate consumption in real disposable Redis concurrency tests.

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

Functional prerequisites: WP-18, WP-22.

Required shared-file / migration ordering:
- WP-18 → WP-23: `backend/app/services/auth_service.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-23-atomic-challenges` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
