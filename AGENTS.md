# Agent Guidelines & Environment

Use the available system environment for Python and system commands.
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

### 4.3. Documentation ownership and recovery
- These rules apply to planners, orchestrators, auditors and implementation agents, including delegated agy executors.
- Start recovery with `git status`, [the documentation index](docs/README.md), `.taskmaster/tasks/tasks_index.json` and only the active task's record in [ledger.json](docs/redesign-execution/ledger.json). Read [SUBGROUPS.md](docs/redesign-execution/SUBGROUPS.md) for session and ownership boundaries. Do not load every historical audit, result or gallery into context.
- Taskmaster owns task definitions, dependencies and status. The ledger owns saved conversation IDs, current attempts, worktrees, ownership, blockers, accepted commits and evidence pointers. Do not duplicate task descriptions, design specifications, full transcripts or directory inventories in the ledger. Git commits provide changed-file history; record only necessary source changes or contract boundaries.
- The orchestrator alone updates task status and the ledger during delegated work. Executors implement, test, inspect their renders and return a concise result; they do not create plans, tracking documents or audit verdicts unless that is their explicitly assigned task.
- Update status when a task starts, finishes or becomes blocked. Do not write progress documents or change plans after each command, retry or routine check. Keep approved specifications stable; failed implementation must be corrected rather than excused by a plan edit.

### 4.4. Bounded handoffs and evidence
- Use one reusable `handoff.md` per active task. Replace its unresolved correction section on retry; keep the task's acceptance criteria, exact prerequisite sections and allowed scope. Do not create `handoff-02.md`, `handoff-03.md` or append the whole previous conversation. Use readable sentences; do not compress words together.
- The orchestrator maintains one `audit.md` per task with the current PASS/FAIL verdict, concrete unresolved defects and evidence. On acceptance, retain the final criteria, exact checks, evidence links and honest gaps. Do not keep separate audits for each attempt or a report that only repeats this audit.
- Name permitted output paths in every delegation. Executors may create test code and required capture helpers, but documentation/evidence output is restricted to those paths. Return changed files, observed behavior, exact commands/results, screenshots and gaps in the conversation; do not copy a full executor response into another Markdown or JSON file.
- Keep screenshots and probes in one stable `evidence/` directory per task, with `manifest.json`, `probes.json`, a screenshot folder and at most one final log per required check. Replace superseded captures after their successors are verified. Label simulations; preserve original baseline galleries. Existing accepted historical folders may keep their names to avoid broken links.
- Raw executor monitors/results and temporary diagnostics stay in the wrapper's temporary directory or `/tmp`, not committed as numbered project artifacts. Persist the session ID and any unresolved failure facts before cleanup. Never delete active inputs, running logs, user files or the only evidence for an unresolved defect.
- Before completing a task, remove its superseded handoffs, intermediate audits, rejected captures and duplicate logs; verify final evidence links and session recovery information. Use Git history for obsolete retry material, rather than a new archive folder.
- Keep documentation entry points in `docs/README.md` and `docs/redesign-execution/README.md`. Link the final evidence there when useful; do not introduce another tracker. Create a new document only for an authorized specification, reusable contract, required final evidence or explicitly assigned documentation task.

---

### 4.5. Persistent orchestration and executor notifications
- Codex GPT orchestrators must keep the active turn open while authorized executors are running. A final reply ends the turn: a later child completion event can appear in the interface without restarting the orchestrator. This was observed in the Luna notification test; never promise automatic continuation after a final reply.
- Wait for completion, failure, questions or other executor messages through event-aware tools. Short transport waits may be repeated silently; they are not permission to inspect progress repeatedly. Routine status inspection occurs only every 17 minutes, unless the user requests a check or a concrete failure requires earlier diagnosis. Respect the environment's maximum blocking-wait duration.
- On a completion event, read the complete result and audit actual source, tests, screenshots and interactions. On a question or failure, resolve the bounded issue or preserve and report the blocker. Continue corrections and the next dependency-ready task without ending the turn merely because an executor is working or a page finished.
- Finish the orchestration turn only when the authorized scope is complete, the user explicitly asks to stop, or a genuine blocker prevents further useful authorized work. Preserve execution state before any interruption. User messages steer ongoing work unless they cancel it.
- Reuse an executor with the needed context for related tasks and corrections. Save its exact identity and use the appropriate resume mechanism. Never use agy `--continue`, replace a failed conversation to evade review, or silently change the requested model. Native child agents and external agy processes use different completion mechanisms; verify the actual result rather than assuming a missing live-agent entry means success.
- Use multiple executors when dependencies and ownership permit. Isolate implementation in separate worktrees with named branches, exclusive source ownership, locale key boundaries and unique preview/API ports. Keep shared contracts and persistence owners under one writer. Do not advance a dependent page before its prerequisite passes audit; integrate accepted work sequentially and rerun integration gates.
- Handoffs require implementation, meaningful tests, actual rendered self-review and a concise complete result. Self-checking does not replace independent audit. Never accept a SUCCESS label, stale test record, fabricated screenshot, unconditional passing probe or missing report as completion.

### 4.7. GPT-6 Luna audit escalation
- Use GPT-6 Luna medium for the current authorized native implementation workflow. Reuse the same executor for related tasks and corrections within its ownership boundary.
- Count independent FAIL verdicts after complete results per task. Timeouts, incomplete results, questions and infrastructure failures do not count as failed audits.
- After two failed independent audits of the same task implemented by GPT-6 Luna, the orchestrator must take over implementation itself or delegate the remaining correction to GPT-6.1 Sol low. Do not issue a third Luna correction attempt for that task.
- Preserve existing work, executor identities, evidence and unresolved acceptance criteria during escalation. Record the two failures and the new implementation owner in the existing task record; retain the full original scope and verification gates. This user-authorized escalation is an exception to executor reuse, not permission to weaken requirements or replace unavailable sessions silently.

### 4.6. Executor timeouts and unfinished work
- A wrapper timeout or process exit does not establish that the executor finished its task. Empty replies, waiting-only replies and reports of checks still running are incomplete results, regardless of a SUCCESS label.
- Before the executor returns a complete task result, do not inspect its unfinished source, run independent implementation checks, edit its files or issue an audit verdict. Status/result inspection and lifecycle recovery are permitted; routine progress checks remain limited to 17-minute intervals unless the user requests otherwise.
- Preserve the exact conversation or agent identity, requested model, worktree, branch, owned files, active commands and evidence after a timeout. Record the incomplete result and failure facts in the existing task/session record. Keep the task in progress unless an actual external blocker prevents continuation; never mark it completed because its wrapper stopped.
- Resume the same saved agy conversation with `--resume`, or follow up with the same native agent. Never use `--continue`, create a replacement session for a timeout or silently switch models. Use an appropriate bounded continuation timeout and the same reusable handoff, asking the executor to collect existing background checks and return the complete result without restarting completed work or beginning the next page.
- Keep the orchestrator turn active while waiting for the resumed executor. Once it returns a complete result, inspect exit status, errors and permission denials, then independently audit source, required checks and real evidence. Correct failed acceptance criteria in that same session; complete and integrate the task only after PASS.
- If the saved session or requested model is unavailable, preserve the state and report the actual blocker. Do not work around it by discarding the conversation, weakening protections or claiming unfinished work is accepted.
- For this redesign, the user authorized GPT-6 Luna medium native executors from 2026-10-14 onward. Preserve previous agy conversation IDs and unfinished work; reuse each native executor for its related tasks and corrections. All ownership, complete-result, self-check, independent audit and integration gates still apply.

## 5. Development Environment & Tooling

### 5.1. System Environment
- Run commands, installations, and tests in the available system environment. Conda is not required.

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
- After each task passes independent audit and all required gates, integrate its logical commit into `main` and rerun the necessary integration checks before advancing dependent tasks. Keep failed or unfinished work isolated; preserve unrelated user changes.
- Do not `push` or open a PR unless explicitly asked.

### 7.3. Report Honestly
- Report what was actually verified, with the command output. If a step was skipped or a part of the scope was left out, say so explicitly and why.
- Do not describe an implementation approach that was not taken. If the task asked for a window function and a per-item loop was written instead, report the loop.

