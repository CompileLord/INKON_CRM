# WP-36 — Serialize accounting closure with posting policy checks

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Serialize accounting closure with posting policy checks. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **SEC-BUS-04** (Medium): Financial posting can cross accounting-period closure without rechecking the policy. [SEC-BUS-04 — report section](../../backendsecurityaudit/02-business-domain-security-audit.md#sec-bus-04--financial-posting-can-cross-accounting-period-closure-without-rechecking-the-policy). Verification: Confirmed status read and close update use no common lock; absent period rows require advisory or precreated-row coordination.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/finance_service.py:83](../../../backend/app/services/finance_service.py) | Existing file, anchor line 83; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp36.py](../../../backend/app/tests/integration/test_remediation_wp36.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/finance_service.py:83-99,503-526,1597-1627](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/finance_service.py`:

```text
83:     async def _check_period_open(self, occurred_at: datetime, what: str = "entry") -> None:
84:         """Reject writes dated into a closed accounting period."""
85:         local_dt = _to_dushanbe(occurred_at)
86:         query = select(AccountingPeriod).filter(
87:             AccountingPeriod.year == local_dt.year,
88:             AccountingPeriod.month == local_dt.month,
89:         )
90:         res = await self.db.execute(query)
```

## Step-by-step change

1. Use transaction-scoped shared month locks for posting and exclusive month locks for close/reopen, including an absent period row. Lock all affected original/current months in sorted order.
2. Document and enforce one global order with WP-07 account locks; no path may acquire them in the reverse order. Retain through commit and recheck period status after locking.

## Tests to write BEFORE the fix

- Barrier-controlled posting/closure and absent-month creation races produce a serial outcome; void/refund across months does not deadlock. Legitimate late settlement of an old obligation remains permitted under existing rules.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp36.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

No unchecked posting commits across a completed closure; lock ordering and bounded rollback behavior are verified.

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


Performance / operational evidence: Measure same-month/different-student throughput, close wait and deadlock/timeout rates in disposable PostgreSQL.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-07, WP-24.

Required shared-file / migration ordering:
- WP-24 → WP-36: `backend/app/services/finance_service.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-36-period-serialization` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
