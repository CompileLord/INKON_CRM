# WP-27 — Give Telegram webhook registration one deployment owner

Phase **3** · Priority **Medium** · Effort **S** · Status **todo**

## Goal

Give Telegram webhook registration one deployment owner. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **API-05** (Required (no prefix)): Instance shutdown removes the shared Telegram webhook. [API-05 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-05--instance-shutdown-removes-the-shared-telegram-webhook). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/main.py:23](../../../backend/app/main.py) | Existing file, anchor line 23; only this WP’s stated behavior may change. |
| [backend/scripts/register_telegram_webhook.py](../../../backend/scripts/register_telegram_webhook.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp27.py](../../../backend/app/tests/integration/test_remediation_wp27.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/results/WP-27.md](../results/WP-27.md) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md:1](../STATUS.md) | Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/main.py:23–41](../../../backend/app/main.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/main.py`:

```text
23: @asynccontextmanager
24: async def lifespan(app: FastAPI):
25:     from app.telegram_bot.bot import bot
26:     if not settings.TESTING:
27:         try:
28:             await bot.set_webhook(
29:                 url=settings.TELEGRAM_WEBHOOK_URL,
30:                 secret_token=settings.TELEGRAM_BOT_SECRET_TOKEN
```

## Step-by-step change

1. Remove unconditional global webhook deletion from instance shutdown and close only the local bot session in finally.
2. Add an explicit idempotent deployment/admin registration command with configuration validation and useful safe logging; document how the release owner invokes it once.

## Tests to write BEFORE the fix

- Two overlapping lifespans: closing either must not remove webhook for the survivor; cancellation/startup failure closes local resources; registration failure is observable.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp27.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Rolling deploy/scale-down cannot unregister another instance’s shared webhook.

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


Verification focuses on the exact behavioral/security tests above. No speculative performance benchmark is required.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-04, WP-11.

Required shared-file / migration ordering:
- WP-04 → WP-27: `backend/app/main.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**S**: localized change or narrowly scoped evidence collection.

Use branch `remediation/wp-27-webhook-lifecycle` and one PR for this WP. Save actual evidence in `docs/remediation/results/WP-27.md` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.
