# WP-33 — Represent actual grading separately from precreated rows

Phase **3** · Priority **Medium** · Effort **M** · Status **todo**

## Goal

Represent actual grading separately from precreated rows. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **BUS-12** (Required (no prefix)): Journal completion counts precreated empty entries as graded cells. [BUS-12 — report section](../../backendcodequalityaudit/02-business-domain-audit.md#bus-12--journal-completion-counts-precreated-empty-entries-as-graded-cells). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.
- **DATA-07** (Required (no severity prefix in title)): A positive score maximum is incorrectly treated as proof that a period was graded. [DATA-07 — report section](../../backendcodequalityaudit/03-data-infrastructure-audit.md#data-07--a-positive-score-maximum-is-incorrectly-treated-as-proof-that-a-period-was-graded). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/models/journal_entry.py:8](../../../backend/app/models/journal_entry.py) | Existing file, anchor line 8; only this WP’s stated behavior may change. |
| [backend/app/models/journal_student_summary.py:6](../../../backend/app/models/journal_student_summary.py) | Existing file, anchor line 6; only this WP’s stated behavior may change. |
| [backend/app/services/enrollment_service.py:99](../../../backend/app/services/enrollment_service.py) | Existing file, anchor line 99; only this WP’s stated behavior may change. |
| [backend/app/services/journal_service.py:55](../../../backend/app/services/journal_service.py) | Existing file, anchor line 55; only this WP’s stated behavior may change. |
| [backend/app/services/sum_calculation_service.py:9](../../../backend/app/services/sum_calculation_service.py) | Existing file, anchor line 9; only this WP’s stated behavior may change. |
| [backend/app/repositories/sqlalchemy/user_repository.py:83](../../../backend/app/repositories/sqlalchemy/user_repository.py) | Existing file, anchor line 83; only this WP’s stated behavior may change. |
| [backend/alembic/versions/rwp33_grading_state.py](../../../backend/alembic/versions/rwp33_grading_state.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [backend/app/tests/integration/test_remediation_wp33.py](../../../backend/app/tests/integration/test_remediation_wp33.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| `backend/app/services/journal_query_service.py` | Current completion, metric and class-rank query owner after extraction. |
| `backend/app/repositories/sqlalchemy/student_performance_repository.py` | Current profile aggregates/history/rank query owner. |
| `backend/app/services/student_profile_service.py` | Project internal explicit grading evidence without changing public types. |
| `backend/app/repositories/interfaces/user_repository.py` | Internal proven/unknown summary counts in raw DTOs. |
| `backend/app/tests/integration/test_remediation_wp33_migration.py` | Audit-proof backfill, unknown-state, additive replay and old-image compatibility tests under the 20 KB cap. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/services/journal_service.py:55-62,79-92,181-183](../../../backend/app/services/journal_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/services/enrollment_service.py:99-111](../../../backend/app/services/enrollment_service.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/repositories/sqlalchemy/user_repository.py:83–93,134–158,183–208,283–288](../../../backend/app/repositories/sqlalchemy/user_repository.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/services/journal_service.py`:

```text
55:         entry_counts_stmt = select(
56:             JournalEntry.journal_id,
57:             func.count(JournalEntry.id)
58:         ).filter(
59:             JournalEntry.journal_id.in_(journal_ids)
60:         ).group_by(JournalEntry.journal_id)
61:         entry_counts_res = await self.db.execute(entry_counts_stmt)
62:         entry_counts_map = dict(entry_counts_res.all())
```

Scope correction (2026-10-20): nullable internal `is_graded` means NULL unknown legacy/old-image writes, FALSE explicitly precreated by the new image, TRUE accepted grading including deliberate zero. Backfill only audit-proven commands; replay-safe additive migrations preserve ambiguity. Version-check a first grading transition even when values are unchanged. Structural recorded-summary/positive-denominator counts retain their literal meanings over nonfuture periods; graded means/totals/ranks use explicit TRUE only. Integer rank 0 denotes unranked when no proven grade, preserving response types; record its frontend display handoff. Keep existing public state strings conservative. Course-progress raw history with explicit unknown provenance is outside this package; do not relabel it graded. Any necessary query extraction requires a precise additional path/DI proposal before edits.

## Step-by-step change

1. Introduce explicit touched/graded state that distinguishes untouched rows from intentional zero/absence; set it in grading commands, including a deliberate zero update whose score values did not change.
2. Define period completion and summary grading from that state; apply to profile counts/averages/history and future periods, preserving positive maxima as denominators only.
3. Backfill only provable prior edits using available audit evidence; do not invent grading history from positive maxima or scores alone. Record ambiguous legacy rows for review.

One grading-state root cause spans models and consumers. Do not change API shapes in this package; existing state strings remain. If legacy evidence cannot recover a zero-grade distinction, report that limitation and preserve an explicit unknown state internally.

## Tests to write BEFORE the fix

- Untouched enrollment is empty; one edit partial; intentional zero counts as graded; full grid complete; future periods excluded. Exact counts/means/ranks, not shape-only assertions.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp33.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

All owned consumers use explicit grading evidence; no precreated zero row or positive denominator is mistaken for a completed grade.

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

Use the exact NEW migration filename listed, a unique revision ID and the current single Alembic head after dependencies. Test upgrade, data preflight and rollback/recovery in a disposable database. Do not rewrite an applied revision or silently discard conflicting financial/authentication data.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-21, WP-29, WP-24.

Required shared-file / migration ordering:
- WP-19 → WP-33: `backend/app/services/enrollment_service.py`.
- WP-29 → WP-33: `backend/app/services/journal_service.py`.
- WP-21 → WP-33: `backend/app/services/sum_calculation_service.py`.
- WP-16 → WP-33: `backend/app/repositories/sqlalchemy/user_repository.py`.
- WP-31 → WP-33: `Alembic single-head revision chain`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**M**: one focused cross-layer root cause or bounded extraction with targeted tests.

Use branch `remediation/wp-33-grading-state` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
