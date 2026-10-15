# WP-02 — Add executable Critical regression reproductions

Phase **0** · Priority **Baseline** · Effort **M** · Status **todo**

## Goal

Add executable Critical regression reproductions. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

This is an enabling, contributor or verification package; it does not independently own a source finding.

Contributes without duplicating coverage ownership: [BUS-01 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-01--critical-refresh-tokens-are-identical-across-users-minted-in-the-same-second) (closure owner WP-03); [SEC-BUS-01 — report section](../../backendsecurityaudit/02-business-domain-security-audit.md#sec-bus-01--cross-user-refresh-produces-a-privileged-access-grant-service-level-confirmation-of-bus-01) (closure owner WP-03); [API-01 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-01--critical-private-documents-are-served-without-authentication) (closure owner WP-04); [BUS-02 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-02--critical-concurrent-ledger-writers-can-spend-the-same-credit-and-refund-beyond-the-payment) (closure owner WP-07).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/tests/regression/critical_reproductions.py](../../../backend/app/tests/regression/critical_reproductions.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/core/security.py:60-72](../../../backend/app/core/security.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/auth_service.py:41-51,69-83](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/auth_service.py:41-51,69-101](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/main.py:67–70,97–101](../../../backend/app/main.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/finance_service.py:165-177,271-324,736-770,785-857](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/core/security.py`:

```text
60: def create_refresh_token(expires_delta: Optional[timedelta] = None) -> str:
61:     now = datetime.now(timezone.utc)
62:     if expires_delta:
63:         expire = now + expires_delta
64:     else:
65:         expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
66: 
67:     to_encode: Dict[str, Any] = {
```

## Step-by-step change

1. Use the isolated WP-01 runtime and shared fixtures. Put named pytest tests in critical_reproductions.py, which is explicitly invoked and intentionally outside default test_*.py collection.
2. Freeze token time and exercise two users through login/refresh; fetch private document bytes anonymously and as another student; synchronize two PostgreSQL sessions before allocation/refund reads using barriers, never timing sleeps.
3. Assert desired secure behavior so the current defects fail. Record baseline failures and selectors. Keep this test-only PR visibly red for these explicit cases; do not use skip, xfail or broad status alternatives.

References for test design: BUS-01/SEC-BUS-01, API-01 and BUS-02. Finding ownership remains exclusively with WP-03, WP-04 and WP-07. A baseline test PR can be reviewed/merged with explicit expected failing evidence because normal suite collection is unchanged; no claim of a fully green security regression suite is allowed.

## Tests to write BEFORE the fix

- test_refresh_cross_user_same_second: distinct credentials and correct access subject.
- test_private_document_download: anonymous/other-owner cannot obtain bytes via returned legacy storage URL.
- test_concurrent_allocation and test_concurrent_refund: aggregate allocated/refunded value never exceeds charge/payment, including two independent committed sessions.

## Acceptance criteria

Four reproducible failures are explained and reproducible on the baseline; tests are not described as passing or remediation complete. Fix PRs invoke their exact selector; WP-07 runs the entire reproduction module after the three root causes are fixed.

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

Tests can destroy service state if isolation is wrong. Verify disposable targets before imports; stop on ambiguity. Rollback removes only this WP’s test/docs artifacts and disposes its dedicated runtime; never reset an existing user database.

## Dependencies and execution order

Functional prerequisites: WP-01.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-02-critical-reproductions` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
