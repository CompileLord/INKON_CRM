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
| FIN-1a | Debt reminders backend | SC-1 | `POST /finance/debts/reminders` (bulk), durable worker delivery, localized text, one per student per 24 h (race-safe), audit record, `parent_telegram_linked`/`last_reminder_at` on debts. Executed by Codex. |
| FIN-1b | Debt reminders UI | FIN-1a, UX-5b | "Remind in Telegram" per debtor and bulk on the debtors tab; no parent → disabled with reason; shows last reminder. |
| QA-1 | Full regression | all | Full screenshot pass (same matrix as the 2026-10-19 audit) compared against the audit set, live Telegram walk-through (link, relink, lockout, exam card, debt reminder), full backend and frontend gates on `master`. |

## Gates for every task

- `cd backend && python -m pytest app/tests -q` with the venv first on PATH, on a disposable database (use `docs/redesign-execution/verify-backend.py` when the shared test DB is busy).
- `cd frontend && npm run build` (runs `tsc -b`) and `npx vitest run --maxWorkers=3`.
- i18n parity for every touched namespace; `CONTRACT.md` regenerated after schema changes.
- Screenshots of every touched page in desktop light, desktop dark and mobile, viewed by the executor and re-checked by the orchestrator.
- Expand/contract migrations only, single alembic head.
