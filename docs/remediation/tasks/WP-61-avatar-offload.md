# WP-61 — Bound and reuse avatar transformation work

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Bound and reuse avatar transformation work. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

This is an enabling, contributor or verification package; it does not independently own a source finding.

Contributes without duplicating coverage ownership: [BUS-15 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-15--password-hashing-and-avatar-transformation-block-async-request-execution) (closure owner WP-60).

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/user_service.py:169](../../../backend/app/services/user_service.py) | Existing file, anchor line 169; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp61.py](../../../backend/app/tests/integration/test_remediation_wp61.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/core/security.py:9-21](../../../backend/app/core/security.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/auth_service.py:33,194,302](../../../backend/app/services/auth_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/user_service.py:169-208](../../../backend/app/services/user_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/core/security.py`:

```text
9: def hash_password(password: str) -> str:
10:     pwd_bytes = password.encode("utf-8")
11:     salt = bcrypt.gensalt(rounds=12)
12:     return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")
13: 
14: 
15: def verify_password(plain_password: str, hashed_password: str) -> bool:
16:     pwd_bytes = plain_password.encode("utf-8")
```

## Step-by-step change

1. Read uploads under a finite byte limit, enforce image pixel/dimension limits, and offload one decode/verify/resize/encode helper through bounded CPU work.
2. Reuse the thumbnail result instead of decoding twice; preserve the existing API image sizes unless an explicitly approved contract change is needed. This completes the image contribution to BUS-15, owned by WP-60.

## Tests to write BEFORE the fix

- Invalid/truncated/oversized/decompression-bomb inputs fail before excessive allocation; PNG/JPEG output dimensions and replacement cleanup remain correct; heartbeat stays responsive.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp61.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Avatar transformations are bounded, offloaded and computed once with unchanged accepted-image semantics.

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


Performance / operational evidence: Compare decoded pixels, peak RSS, transformation count, loop lag and unrelated p95 under concurrent uploads.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-26.

Required shared-file / migration ordering:
- WP-26 → WP-61: `backend/app/services/user_service.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-61-avatar-offload` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
