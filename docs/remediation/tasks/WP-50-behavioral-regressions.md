# WP-50 — Replace weak regression assertions with adversarial fixtures

Phase **3** · Priority **Medium** · Effort **S** · Status **todo**

## Goal

Replace weak regression assertions with adversarial fixtures. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **API-09** (Required (no prefix)): Several regression tests do not exercise the invariant they claim. [API-09 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-09--several-regression-tests-do-not-exercise-the-invariant-they-claim). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/tests/integration/test_student_cabinet_backend.py:119](../../../backend/app/tests/integration/test_student_cabinet_backend.py) | Existing file, anchor line 119; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_coverage_gaps.py:30](../../../backend/app/tests/integration/test_coverage_gaps.py) | Existing file, anchor line 30; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_documents.py:56](../../../backend/app/tests/integration/test_documents.py) | Existing file, anchor line 56; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp50.py](../../../backend/app/tests/integration/test_remediation_wp50.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/tests/integration/test_student_cabinet_backend.py:119–156,159–206](../../../backend/app/tests/integration/test_student_cabinet_backend.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/tests/integration/test_coverage_gaps.py:30–37,41–52](../../../backend/app/tests/integration/test_coverage_gaps.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/tests/integration/test_documents.py:56–70](../../../backend/app/tests/integration/test_documents.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/tests/integration/test_student_cabinet_backend.py`:

```text
119: async def test_student_course_bucket_rule_and_rank_computation(
120:     client: AsyncClient,
121:     test_admin: User,
122:     test_mentor: User,
123:     test_student: User,
124:     db_session: AsyncSession,
125: ):
126:     """Test active vs archive bucket logic (§1.1) and rank calculation with ungraded period exclusion."""
```

## Step-by-step change

1. Seed distinct peers/documents and archived/withdrawn enrollment states; assert identifiers excluded and exact grading/rank values.
2. Test refresh after logout using the actual rotated token and schema-valid invalid reset tokens plus successful reset/replay. Replace broad status alternatives with the precise fixture outcome.

## Tests to write BEFORE the fix

- Each corrected assertion must fail against the pre-fix behavior or an isolated deliberate wrong-result double; no source mutation is required. Confirm tests exercise domain logic rather than fail early on invalid payload shape.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp50.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Claimed privacy, rank, bucket, logout and reset invariants each have explicit behavior assertions.

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

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-03, WP-04, WP-17, WP-34, WP-40.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**S**: localized change or narrowly scoped evidence collection.

Use branch `remediation/wp-50-behavioral-regressions` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
