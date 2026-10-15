# WP-37 — Enforce active tuition installment uniqueness

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Enforce active tuition installment uniqueness. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **DATA-09** (Required (no severity prefix in title)): Installment identity is not protected by persistence. [DATA-09 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-09--installment-identity-is-not-protected-by-persistence). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/models/charge.py:24](../../../backend/app/models/charge.py) | Existing file, anchor line 24; only this WP’s stated behavior may change. |
| [backend/app/services/finance_service.py:60](../../../backend/app/services/finance_service.py) | Existing file, anchor line 60; only this WP’s stated behavior may change. |
| [backend/alembic/versions/rwp37_installment_identity.py](../../../backend/alembic/versions/rwp37_installment_identity.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp37.py](../../../backend/app/tests/integration/test_remediation_wp37.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/models/charge.py:24–30,33–35](../../../backend/app/models/charge.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/models/charge.py`:

```text
24:     __table_args__ = (
25:         CheckConstraint("amount > 0", name="check_charge_amount_positive"),
26:         CheckConstraint("sequence_no >= 1", name="check_charge_sequence_positive"),
27:         Index("idx_charges_student_due_date", "student_id", "due_date"),
28:         Index("idx_charges_enrollment", "enrollment_id"),
29:         Index("idx_charges_due_date", "due_date"),
30:     )
31: 
```

## Step-by-step change

1. Preflight duplicate active tuition installments and stop for explicit reconciliation; never delete debt silently.
2. Add a partial unique identity on enrollment/sequence for the intended active tuition domain; keep generation under the stable account/enrollment lock and handle uniqueness races by reading the winning schedule.

## Tests to write BEFORE the fix

- Two sessions generating the first schedule produce one set; repeat generation is idempotent; other allowed charge types do not collide. Existing balances remain unchanged by migration.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp37.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Persistence prevents duplicate receivables and generation retries do not duplicate installments.

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

Use the exact NEW migration filename listed, a unique revision ID and the current single Alembic head after dependencies. Test upgrade, data preflight and rollback/recovery in a disposable database. Do not rewrite an applied revision or silently discard conflicting financial/authentication data.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-36.

Required shared-file / migration ordering:
- WP-36 → WP-37: `backend/app/services/finance_service.py`.
- WP-33 → WP-37: `Alembic single-head revision chain`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-37-installment-identity` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
