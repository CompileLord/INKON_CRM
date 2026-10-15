# WP-13 — Secure the Redis boundary and unify ARQ DSN handling

Phase **2** · Priority **High** · Effort **M** · Status **todo**

## Goal

Secure the Redis boundary and unify ARQ DSN handling. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **SEC-DATA-01** (High): VM Redis publication allows authentication-state tampering and worker payload injection. [SEC-DATA-01 — report section](../../backendsecurityaudit/03-data-infrastructure-security-audit.md#sec-data-01--vm-redis-publication-allows-authentication-state-tampering-and-worker-payload-injection). Verification: Confirmed all-interface unauthenticated Redis launch and host/port-only ARQ config. External reachability and worker deployment remain conditional.
- **DATA-06** (Required (no severity prefix in title)): ARQ uses a different Redis connection contract from the app. [DATA-06 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-06--arq-uses-a-different-redis-connection-contract-from-the-app). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Authorized scope correction

On 2026-10-15 the user authorized correcting missing plan paths before implementation. Source inspection found two additional active ARQ producers in the email and document services that still construct host/port-only connections. Their bounded connection changes are included below so all producers can satisfy the existing shared-endpoint acceptance criterion. No deployment or operational service changes are authorized by this package execution.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/scripts/setup_free_tier_vm.sh:44](../../../backend/scripts/setup_free_tier_vm.sh) | Existing file, anchor line 44; only this WP’s stated behavior may change. |
| [backend/app/core/redis.py:17](../../../backend/app/core/redis.py) | Existing file, anchor line 17; only this WP’s stated behavior may change. |
| [backend/app/workers/settings.py:15](../../../backend/app/workers/settings.py) | Existing file, anchor line 15; only this WP’s stated behavior may change. |
| [backend/app/services/email_service.py](../../../backend/app/services/email_service.py) | Existing verification-email producer: use the shared secure Redis connection configuration; preserve accepted SMTP TLS/timeout behavior. |
| [backend/app/services/document_service.py](../../../backend/app/services/document_service.py) | Existing document-notification producer: use the shared secure Redis connection configuration; preserve authorization, privacy and transaction behavior. |
| [backend/.env.example:1](../../../backend/.env.example) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/config/redis.conf.example](../../../backend/config/redis.conf.example) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp13.py](../../../backend/app/tests/integration/test_remediation_wp13.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/scripts/setup_free_tier_vm.sh:44–53,69](../../../backend/scripts/setup_free_tier_vm.sh) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/core/redis.py:17–26](../../../backend/app/core/redis.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/core/redis.py:4–7,17–26](../../../backend/app/core/redis.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/scripts/setup_free_tier_vm.sh`:

```text
44: echo "[4/4] Launching Redis 7 container..."
45: $CONTAINER_CLI stop imkon_redis 2>/dev/null || true
46: $CONTAINER_CLI rm imkon_redis 2>/dev/null || true
47: 
48: $CONTAINER_CLI run -d \
49:     --name imkon_redis \
50:     --restart always \
51:     -p "${REDIS_PORT}:6379" \
```

## Step-by-step change

1. Publish only loopback for colocated clients or an explicit private interface with authorized VPC ingress for remote clients; never leave all-interface unauthenticated publication.
2. Document/provision Redis ACL and TLS consistently without printing credentials. Parse REDIS_URL once for app, every producer (including verification-email and document notifications) and worker, preserving database/password/TLS. Preserve the accepted email transport and document privacy fixes. Typed connection configuration belongs in the existing core Redis module; avoid unrelated service refactoring.
3. Treat Redis writers as trusted job submitters. If switching from pickle to a data-only codec, drain/version the queue and test all payload types; network/ACL isolation is the required first control, serializer change is defense in depth only.

## Tests to write BEFORE the fix

- Parse synthetic nondefault database/auth/rediss URLs in producer and worker. In an isolated network assert unauthorized connection/commands fail and authorized harmless jobs reach the intended worker. Check shell commands never publish a public URL.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp13.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Redis is private/authenticated and the worker and producer use the same secure endpoint. Record firewall verification limits; do not claim an uninspected cloud firewall is fixed.

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

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-11.

Required shared-file / migration ordering:
- WP-11 → WP-13: `backend/.env.example`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-13-redis-trust` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
