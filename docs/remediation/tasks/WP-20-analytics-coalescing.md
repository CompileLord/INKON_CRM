# WP-20 — Coalesce identical analytics misses across instances

Phase **2** · Priority **High** · Effort **M** · Status **todo**

## Goal

Coalesce identical analytics misses across instances. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **PERF-BUS-02** (High): Analytics cache expiry multiplies thirteen-query recomputations. [PERF-BUS-02 — report section](../../backendperformanceaudit/02-business-domain-performance-audit.md#perf-bus-02--analytics-cache-expiry-multiplies-thirteen-query-recomputations). Verification: Confirmed 13 explicit cold-computation SELECT sites, no distributed miss coordination; 13R is a source model.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/services/finance_service.py:1223](../../../backend/app/services/finance_service.py) | Existing file, anchor line 1223; only this WP’s stated behavior may change. |
| [backend/app/services/analytics_cache_service.py](../../../backend/app/services/analytics_cache_service.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp20.py](../../../backend/app/tests/integration/test_remediation_wp20.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/finance_service.py:1223-1349,1351-1448,1174-1220](../../../backend/app/services/finance_service.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/finance_service.py`:

```text
1223:     async def get_analytics(self, date_from: date, date_to: date) -> dict:
1224:         cache_key = f"finance:analytics:{date_from.isoformat()}:{date_to.isoformat()}"
1225:         cached = await redis_client.get(cache_key)
1226:         if cached:
1227:             return json.loads(cached)
1228: 
1229:         today = get_dushanbe_today()
1230:         active_enrollment = and_(
```

## Step-by-step change

1. Wrap exact generation/date-key recomputation in a Redis lease with random owner, finite expiry, compare-and-delete release, cancellation cleanup and bounded waiter jitter.
2. Recheck cache after acquiring the lease; set results only under the observed generation. Define timeout behavior explicitly and preserve Decimal-derived financial values.

## Tests to write BEFORE the fix

- Two processes making 30 identical cold requests produce one recomputation in the controlled normal lease lifetime. Test leader failure, expired lease, cancellation, distinct keys and writer generation change.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp20.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Identical misses are coalesced without unbounded waits or stale-generation publication; financial response values are equivalent.

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


Performance / operational evidence: Count actual SQL calls/recompute winners at 1/10/30 requests, pool wait, transferred rows/RSS and p95/p99; source baseline is 13 SELECT sites per cold computation, not measured production latency.

Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.

## Risks and rollback

A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.

## Dependencies and execution order

Functional prerequisites: WP-19, WP-13.

Required shared-file / migration ordering:
- WP-19 → WP-20: `backend/app/services/finance_service.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-20-analytics-coalescing` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
