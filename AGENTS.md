# Agent Guidelines & Environment

In this project, we use the `conda base` environment for Python and system commands.
# Development Rules & Guidelines (RULES.md)

This file contains the strict coding standards, architectural rules, and workflow processes that all developers and AI coding agents (Cursor, Windsurf, Claude Code, etc.) must follow when working on the **IMKON CRM** project.

---

## 1. Architectural Foundations

### 1.1. Full Object-Oriented Programming (OOP)
- All business logic, services, and repositories must be encapsulated within classes. Avoid global utility functions.
- Use class inheritance, abstract base classes (ABCs), Protocols, and polymorphism where appropriate to represent abstractions (e.g., file storage, repositories, mailing services).

### 1.2. SOLID Principles
- **S**ingle Responsibility: Each class must have exactly one reason to change. Separate endpoints (API controllers) from business logic (Services) and database queries (Repositories).
- **O**pen/Closed: Write extension-friendly code. Implement abstract interfaces so that behavior can be replaced (e.g., swapping `LocalStorageService` to `S3StorageService` without touching service logic).
- **L**iskov Substitution: Child implementations must be fully substitutable for their parent contracts.
- **I**nterface Segregation: Define narrow Protocols. Do not force classes to implement methods they do not need.
- **D**ependency Inversion: High-level modules (Services) must not depend on low-level database modules directly. They must depend on Repository Interfaces (Protocols). Implement this using **FastAPI Depends** injection.

### 1.3. Clean Layer Separation
- **Models**: Plain database mappings defining schemas, constraints, and relationships. No business logic here.
- **Repositories**: Exclusively handles database operations (SQL/SQLAlchemy). No business logic, validation, or HTTP exceptions.
- **Services**: Contains business workflows, transactional boundary limits, audits, and validation checks. This layer is database-technology-agnostic.
- **API Controllers**: Exclusively handles HTTP request decoding, schema parsing (Pydantic), endpoint authorization checks, and returning appropriate HTTP responses.

---

## 2. Coding Style & Documentation

### 2.1. Zero Comments Rule (Self-Documenting Code)
- **Do not write code comments.** Code must be so clean, structured, and descriptive that comments are completely redundant.
- Use verbose, meaningful naming conventions for variables, parameters, functions, classes, and tables (e.g., `calculate_student_overall_absence_count` instead of `get_abs`).
- Leverage Python **Type Hints** on all variable declarations, function parameters, and return signatures to make inputs/outputs obvious.
- *Strict Exception*: Code comments are permitted **only** when explaining complex math formulas (like the exact `Sum` aggregation) or cron scheduler offsets.

### 2.2. Robust Typing & Validation
- Enforce Pydantic v2 schemas for all incoming payloads and API outputs.
- Enable `extra = "forbid"` on input schemas to reject unrecognized fields.
- Validate telephone inputs strictly in E.164 formats.

---

## 3. Database & Query Optimization

### 3.1. Query Performance Standards
- **No N+1 queries**: Always use `joinedload` or `selectinload` when querying parent entities with their relationships (e.g., loading courses with schedules or students with summaries).
- **Leverage Indexes**: Utilize the indexing plan defined in the ER diagram (composite indexes on foreign keys, soft delete search fields like `(role, is_deleted)`).
- **Aggregates Optimization**: Perform heavy calculations (averages, sums, metrics counters) directly in SQL queries using `GROUP BY` and DB aggregates instead of pulling lists into Python memory and summing them manually.
- **Materialized or Cached Views**: Keep heavy operations like Financial Analytics and debtor tables cached in Redis with a reasonable TTL (e.g., 10 minutes).

### 3.2. Concurrency & Integrity
- **Optimistic Locking**: Always apply optimistic concurrency checks using SQLAlchemy `version_id_col` for critical update paths (`JournalEntry` and `JournalStudentSummary`).
- **Graceful Concurrency Failure**: Catch `StaleObjectError` concurrency conflicts during transactional commits, rollback, and raise a `409 Conflict` HTTP exception.

---

## 4. AI-Agent Workflow & Task Tracking

All AI coding assistants must follow this workflow to maintain project synchronization:

### 4.1. Task Status Updates (CRITICAL)
- Before starting any coding work, open `.taskmaster/tasks/tasks_index.json` to find the correct `tasks_X.json` target file.
- When starting a task, update its status in the JSON file to `"in_progress"`.
- When a task is completed, you **must** update its status from `"in_progress"` to `"completed"` in the respective `tasks_X.json` file.
- Do not mark a task as `"completed"` until:
  1. The code is written and follows all rules in this `RULES.md` document.
  2. The specific test strategy defined in the task is executed and passes successfully.

### 4.2. Sequential execution
- Always process tasks in order of their dependencies. Do not jump to Task 19 before Task 3 is completed.
- If a blocker is encountered, report it immediately, but keep other completed tasks marked as `"completed"`.

---

## 5. Development Environment & Tooling

### 5.1. Conda Environment
- **Conda Base**: In this project, we use the `conda base` environment. Do not create, activate, or use a custom conda or Python virtual environment (`venv`). All commands, installations, and testing must run using the default conda `base` environment.

---

## 6. Frontend Rules

These are the things that get forgotten most often. Treat each one as a blocker, not a polish item.

### 6.1. Translations Are Mandatory (Three Locales)
- Every user-visible string goes through `t()`. **No hardcoded Russian, English or Tajik in JSX** — not in headings, not in badges, not in `title`/`aria-label`/`placeholder` attributes, and not inside template literals (`` `${rank} из ${total}` `` is a defect; use `t("of")`).
- A key added to `en` **must** be added to `ru` and `tg` in the same change. One locale out of three is a broken build for two thirds of the users.
- Locale files live in `frontend/src/i18n/locales/{en,ru,tg}/`. A new namespace must be registered in `frontend/src/i18n/index.ts` — creating the JSON file is not enough.
- Every namespace needs a parity test mirroring `i18n/journalsParity.test.ts`. Prefer **bidirectional** parity (en→ru/tg *and* ru/tg→en) so stray keys are caught too.
- Do not scatter one feature's copy across unrelated namespaces to avoid creating a new one.
- The `t()` fallback argument is a development aid, **not** a translation. Shipping `t("myScore", "Мой балл")` with no `myScore` key in the JSON is the same defect as hardcoding.

### 6.2. Dates, Times, Numbers, Money
- Dates and times go through `i18n/formatters.ts` (`formatDate`, `formatDateTime`, `formatTime`, `getActiveLocale`). Never `toLocaleDateString` inline, never `.slice(0, 5)` on a time string, never a local `function formatTime` inside a page.
- Any number that updates in place (scores, percentages, counts, currency) carries `tabular-nums`, or the layout twitches on refetch.
- **Money is a decimal string, never a number.** Do not parse it into a float for display or arithmetic.

### 6.3. Design Tokens & Theming
- Use token classes only: `bg-card`, `bg-cream`, `bg-strip`, `bg-beige`, `bg-row-hover`, `text-ink`, `text-muted`, `text-nav`, `text-label`, `border-border`, `border-border-warm`. **No raw hex, no arbitrary Tailwind colors** for surfaces or text.
- Both light and dark values exist for every token. A change verified in only one theme is not finished — check both, including semantic accents (`text-maroon dark:text-accent`).

### 6.4. Motion
- **No motion library.** `framer-motion` is not a dependency and must not become one. Motion is CSS transitions plus the `card-scale-in` keyframe in `index.css`.
- Reduced motion is handled with Tailwind's `motion-safe:` prefix (see `Modal.tsx`), not a global media query. Every non-essential animation carries it.
- Two durations only: **150ms** `ease-out` for interactive state, **200ms** for surfaces. Press scale of record is `active:scale-[0.96]`.
- Do not attach a `motion-safe:transition-*` class to an element that never changes that property — it reads as implemented motion when nothing moves.

### 6.5. Every List Has Four States
"It renders when data exists" is not a finished screen. Each data-driven view ships:
1. **Loading** — skeleton in the *same grid geometry* as the loaded content, so nothing jumps.
2. **Error** — with a working retry button.
3. **Empty** — with copy that tells the user *why* it is empty and what happens next, translated in all three locales.
4. **Loaded**.

Guard on the right condition: an "at least 2 data points" chart must count *graded* periods, not scheduled ones.

### 6.6. Types & Contract Synchronization
- The backend contract is the source of truth. After changing any Pydantic response schema, regenerate with `python backend/scripts/generate_contract.py` and update the matching TypeScript interfaces in `frontend/src/lib/*/types.ts` **in the same change**.
- **`as any` is forbidden.** If a cast seems necessary, the type is wrong — fix the type. A cast makes `tsc --noEmit` pass while the runtime shape is mismatched, which is worse than a red build.
- Before calling an endpoint from a new role's page, **read that endpoint's authorization guard**. A page that renders a mentor chip by calling a superadmin-only endpoint is silently broken for the role it was built for.

### 6.7. `frontend/src/lib/` Is Gitignored (Known Trap)
- `.gitignore` contains `lib/` (intended for Python build artifacts), which also matches `frontend/src/lib/`. Changes to `lib/**/types.ts`, `hooks.ts`, `endpoints.ts` and `auth/roleAccess.ts` **will not appear in `git status` or `git diff`**.
- Never conclude "that file wasn't changed" from `git status` alone for anything under `frontend/src/lib/`. Read the file.
- When reporting completed work, verify these files by reading them, and state that they are untracked.

---

## 7. Definition of Done & Git Commit Protocol

### 7.1. Definition of Done
A task is not complete until all of the following are true:
1. Backend tests pass — `cd backend && python -m pytest app/tests -q`.
2. Frontend tests pass — `cd frontend && npx vitest run`.
3. Typecheck is clean — `cd frontend && npx tsc --noEmit`.
4. i18n parity tests are green for every touched namespace.
5. `CONTRACT.md` is regenerated if any API schema changed.
6. No `TODO`, no placeholder, no `test.skip`/`.only`, no stub test, no unimplemented branch in the changed files.
7. **Every behaviour the task specified has a test that would fail if the behaviour regressed.** Asserting that a key is present in a response is not a test of the rule that produced it. Where a task names a specific invariant (a privacy boundary, a bucketing rule, a ranking computation), that invariant gets its own explicit test.

### 7.2. Commit When the Job Is Done
- **When a task is finished and verified per §7.1, commit the changes.** Do not leave completed work sitting in the working tree.
- One logical change per commit. Do not bundle unrelated work into a feature commit — an unrelated schema or security change hidden inside a UI commit is invisible to review.
- Use Conventional Commits, matching the existing history:
  ```
  feat(journals): implement autosave and partial batch update contract
  fix(student): exclude ungraded periods from average calculation
  ```
  Scope is the feature area (`journals`, `student`, `courses`, `finance`, `i18n`, `auth`).
- The commit body states what changed and why; do not claim test results that were not actually run.
- Do not commit secrets, `.env` files, seed credentials, `storage/` uploads, or `.omc/` state.
- Do not `push` or open a PR unless explicitly asked.

### 7.3. Report Honestly
- Report what was actually verified, with the command output. If a step was skipped or a part of the scope was left out, say so explicitly and why.
- Do not describe an implementation approach that was not taken. If the task asked for a window function and a per-item loop was written instead, report the loop.

