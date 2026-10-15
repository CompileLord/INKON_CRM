# WP-49 — Reject misspelled settings and normalize phone inputs

Phase **3** · Priority **Medium** · Effort **S** · Status **todo**

## Goal

Reject misspelled settings and normalize phone inputs. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.

## Why it matters

- **API-12** (Optional:): Optional: Align settings and phone validation with the project's declared input rules. [API-12 — report section](../../backendcodequalityaudit/01-api-layer-audit.md#api-12--optional-align-settings-and-phone-validation-with-the-projects-declared-input-rules). Verification: Confirmed cited source mechanism and surrounding call path; static review, not a newly executed integration/load test.

Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.

## Exact files and lines

### Allowed writes

| File | Snapshot location / intent |
|---|---|
| [backend/app/schemas/org_settings.py:15](../../../backend/app/schemas/org_settings.py) | Existing file, anchor line 15; only this WP’s stated behavior may change. |
| [backend/app/schemas/user.py:14](../../../backend/app/schemas/user.py) | Existing file, anchor line 14; only this WP’s stated behavior may change. |
| [backend/app/schemas/common.py:7](../../../backend/app/schemas/common.py) | Existing file, anchor line 7; only this WP’s stated behavior may change. |
| [frontend/src/lib/users/types.ts:1](../../../frontend/src/lib/users/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [frontend/src/lib/settings/types.ts:1](../../../frontend/src/lib/settings/types.ts) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [CONTRACT.md:1](../../../CONTRACT.md) | Existing file, anchor line 1; only this WP’s stated behavior may change. |
| [backend/app/tests/integration/test_remediation_wp49.py](../../../backend/app/tests/integration/test_remediation_wp49.py) | NEW file, no existing line number; exact creation path authorized by this WP. |
| [docs/remediation/STATUS.md](../STATUS.md) | Shared execution record; orchestrator updates only this WP’s concise row with results, blockers and external evidence paths. No separate report. |

Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.

### Verified source evidence and read-only context

- [backend/app/schemas/org_settings.py:15–18](../../../backend/app/schemas/org_settings.py) — current source range checked during planning. Context does not grant write ownership.
- [backend/app/schemas/user.py:14–16,26–28,37–39](../../../backend/app/schemas/user.py) — current source range checked during planning. Context does not grant write ownership.
- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.

Snapshot excerpt from `backend/app/schemas/org_settings.py`:

```text
15: class OrgSettingsUpdate(BaseModel):
16:     org_name: Optional[str] = Field(None, min_length=1, max_length=255)
17:     notify_payments: Optional[bool] = None
18:     notify_debts: Optional[bool] = None
```

## Step-by-step change

1. Add extra=forbid to organization update input.
2. Share a canonical E.164 boundary type/normalizer producing a leading plus, and plan legacy stored-value normalization without silently breaking guardian matches.

## Tests to write BEFORE the fix

- Unknown setting keys fail; canonical phones, missing plus, malformed symbols and equivalent historical values follow one documented policy; guardian lookup tests stay green.

Put new targeted tests in `backend/app/tests/integration/test_remediation_wp49.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant.

## Acceptance criteria

Silent settings typos and inconsistent accepted phone representations are removed.

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

Regenerate contract with `python backend/scripts/generate_contract.py` from repository root in the isolated test environment; synchronize only the listed client types/callers and verify them by reading their contents (frontend/src/lib is broadly gitignored). New visible text must use existing translations or stop to add exact locale paths to the plan.

## Risks and rollback

Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.

## Dependencies and execution order

Functional prerequisites: WP-15, WP-41.

Required shared-file / migration ordering:
- WP-41 → WP-49: `backend/app/schemas/user.py`, `frontend/src/lib/users/types.ts`, `CONTRACT.md`.
- WP-24 → WP-49: `backend/app/schemas/common.py`.

Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.

## Effort and completion

**S**: localized change or narrowly scoped evidence collection.

Use branch `remediation/wp-49-input-consistency` and one PR for this WP. Update only this WP’s row in `docs/remediation/STATUS.md` with concise actual results, blockers and external evidence paths. No push/PR publication occurs in this planning task.
