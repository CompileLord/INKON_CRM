# Agent Guidelines

Rules for every developer and AI coding agent working on **IMKON CRM** (KITOB). Run commands, installs and tests in the available system environment; Conda is not required.

---

## 1. Architecture

### 1.1. Object-Oriented, SOLID
- All business logic, services and repositories live in classes. No global utility functions.
- Use ABCs and Protocols for abstractions (storage, repositories, mail) so implementations are swappable.
- **S**: one reason to change per class. **O**: extend through interfaces. **L**: implementations fully substitutable. **I**: narrow Protocols. **D**: services depend on repository Protocols, wired with FastAPI `Depends`.

### 1.2. Layers
- **Models**: schema, constraints, relationships only.
- **Repositories**: database operations only. No business rules, validation or HTTP exceptions.
- **Services**: business workflows, transaction boundaries, audits, validation. Database-technology-agnostic.
- **API controllers**: HTTP decoding, Pydantic parsing, authorization checks, responses.

---

## 2. Code Style

- **No code comments.** Names and structure must make them redundant. Exceptions: complex math formulas (e.g. `Sum` aggregation) and cron scheduler offsets.
- Verbose, meaningful names for everything.
- Type hints on every variable declaration, parameter and return value, including test code. Unannotated locals are a defect.
- Pydantic v2 for all payloads and outputs; `extra = "forbid"` on input schemas; phone numbers strictly E.164.

---

## 3. Database

- **No N+1 queries**: use `joinedload`/`selectinload` for relationships.
- Use the planned indexes, including composite and soft-delete indexes such as `(role, is_deleted)`.
- Do heavy math (sums, averages, counters) in SQL with `GROUP BY`/aggregates, not in Python.
- Cache heavy analytics and debtor tables in Redis with a reasonable TTL (about 10 minutes).
- **Optimistic locking**: `version_id_col` on `JournalEntry` and `JournalStudentSummary`; catch `StaleObjectError`, roll back and return `409 Conflict`.
- **Migrations are expand/contract**: rollback runs the previous image against the migrated database. Add nullable columns, tables and indexes first; stop using old columns in a later release; drop them a release after that. Never rename or drop something the deployed release still reads.

---

## 4. Workflow

### 4.1. Branches (IMPORTANT)
- **`main` is protected by convention: merge into `main` only when the user explicitly asks.** Never merge, reset or commit remediation work to `main` on your own initiative.
- **`master` is the integration branch** for the backend remediation. It starts as a copy of local `main`. Accepted work packages are merged into `master`, never `main`. When the whole plan is finished, the user decides when `master` is merged into `main`.
- Work packages use their own branches (`remediation/wp-NN-*`) in separate worktrees under `INKON_CRM-worktrees/`. `master` is checked out in `INKON_CRM-worktrees/master-integration`.
- Never push or open a PR unless explicitly asked. Preserve unrelated uncommitted user changes and other agents' worktrees.

### 4.2. Task tracking
- Redesign tasks: find the target file via `.taskmaster/tasks/tasks_index.json`, set the task to `in_progress` when starting and `completed` only after the code follows these rules and the task's test strategy passes. Process tasks in dependency order and report blockers immediately.
- Backend remediation: `docs/remediation/STATUS.md` is the only execution record, with one concise row per work package. The orchestrator updates it. Task scope lives in `docs/remediation/tasks/WP-NN-*.md`; executors read only `docs/remediation/00-README.md` and their own WP file.
- Start recovery with `git status`, `docs/README.md`, the task index and the active task's ledger record (`docs/redesign-execution/ledger.json`). Do not load every historical audit.

### 4.3. Orchestrators and executors
- The orchestrator plans, delegates, audits and updates status. Executors implement, test and return a concise complete result (changed files, exact commands with exit codes and pass counts, mutation results, honest gaps).
- Audit actual source, tests and evidence; never accept a success label, stale record or unrun check. Failed audits go back to the same executor with concrete defects and a recommendation.
- Keep handoffs and evidence bounded: one reusable handoff per task, no per-attempt report files, raw logs outside Git (`~/.local/state/imkon-remediation/`). Do not create extra tracking documents.
- Isolate concurrent executors in separate worktrees with exclusive file ownership; serialize shared files, migrations and contract generation.
- Tests that drop schemas or flush Redis must only run against disposable PostgreSQL and Redis, never the ordinary services.

### 4.4. Backend remediation pipeline (lead auditors, agy executors, worker branch)
- **Executors** are agy `gemini-3.8-flash-high` runs (see the delegate-to-agy skill), one per work package, each in its own worktree and branch `remediation/wp-NN-*` created from `remediation/worker`. Allowed paths come from the WP file.
- **Lead auditors** are Claude subagents (one per lane of related WPs) that write the handoff, run the agy executors, then audit the diff, rerun the gates and send concrete defects back to the same agy conversation (`--resume`). They never push product code themselves.
- A lead merges a WP into **`remediation/worker`** only after its own audit passes. Worker is the staging branch; it never goes to `main`.
- **Security review**: after the lead's approval, a Claude Sonnet 5.5 low reviewer runs the security-review skill on the WP diff. A security finding blocks the merge to `remediation/worker`.
- **Orchestrator** (top session) audits each worker-approved WP and, if it passes, merges it into `master` and records it in `docs/remediation/STATUS.md`. Merging `master` into `main` happens only when the user asks.
- Worktrees live under `INKON_CRM-worktrees/`. `remediation/worker` is checked out in `backend-remediation-worker`.

---

## 5. Frontend

Each rule is a blocker, not polish.

### 5.1. Translations (three locales)
- Every user-visible string goes through `t()`: no hardcoded Russian, English or Tajik in JSX, attributes or template literals.
- A key added to `en` must be added to `ru` and `tg` in the same change. Locale files: `frontend/src/i18n/locales/{en,ru,tg}/`. Register new namespaces in `frontend/src/i18n/index.ts`.
- Every namespace has a bidirectional parity test mirroring `i18n/journalsParity.test.ts`. One feature's copy stays in one namespace.
- The `t()` fallback argument is not a translation.

### 5.2. Dates, numbers, money
- Dates and times go through `i18n/formatters.ts`; never inline `toLocaleDateString`, `.slice(0, 5)` on times, or a local `formatTime`.
- Numbers that update in place carry `tabular-nums`.
- Money is a decimal string, never a float.

### 5.3. Tokens and theming
- Token classes only (`bg-card`, `bg-cream`, `text-ink`, `text-muted`, `border-border`, ...). No raw hex or arbitrary Tailwind colors.
- Verify both light and dark themes.

### 5.4. Motion
- No motion library. CSS transitions plus the `card-scale-in` keyframe.
- Non-essential animation uses `motion-safe:`. Durations: 150ms `ease-out` for interaction, 200ms for surfaces. Press scale `active:scale-[0.96]`.
- Do not add transition classes to properties that never change.

### 5.5. Every list has four states
Loading (skeleton with the same grid geometry), error (with working retry), empty (translated copy explaining why and what next), loaded. Guard charts on the right condition (e.g. count graded periods, not scheduled ones).

### 5.6. Types and contracts
- The backend contract is the source of truth. After changing a Pydantic response schema run `python backend/scripts/generate_contract.py` and update `frontend/src/lib/*/types.ts` in the same change.
- `as any` is forbidden.
- Before calling an endpoint from a new role's page, read its authorization guard.

### 5.7. `frontend/src/lib/` is gitignored
`.gitignore` contains `lib/`, so changes under `frontend/src/lib/` do not appear in `git status` or `git diff`. Read those files directly and state in reports that they are untracked.

---

## 6. Definition of Done and Git

### 6.1. Done means
1. Backend tests pass: `cd backend && python -m pytest app/tests -q`.
2. Frontend tests pass: `cd frontend && npx vitest run`.
3. Typecheck clean: `cd frontend && npx tsc --noEmit`.
4. i18n parity tests green for every touched namespace.
5. `CONTRACT.md` regenerated if any API schema changed.
6. No `TODO`, placeholder, `test.skip`/`.only`, stub test or unimplemented branch.
7. Every specified behaviour has a test that fails if it regresses; named invariants get their own explicit test.

### 6.2. Commits
- Commit finished, verified work on its task branch; one logical change per commit.
- Conventional Commits with the feature scope, e.g. `feat(journals): ...`, `fix(student): ...`. The body states what changed and why and never claims test results that were not run.
- Never commit secrets, `.env` files, seed credentials, `storage/` uploads or `.omc/` state.
- Integrate accepted work into `master` (see 4.1), not `main`, and rerun the necessary integration checks before starting dependent work.

### 6.3. Report honestly
Report what was actually verified with real command output. Say explicitly when a step was skipped or scope left out, and describe the approach actually taken, not the one planned.
