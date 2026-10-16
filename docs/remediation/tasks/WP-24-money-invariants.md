# WP-24 — Validate persisted money and generate positive installments

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Validate persisted money and generate positive installments. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **API-08** (Required (no prefix)): Monetary inputs exceed the precision and range of persisted amounts. [API-08 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-08--monetary-inputs-exceed-the-precision-and-range-of-persisted-amounts). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **BUS-16** (Required (no prefix)): Rounded installment generation can create nonpositive charges. [BUS-16 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-16--rounded-installment-generation-can-create-nonpositive-charges). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Authorized scope correction

Enrollment currently flushes enrollment and journal rows before calling schedule generation. Add only its exact service path so the required schedule validation runs before the first write. Existing input adjustment amounts are positive credits; preserve signed derived/response values and optional allocation amounts. Current frontend inputs already use decimal strings; tighter input constraints do not change their shape. Frontend files are read-only context under separate ownership and are removed from this executor allowlist. Regenerate CONTRACT.md and record actual client compatibility evidence.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/schemas/common.py:7](../../../backend/app/schemas/common.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [backend/app/schemas/payment.py:16](../../../backend/app/schemas/payment.py) | Existing file, anchor line 16; only this WP’s stated behavior may change. |
| [backend/app/schemas/ledger.py:40](../../../backend/app/schemas/ledger.py) | Existing file, anchor line 40; only this WP’s stated behavior may change. |
| [backend/app/schemas/course.py:32](../../../backend/app/schemas/course.py) | Existing file, anchor line 32; only this WP’s stated behavior may change. |
| [backend/app/services/finance_service.py:432](../../../backend/app/services/finance_service.py) | Existing file, anchor line 432; only this WP’s stated behavior may change. |
| [CONTRACT.md:1](../../../CONTRACT.md) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp24.py](../../../backend/app/tests/integration/test_remediation_wp24.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/services/enrollment_service.py](../../../backend/app/services/enrollment_service.py) | Validate proposed contract installments before enrollment/journal add or flush, including legacy course prices. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/schemas/payment.py:16–21](../../../backend/app/schemas/payment.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/schemas/ledger.py:40–42,49–55,61–66,72–78](../../../backend/app/schemas/ledger.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/schemas/course.py:32–42](../../../backend/app/schemas/course.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:432-450](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/schemas/payment.py`:

```text
16:     model_config = {"extra": "forbid"}
17:     student_id: int
18:     course_id: int
19:     amount: Decimal = Field(gt=0)
20:     paid_at: datetime
21:     method: PaymentMethod
22:     comment: Optional[str] = None
```

## Step-by-step change

1. Use one positive two-decimal Numeric(10,2)-compatible input type across payment/refund/discount/adjustment/allocation/course price inputs.
2. Generate schedules using integer-cent quotient/remainder. Reject prices smaller than installment count in cents with a clear validation/business error before any writes; preserve total price exactly.

## Tests to write BEFORE the fix

- Subcent, three-place, maximum, overflow and tiny-price/many-month cases fail or succeed at the specified boundary; all generated charges are positive and sum exactly to contract price.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp24.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Valid requests cannot fail because of unvalidated money precision/range; no zero/negative installment is inserted.

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

Regenerate contract with `python backend/scripts/generate_contract.py` from repository root in the isolated test environment; verify the existing decimal-string client input types by reading them; report any actual shape incompatibility to the separate frontend owner without editing frontend files. New visible text must use existing translations or stop to add exact locale paths to the plan.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-08.

Required shared-file / migration ordering:
- WP-20 → WP-24: `backend/app/services/finance_service.py`.
- WP-15 → WP-24: `CONTRACT.md`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-24-money-invariants` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
