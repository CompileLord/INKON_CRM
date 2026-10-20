# KITOB UX Overhaul Plan

Integration branch: `master` (worktree `INKON_CRM-worktrees/master-integration`). Each task runs on its own branch `kitob/<task-id>-<slug>` in `INKON_CRM-worktrees/<task-id>`, cut from current `master`, and is merged by the orchestrator after audit. `main` is untouched. Execution status lives only in `STATUS.md` next to this file. Backend tasks are delegated to Codex (gpt-6.1-sol, medium); if Codex hits its usage limit they fall back to a Sonnet 5.5 executor. Frontend tasks use Sonnet 5.5 executors.

## Decisions (user-approved defaults, 2026-10-19)

- Score is the primary grade value everywhere; percentage is a secondary hint, kept only for attendance, cross-course comparison and the at-risk rule.
- Period maximum = lessons × 5 (homework) + lessons × 1 (attendance) + exam max + bonus max. Bonus max defaults to 20 and is configurable per journal. Existing bonuses above the new limit are kept and listed for the user, never clipped.
- Telegram parent-link failed-attempt limit: 20 per hour globally, 5 per hour per chat, 72-hour code validity.
- The student-facing ranking table of other students is removed; a student sees only their own results.
- Courses without a photo show a small coloured initial tile instead of a placeholder banner.
- Visual direction: quiet, typography-led, one accent colour, one border style, no decoration that carries no information.

## Shared design rules (enforced from UX-5a onward)

1. One `PageContainer` width and gutter on every page.
2. One `PageHeader` (title, optional count, actions). No title icons, no subtitles that restate the title.
3. One `EntityHeader` for course, student and mentor detail pages.
4. One `Tabs` component (underline style, active tab in `?tab=`); Settings uses the same component in vertical orientation.
5. One `StatGroup`/`StatTile`: single card with dividers, normal-case labels, `tabular-nums` values, missing value is a muted "—" without a sentence.
6. One `SectionCard`; no card nested in a card.
7. `ListRow`/`DataTable`: the whole row is the link, secondary actions in one ⋯ `Menu`.
8. Custom `Select` and `DatePicker` (dd.MM.yyyy) instead of native controls.
9. One `Badge` vocabulary for statuses (singular forms).
10. `EmptyState`, `ErrorState` (with retry) and a real `NotFound` page.
11. At most one icon per section header; icons only where they aid scanning (navigation, file types, statuses).
12. Info tooltips only for real formulas (score, debt); at most one per page.
13. No raw database values, enum keys or ISO timestamps in the UI.
14. Period names translated (Неделя 1 / Месяц 1, Ҳафтаи 1 / Моҳи 1, Week 1 / Month 1).
15. One link colour (brand blue) and at most one primary button per view.

Guard tests fail when a page outside `components/ui` defines its own `role="tablist"`, its own stat-tile markup, a native `<select>`/`<input type="date">`, or a page-level max-width.

## Tasks

| ID | Title | Depends on | Scope |
|---|---|---|---|
| BE-3 | Exam results to parents | — | Debounced 4 h after last exam edit; SVG → PNG card in the parent's language via Telegram; skip without a linked parent. Running. |
| SC-1 | Score-first backend | — | `ScoringPolicy` class in `core/scoring.py` with the formula above; nullable `bonus_max_score` on journals (default 20) and period-settings API field; bonus/exam above max rejected (422); data migration recomputing stored `max_period_score`; report of existing over-limit bonuses; add `total_score`, `total_max_score`, `class_avg_score` (and similar) where responses only carry percentages; Telegram global failed limit 20/h; contract regenerated; frontend `lib` types updated. No UI redesign. |
| UX-5a | Design system primitives | — | Components listed in the rules, `NotFound`/route `errorElement`, `/dev/ui` showcase (dev only), guard tests, i18n for shared copy, period-name translation helper. Migrates no pages except the 404 route. |
| UX-5b | Admin list pages | UX-5a, SC-1 | Login, admin dashboard, courses (grid, list view fix, initial tile, create/edit form with custom Select/DatePicker), journals hub, students list, mentors list, finance (all tabs, accept-payment dialog primary button), audit (human wording per entity type, grouped duplicates, filter row), notifications, settings. Score-first values where shown. |
| UX-5c | Detail pages | UX-5a, SC-1 | Course profile (overview with one schedule summary line, students, performance without empty "Сводка" column, score-first), student profile (UX-4: compact header, parent-link popover, ⋯ menu, three distinct tiles incl. balance, course cards, progress, documents), mentor profile (plain-language performance tab). |
| UX-5d | Mentor and student experience | UX-5a, SC-1 | Mentor dashboard; student dashboard, my courses, course detail (ranking table removed, score-first, translated period names), journal period page; journal detail page restyle onto shared primitives, mobile grid opening at the first lesson column, chart score axis with per-period max step line. |
| BE-4 | Student privacy on the server | — | `GET /courses/{id}/class-progress` and the student class journal return only the caller's rows plus class aggregates; tests prove no classmate id or name appears. Codex. |
| FIN-1a | Debt reminders backend | SC-1 | `POST /finance/debts/reminders` (bulk), durable worker delivery, localized text, one per student per 24 h (race-safe), audit record, `parent_telegram_linked`/`last_reminder_at` on debts. Executed by Codex. |
| FIN-1b | Debt reminders UI | FIN-1a, UX-5b | "Remind in Telegram" per debtor and bulk on the debtors tab; no parent → disabled with reason; shows last reminder. |
| FE-R34 | Synchronize course chart contracts | WP-34 backend, UX-5c/UX-5d | Role-specific nullable chart types, endpoint union and contract fixtures; details below. |
| FE-R35 | Bound journal autosave batches and comments | WP-35 backend candidate, UX-2/UX-5d | Queue batches of at most 250 unique cells, 1000-code-point comments, preserved drafts/retries; release prerequisite. |
| FE-R40 | Migrate student history consumers to bounded APIs | WP-40 backend contract, FE-R34, UX-5c/UX-5d | Coordinate paging and bounded summaries before endpoint retirement; details below. |
| QA-1 | Full regression | all | Full screenshot pass (same matrix as the 2026-10-19 audit) compared against the audit set, live Telegram walk-through (link, relink, lockout, exam card, debt reminder), full backend and frontend gates on `master`. |

## Gates for every task

- `cd backend && python -m pytest app/tests -q` with the venv first on PATH, on a disposable database (use `docs/redesign-execution/verify-backend.py` when the shared test DB is busy).
- `cd frontend && npm run build` (runs `tsc -b`) and `npx vitest run --maxWorkers=3`.
- i18n parity for every touched namespace; `CONTRACT.md` regenerated after schema changes.
- Screenshots of every touched page in desktop light, desktop dark and mobile, viewed by the executor and re-checked by the orchestrator.
- Expand/contract migrations only, single alembic head.

## Backend remediation frontend handoff (2026-10-20)

The existing frontend owner executes these tasks on separate work branches. Coordinate files already owned by UX-5c/UX-5d and UX-2; do not overwrite their changes. Backend remediation status remains in `../remediation/STATUS.md`; these frontend tasks stay pending until their own checks pass. QA-1 includes all three tasks.

### FE-R34 — Course chart contract synchronization

Backend WP-34 is integrated (`9a2afe9`). Read the current chart endpoint and `CONTRACT.md` before implementation; the staff-progress and class-progress endpoints retain their existing semantics.

- Update `frontend/src/lib/courses/types.ts`, `endpoints.ts`, `endpoints.test.ts` and affected hooks/consumers. The chart endpoint must return a typed staff-or-student union rather than always a staff response.
- Chart arrays contain `number | null`; preserve graded zero as zero and missing, unknown, ungraded, upcoming or ineligible ratios as null. Synchronize `grading_states` (`missing`, `ungraded`, `unknown`, `graded`, `upcoming`), `graded_periods_count` and `eligible_periods_count` with the actual role-specific response.
- Staff responses require period metadata, `class_avg_series` and `class_eligible_counts`. Student responses carry only the caller's series and own metadata, with nullable rank. Preserve period alignment and the trailing class-average series where specified; never assume all datasets describe identified students.
- Tests must cover complete staff and student fixtures, null versus zero, zero eligible periods, unranked results, future periods and privacy. Render gaps without inventing zero scores; rank null is unavailable. Do not add peer rows to student views.
- The chart endpoint had no production callers at handoff; verify current callers before changing visible charts. Do not change existing score-first views merely because their mock mentions the chart endpoint.

### FE-R35 — Autosave compatibility before backend release

The WP-35 backend candidate passed 1173 tests, but is not released or accepted as a complete package. Its top-level array accepts 0–250 unique normalized `(student_id, lesson_date)` cells, nullable comments of at most 1000 Unicode code points, and at most 4,194,304 actual body bytes. All duplicate keys return 422, including identical duplicates; oversize bodies return 413 before JSON decoding. Empty arrays remain no-ops.

- Primary paths: `frontend/src/lib/journals/JournalQueueOwner.ts` (`runCycles`/`sendEntries`), its queue/store tests, and `frontend/src/components/journals/JournalCommentEditor.tsx` plus editor tests. Verify the current queue owner; changing only the old `useJournalAutosave.ts` wrapper is insufficient.
- Claim/send at most 250 unique cells per request, drain remaining cells in subsequent bounded requests, and preserve ownership, versions, idempotent replay, edits arriving during a request and partial-conflict handling. Never drop unsent drafts or acknowledge cells that were not applied.
- Enforce the comment limit without silent truncation. JavaScript `maxLength` counts UTF-16 units; use Unicode code-point counting consistent with the backend, including emoji. Add any validation copy through all en/ru/tg locales with parity tests.
- The current queue retains 413/422 failures for manual retry and does not split them automatically. Verify that supported drafts avoid these failures; permanent-error recovery must preserve drafts and offer a working correction/retry flow.
- Required regressions: 251 and 501 distinct queued cells produce bounded requests and eventually save every cell; duplicate-key edits coalesce safely before transport; partial conflict and a new edit during draining retain the correct draft/version; failure/retry loses no cells; 1000-code-point comments pass and 1001 fail, including astral emoji. Confirm the largest supported escaped-comment batch fits the byte cap.

### FE-R40 — Student history paging and bounded summaries

WP-40 is not implemented; finalize the backend contract and consumer behavior together before frontend implementation. The legacy history response currently materializes lifetime history. A first-page-only replacement would silently change dashboards and charts; fetching every page automatically recreates the original problem.

- Planned paths include `frontend/src/lib/users/{types,endpoints,hooks}.ts`, endpoint tests, `frontend/src/pages/student/{MyCourses,MyCourseDetail}.tsx`, `frontend/src/components/dashboard/StudentDashboard.tsx` and `frontend/src/lib/students/useStudentProgressSeries.ts` (used by `StudentProgressPanel`). Include actual profile, dashboard, student-learning and progress tests discovered from these callers.
- Use an explicitly paged API with a capped limit and stable `(period_start DESC, id DESC)` cursor. Bind cursors to the student/course filter; coordinate the explicit unauthorized-course response with the backend. Do not silently truncate the legacy array contract.
- Provide visible history navigation and completeness semantics. Dashboard latest-started-period selection, per-course card summaries and profile chart summaries need bounded purpose-specific queries where paging alone cannot preserve their behavior. Preserve explicit grading state, future-period semantics and caller-only privacy.
- Test tied-date page boundaries without duplicates/skips, filter changes and cursor reset, denied course filters, loading/error/retry/empty/loaded states, summary correctness when the relevant period is outside page one, and bounded requests independent of lifetime history size. Retire legacy callers only after all consumers are migrated.

For these tasks run the existing frontend gates, `npx tsc --noEmit`, touched-locale parity and relevant contract/queue tests. Verify light/dark/mobile for visible changes. `frontend/src/lib/` is broadly gitignored: inspect actual changes and explicitly stage intended files. Do not claim backend deployment, frontend completion or an unrun gate from this handoff.
