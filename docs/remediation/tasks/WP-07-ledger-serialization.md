# WP-07 — Serialize financial writers on a stable account row

Phase **1** · Priority **Critical** · Effort **M** · Status **todo**

## Goal

Serialize financial writers on a stable account row. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-02** (Critical:): Critical: Concurrent ledger writers can spend the same credit and refund beyond the payment. [BUS-02 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-02--critical-concurrent-ledger-writers-can-spend-the-same-credit-and-refund-beyond-the-payment). Verification: Confirmed aggregate reads followed by inserts without stable shared writer lock; actual concurrent DB test pending.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/finance_service.py:165](../../../backend/app/services/finance_service.py) | Existing file, anchor line 165; only this WP’s stated behavior may change. |
| [backend/app/services/enrollment_service.py:26](../../../backend/app/services/enrollment_service.py) | Existing file, anchor line 26; only this WP’s stated behavior may change. |
| [backend/app/models/ledger.py:11](../../../backend/app/models/ledger.py) | Existing file, anchor line 11; only this WP’s stated behavior may change. |
| [backend/alembic/versions/rwp07_ledger_serialization.py](../../../backend/alembic/versions/rwp07_ledger_serialization.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp07.py](../../../backend/app/tests/integration/test_remediation_wp07.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/finance_service.py:165-177,271-324,736-770,785-857](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/finance_service.py`:

```text
165:     async def _entry_available(self, entry: LedgerEntry) -> Decimal:
166:         """Credit on this entry not yet applied and not cashed out."""
167:         allocated = await self._active_allocated([entry.id])
168:         cashed_out = await self._cash_out_refunded(entry.id)
169:         return entry.amount - allocated - cashed_out
170: 
171:     async def _charge_remaining(self, charge: Charge) -> Decimal:
172:         q = select(func.coalesce(func.sum(Allocation.amount), ZERO)).filter(
```

## Step-by-step change

1. Add a single transaction-scoped account/student row lock before balance/availability reads for payment, allocation, discount, adjustment, refund, void, schedule generation and withdrawal. Lock multiple accounts in sorted order and retain locks through commit.
2. Re-read aggregates after acquiring the lock; do not commit early or lock only newly inserted allocation rows. Add one-void-per-payment database protection with duplicate preflight.
3. Preserve append-only reversal history and Decimal invariants; audit every mutation entrance including nested enrollment calls.

Do not infer safety from sequential tests or SQLite. Keep financial mutations disabled rather than revert to unlocked writers if rollout fails. SEC-BUS-04 month closure gets its distinct lock protocol in WP-36.

## Tests to write BEFORE the fix

- Run both WP-02 ledger races before fixing using independent committed sessions. Add concurrent allocation-to-same-charge, allocation-from-same-credit-to-different-charges, refund/refund and void/void races.
- Assert aggregate balances, charge status, audit rows and rollback after timeout/cancellation; independent students can progress concurrently.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp07.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

Critical rule: capture the reproducing failure **before** implementation, then demonstrate the same assertion passes afterward. No skip/xfail, weakened assertion or response-shape-only substitute. If reproducing evidence contradicts this plan, stop and report.

Explicit baseline module (run from backend):

```bash
PYTHONDONTWRITEBYTECODE=1 python -m pytest app/tests/regression/critical_reproductions.py -q -p no:cacheprovider
```

## Acceptance criteria

All financial mutation entry points share serialization; no over-allocation/over-refund/double void; the full WP-02 reproduction module now passes.

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


Performance / operational evidence: Measure lock wait and transaction p95 for 1/10 same-student versus different-student writers; correctness is mandatory regardless of throughput.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

Use the exact NEW migration filename listed, a unique revision ID and the current single Alembic head after dependencies. Test upgrade, data preflight and rollback/recovery in a disposable database. Do not rewrite an applied revision or silently discard conflicting financial/authentication data.

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-03, WP-04, WP-02.

Required shared-file / migration ordering:
- WP-03 → WP-07: `Alembic single-head revision chain`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-07-ledger-serialization` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
