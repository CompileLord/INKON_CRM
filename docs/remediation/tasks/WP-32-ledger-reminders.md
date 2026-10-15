# WP-32 — Select due ledger balances and honor notification switches

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Select due ledger balances and honor notification switches. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-07** (Required (no prefix)): Reminder calculations still use the retired payment model. [BUS-07 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-07--reminder-calculations-still-use-the-retired-payment-model). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **BUS-18** (Required (no prefix)): Organization notification switches are saved but never enforced. [BUS-18 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-18--organization-notification-switches-are-saved-but-never-enforced). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Contributes without duplicating coverage ownership: [BUS-20 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-20--optional-remove-repeated-queries-and-unbounded-materialization-from-reportingjobs) (closure owner WP-54).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/workers/tasks.py:209](../../../backend/app/workers/tasks.py) | Existing file, anchor line 209; only this WP’s stated behavior may change. |
| [backend/app/services/settings_service.py:31](../../../backend/app/services/settings_service.py) | Existing file, anchor line 31; only this WP’s stated behavior may change. |
| [backend/app/repositories/sqlalchemy/payment_repository.py:9](../../../backend/app/repositories/sqlalchemy/payment_repository.py) | Existing file, anchor line 9; only this WP’s stated behavior may change. |
| [backend/app/repositories/interfaces/payment_repository.py:7](../../../backend/app/repositories/interfaces/payment_repository.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp32.py](../../../backend/app/tests/integration/test_remediation_wp32.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/workers/tasks.py:209-225](../../../backend/app/workers/tasks.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/settings_service.py:31-34](../../../backend/app/services/settings_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/workers/tasks.py:154-166,224-251](../../../backend/app/workers/tasks.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:294-295,1004-1019,1510-1550](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/journal_service.py:172-182](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/sum_calculation_service.py:71-118](../../../backend/app/services/sum_calculation_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/workers/tasks.py:156-166,193-222](../../../backend/app/workers/tasks.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/workers/tasks.py`:

```text
209:                     pay_stmt = select(
210:                         func.coalesce(
211:                             func.sum(
212:                                 Payment.amount * (Decimal("1.0") - cast(Payment.discount_percent, Numeric) / Decimal("100.0"))
213:                             ),
214:                             Decimal("0.0")
215:                         )
216:                     ).filter(
```

## Step-by-step change

1. Replace retired Payment-table/month-total logic with a bounded due-Charge query subtracting active allocations and excluding cancelled/withdrawn obligations under policy.
2. Map payment/debt switches to notification types and check them before enqueue/claim/send; reuse a typed repository query rather than duplicate ledger math.
3. Batch selection by due date/ID so work does not issue queries per student/enrollment.

## Tests to write BEFORE the fix

- Fully paid, partial, discounted, refunded and withdrawn enrollments produce exact reminders; both disabled switches prevent enqueue/send/SENT logs. Query counts stay bounded as students increase.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp32.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Reminders reflect current ledger balances and organization policy; disabled notifications do not send.

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


Performance / operational evidence: Measure SQL count/rows and RSS for 10/100/1000 eligible enrollments; batch work grows with batches, not nested student/enrollment queries.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-31, WP-08.

Required shared-file / migration ordering:
- WP-31 → WP-32: `backend/app/workers/tasks.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-32-ledger-reminders` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
