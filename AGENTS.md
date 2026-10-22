# Agent Guidelines

Rules for every developer and AI coding agent working on **IMKON CRM** (KITOB).

---

## 1. Architecture

- All business logic, services and repositories live in classes. No global utility functions.
- SOLID. Abstractions (storage, repositories, mail) are ABCs or narrow Protocols. Services depend on repository Protocols, wired with FastAPI `Depends`.
- Layers:
  - **Models** hold schema, constraints and relationships only.
  - **Repositories** do database operations only. No business rules, validation or HTTP exceptions.
  - **Services** handle workflows, transaction boundaries, audits and validation, and stay database-technology-agnostic.
  - **API controllers** handle HTTP decoding, Pydantic parsing, authorization checks and responses.

## 2. Code Style

- **No code comments.** Exceptions: complex math formulas and cron scheduler offsets.
- Use verbose, meaningful names.
- Type hints go on every variable, parameter and return value, including in tests. An unannotated local is a defect.
- Use Pydantic v2 for all payloads and outputs, with `extra = "forbid"` on input schemas. Phone numbers are strictly E.164.

## 3. Database

- No N+1 queries: use `joinedload`/`selectinload`. Use the planned indexes, including soft-delete composites such as `(role, is_deleted)`.
- Do sums, averages and counters in SQL with aggregates. Cache heavy analytics and debtor tables in Redis (TTL about 10 minutes).
- Optimistic locking: `JournalEntry` and `JournalStudentSummary` use `version_id_col`. On `StaleObjectError`, roll back and return `409 Conflict`.
- Migrations are expand/contract, because the previous image must run against the migrated database:
  1. Add nullable columns, tables and indexes first.
  2. Stop reading old columns in a later release.
  3. Drop them a release after that.
- Keep a single Alembic head.

## 4. Workflow

### 4.1. Branches
- **Never merge, commit or reset onto `main` unless the user explicitly asks.**
- `master` is the integration branch, checked out in `INKON_CRM-worktrees/master-integration`. Accepted work merges into `master`. The user decides when `master` goes to `main`.
- Each task gets its own branch in its own worktree under `INKON_CRM-worktrees/`. Remove the worktree after merging.
- Never push or open a PR unless asked. Preserve unrelated uncommitted user changes and other agents' worktrees.

### 4.2. Delegation
- The orchestrator plans, delegates, audits and updates status; executors implement and test. Audit the real diff, tests and screenshots, never a success label. Failed audits go back to the same executor with concrete defects.
- **Every handoff starts with the user's requested outcomes, restated clearly in plain words**: what to change, where, and what it should look like when done. A file path to read can follow for environment, checks and commit details. It never replaces the outcomes.
- Subagents cannot see images the user pastes. Describe each screenshot in words: which page and element it shows, and what is wrong with it. Forward user messages that arrive mid-run the same way.
- Backend remediation is tracked only in `docs/remediation/STATUS.md`, with one row per work package, updated by the orchestrator. Task scope lives in `docs/remediation/tasks/WP-NN-*.md`.
- Concurrent executors use separate worktrees with exclusive file ownership. Serialize migrations, shared files and contract generation.
- Keep raw logs out of Git, in `~/.local/state/imkon-remediation/`.

### 4.3. Test environment
- Tests that drop schemas or flush Redis run only against a disposable PostgreSQL and Redis pod, never the ordinary local services.
- Move a worktree's real `backend/.env` aside before tests and restore it afterwards.
- Never call real SMS, SMTP or Telegram from tests.
- Production runs Python 3.12; run the backend suite on 3.12.

## 5. Frontend

Each rule is a blocker, not polish.

- **Translations:**
  - Every user-visible string goes through `t()`.
  - A key added to `en` is added to `ru` and `tg` in the same change (`frontend/src/i18n/locales/{en,ru,tg}/`).
  - New namespaces are registered in `i18n/index.ts` and get a parity test like `i18n/journalsParity.test.ts`.
  - A `t()` fallback is not a translation.
- **Formatting:** dates, times and numbers go through `i18n/formatters.ts`. Numbers that update in place get `tabular-nums`. Money is a decimal string, never a float.
- **Theming:** token classes only (`bg-card`, `text-ink`, `text-muted`, `border-border`, ...), no raw hex. Check light and dark.
- **Motion:** no motion library; use CSS transitions plus `card-scale-in`. Use `motion-safe:` for non-essential motion. Interactions take 150ms `ease-out`, surfaces take 200ms, and presses use `active:scale-[0.96]`.
- **Lists** have four states:
  - loading (a skeleton with the same geometry)
  - error (with a working retry)
  - empty (translated why plus what next)
  - loaded

  Guard charts on the right condition (graded periods, not scheduled ones).
- **Minimal UI:** no repeated text, no redundant labels or values, compact spacing. Show a value once in the right place, for example a maximum in the column header instead of on every row.
- **Contracts:** the backend contract is the source of truth. After changing a response schema, run `python backend/scripts/generate_contract.py` and update `frontend/src/lib/*/types.ts` in the same change. `as any` is forbidden. Read an endpoint's authorization guard before calling it from a new role's page.

## 6. Definition of Done and Git

1. Backend: `python -m pytest app/tests -q` from `backend/`, against the disposable pod (§4.3).
2. Frontend: `npx vitest run` and `npx tsc -p tsconfig.app.json --noEmit` from `frontend/`. Plain `tsc --noEmit` checks nothing here.
3. `CONTRACT.md` is regenerated if any API schema changed.
4. No `TODO`, placeholder, `test.skip`/`.only` or stub. Every specified behaviour has a test that fails if it regresses.
5. Conventional Commits with a feature scope (`fix(student): ...`), one logical change per commit. The body says what changed and why, and never claims tests that were not run.
6. Never commit secrets, `.env` files, seed credentials, `storage/` uploads or `.omc/` state.
7. Report honestly: real command output. Say what was skipped and which approach was actually taken.
