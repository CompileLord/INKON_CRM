# WP-22 — Make authentication limits atomic and success-independent

Phase **2** · Priority **High (remediation priority)** · Effort **M** · Status **todo**

## Goal

Make authentication limits atomic and success-independent. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **API-04** (Required (no prefix)): Verification-code resend has no throttling. [API-04 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-04--verification-code-resend-has-no-throttling). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **DATA-05** (Required (no severity prefix in title)): Authentication rate limits allow concurrent requests beyond the configured limit. [DATA-05 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-05--authentication-rate-limits-allow-concurrent-requests-beyond-the-configured-limit). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **PERF-API-03** (Medium): Medium — Successful logins bypass the only route work budget. [PERF-API-03 — report section](../../backendperformanceaudit/01-api-layer-performance-audit.md#perf-api-03--medium--successful-logins-bypass-the-only-route-work-budget). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Authorized scope correction

Authentication budgets need validated, configurable policy values in the existing Settings class and example environment. Add only the relevant positive auth-limit/window/cooldown fields; preserve existing configuration validation. The accepted test Redis wrapper lacks EVAL, so add only a typed EVAL adapter that namespaces every declared Redis key; preserve isolation and cleanup without forwarding raw keys or weakening target guards. New limiter business logic belongs in classes, with narrow FastAPI dependency wiring in the allowed auth controller. Use the ASGI client identity from configured server ingress; do not trust arbitrary forwarded headers in application code. The existing WP-09 unsupported-command parameterization forbids EVAL entirely. Update only its EVAL expectation to the newly supported namespaced contract; retain every global-command rejection and foreign-key preservation assertion, and add a real Redis multi-key EVAL isolation regression. No other file scope is broadened.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/core/rate_limiter.py:10](../../../backend/app/core/rate_limiter.py) | Existing file, anchor line 10; only this WP’s stated behavior may change. |
| [backend/app/api/v1/auth.py:66](../../../backend/app/api/v1/auth.py) | Existing file, anchor line 66; only this WP’s stated behavior may change. |
| [backend/app/core/config.py](../../../backend/app/core/config.py) | Add only validated positive authentication budget/window/cooldown settings. |
| [backend/.env.example](../../../backend/.env.example) | Document only the corresponding non-secret auth policy values. |
| [backend/app/tests/conftest.py](../../../backend/app/tests/conftest.py) | Add only a typed EVAL adapter that namespaces every declared Redis key; retain every isolation guard and cleanup rule. |
| [backend/app/tests/integration/test_remediation_wp09.py](../../../backend/app/tests/integration/test_remediation_wp09.py) | Replace only the obsolete EVAL-unsupported expectation with real multi-key EVAL isolation coverage; retain global-command and foreign-key protections. |
| [backend/app/tests/integration/test_remediation_wp22.py](../../../backend/app/tests/integration/test_remediation_wp22.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/api/v1/auth.py:66–72](../../../backend/app/api/v1/auth.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/core/rate_limiter.py:10–22](../../../backend/app/core/rate_limiter.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/api/v1/auth.py:22-32](../../../backend/app/api/v1/auth.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/api/v1/auth.py`:

```text
66: @router.post("/resend-code", status_code=status.HTTP_204_NO_CONTENT)
67: async def resend_code(
68:     payload: ResendCodeRequest,
69:     db: AsyncSession = Depends(get_db_session)
70: ) -> None:
71:     auth_service = AuthService(db)
72:     await auth_service.resend_code(payload.email)
73: 
```

## Step-by-step change

1. Use one atomic Redis threshold/increment/TTL operation and explicit window semantics.
2. Add resend cooldown before code generation plus account/client/aggregate work budgets; preserve failed-login lockout separately from a budget that successful login never clears.
3. Trust client identity only from configured ingress; return accurate Retry-After and keep failure closed on limiter errors.

## Tests to write BEFORE the fix

- Concurrent requests at limit-1 cannot all pass. Repeated resend does not overwrite code/send mail. The 31st synthetic successful login at the configured example 30/minute budget is denied, while failed-login behavior remains correct.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp22.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Budgets hold across processes and success does not erase capacity limits; retry headers and code cooldown are deterministic.

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


Performance / operational evidence: Measure throttled/accepted counts, login p95, unrelated loop lag and refresh insert rate; calibrate limits with legitimate traffic rather than enshrining example values.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-13, WP-17.

Required shared-file / migration ordering:
- WP-06 → WP-22: `backend/app/api/v1/auth.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-22-auth-budgets` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
