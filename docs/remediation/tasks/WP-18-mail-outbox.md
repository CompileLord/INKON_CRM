# WP-18 — Deliver verification mail after its business transaction commits

Phase **2** · Priority **High** · Effort **M** · Status **todo**

## Goal

Deliver verification mail after its business transaction commits. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **PERF-BUS-01** (High): SMTP without a socket deadline retains request transactions and executor threads. [PERF-BUS-01 — report section](../../backendperformanceaudit/02-business-domain-performance-audit.md#perf-bus-01--smtp-without-a-socket-deadline-retains-request-transactions-and-executor-threads). Verification: Confirmed SMTP offload, missing socket timeout and DB-before-mail await order. Pool impact remains unmeasured.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/email_service.py:24](../../../backend/app/services/email_service.py) | Existing file, anchor line 24; only this WP’s stated behavior may change. |
| [backend/app/services/auth_service.py:111](../../../backend/app/services/auth_service.py) | Existing file, anchor line 111; only this WP’s stated behavior may change. |
| [backend/app/services/user_service.py:41](../../../backend/app/services/user_service.py) | Existing file, anchor line 41; only this WP’s stated behavior may change. |
| [backend/app/models/outbox_event.py](../../../backend/app/models/outbox_event.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/models/__init__.py:1](../../../backend/app/models/__init__.py) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/services/outbox_service.py](../../../backend/app/services/outbox_service.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/workers/outbox.py](../../../backend/app/workers/outbox.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/workers/settings.py:15](../../../backend/app/workers/settings.py) | Existing file, anchor line 15; only this WP’s stated behavior may change. |
| [backend/alembic/versions/rwp18_outbox.py](../../../backend/alembic/versions/rwp18_outbox.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp18.py](../../../backend/app/tests/integration/test_remediation_wp18.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-18.md](../results/WP-18.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/email_service.py:24-34](../../../backend/app/services/email_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/auth_service.py:111-121,169-177,219-232](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/user_service.py:41-44,64-67](../../../backend/app/services/user_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/email_service.py`:

```text
24:         with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
25:             server.ehlo()
26:             server.starttls()
27:             server.ehlo()
28:             server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
29:             server.send_message(message)
30: 
31:     async def send_email(self, to_email: str, subject: str, body: str) -> None:
```

## Step-by-step change

1. Add a narrow durable outbox row and bounded claiming worker. Insert mail intent within the user/reset transaction; do not await SMTP while it holds a DB checkout.
2. Dispatch only committed intents with finite attempts, claim lease, socket deadlines and code-expiry/queue-age checks. Ensure verification state is valid before sending and rolled-back user creation cannot emit a usable invitation.
3. Protect transient recovery-code payloads, avoid logging them and remove expired/delivered sensitive payloads; retain only safe delivery metadata. Keep this PR limited to mail plus the reusable outbox primitive.

Additive migration; a worker rollback leaves durable intents pending, never falls back to synchronous sends inside transactions. Keep this a mail-only vertical slice; notification producers join in WP-29.

## Tests to write BEFORE the fix

- Rollback user creation emits no mail; crash/retry cannot lose the intent; expired codes are never sent. Fault-inject connect/read stalls and verify unrelated request work does not retain a mail-dependent transaction. Test claim cancellation and finite retries.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp18.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

HTTP business commit completes independently of remote SMTP; no DB transaction is held throughout a stalled send; outbox delivery/retry/expiry semantics are explicit.

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

Also run the targeted tests described here. Configure test storage/temp output and service targets **before imports**; the original fixture drops a PostgreSQL schema and flushes application-configured Redis. Never run it against ordinary shared services. Record exact commands, exit codes, baseline failures and new failures in this WP’s result file. No test result in this plan is an executed remediation result. Do not claim success from historical onboarding. Existing unrelated frontend/typecheck failures must be recorded and escalated, not silently fixed outside scope.


Performance / operational evidence: At 1/10/30 mail requests compare DB checkout hold/wait, active threads, queue age and unrelated p95/p99 against WP-01 baseline under identical controlled stalls.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

Use the exact NEW migration filename listed, a unique revision ID and the current single Alembic head after dependencies. Test upgrade, data preflight and rollback/recovery in a disposable database. Do not rewrite an applied revision or silently discard conflicting financial/authentication data.

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-12, WP-13, WP-17.

Required shared-file / migration ordering:
- WP-12 → WP-18: `backend/app/services/email_service.py`.
- WP-17 → WP-18: `backend/app/services/auth_service.py`, `Alembic single-head revision chain`.
- WP-16 → WP-18: `backend/app/services/user_service.py`.
- WP-13 → WP-18: `backend/app/workers/settings.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-18-mail-outbox` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-18.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
