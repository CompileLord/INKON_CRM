# WP-12 — Verify SMTP certificates and bound socket operations

Phase **2** · Priority **High** · Effort **S** · Status **todo**

## Goal

Verify SMTP certificates and bound socket operations. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **SEC-BUS-02** (High): SMTP STARTTLS accepts an unauthenticated server certificate. [SEC-BUS-02 — report section](../../backendsecurityaudit/02-business-domain-security-audit.md#sec-bus-02--smtp-starttls-accepts-an-unauthenticated-server-certificate). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Contributes without duplicating coverage ownership: [PERF-BUS-01 — report section](../../backendperformanceaudit/02-business-domain-performance-audit.md#perf-bus-01--smtp-without-a-socket-deadline-retains-request-transactions-and-executor-threads) (closure owner WP-18).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/email_service.py:24](../../../backend/app/services/email_service.py) | Existing file, anchor line 24; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp12.py](../../../backend/app/tests/integration/test_remediation_wp12.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/email_service.py:24-29](../../../backend/app/services/email_service.py) — current source range checked during planning. Context does not grant write ownership.
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

1. Pass ssl.create_default_context to STARTTLS before AUTH and preserve post-TLS EHLO.
2. Configure a finite SMTP socket timeout, keep thread offload, and expose meaningful safe errors. Never disable verification for private CAs; use a deliberately configured trust bundle.

## Tests to write BEFORE the fix

- Test untrusted CA and trusted wrong-host certificates fail before AUTH/body; trusted correct-host delivery succeeds. A controlled stalled socket reaches the timeout without hanging the suite.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp12.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

SMTP authenticates the server before transmitting credentials/codes; each socket operation has a finite budget.

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


Performance / operational evidence: Record timeout behavior and active thread counts. Full removal of mail from DB transactions is WP-18.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-09.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**S**: localized change or narrowly scoped evidence collection.

Use branch `remediation/wp-12-smtp-tls` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
