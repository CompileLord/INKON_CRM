# Mentor Cabinet — Defects, Structure and Interface Plan

Status: planned, not implemented.

Scope: the mentor's own working surface — `/` (`MentorDashboard`), `/courses`, `/journals`,
`/journals/:id`, and the grading grid. Touches
`components/dashboard/MentorDashboard.tsx`, `pages/Journals.tsx`, `pages/JournalDetail.tsx`,
`components/journals/*` (8 files), `components/courses/CoursesStatsStrip.tsx`, and backend
`api/v1/{courses,mentors}.py` + `services/journal_service.py`.

**Not in scope:** the admin's mentor-management pages (`pages/Mentors.tsx`,
`components/mentors/MentorsTable.tsx`, `MentorFormPanel.tsx`) and `pages/MentorProfile.tsx`.
Those manage mentors; this plan is about the surface mentors work in.

Audience: the agent implementing this. Read §0–§2 before editing anything.

---

## 0. Context the implementer needs

- **Tailwind v4, no config file.** There is no `tailwind.config.*` and no `postcss.config.*`.
  `src/index.css` is the entire design system: `@import "tailwindcss"` plus one `@theme` block
  (`index.css:3-26`). A color utility exists **only** if its `--color-*` key is in that block.
- **Defined color keys, exhaustively:** `cream, card, border, border-warm, maroon, maroon-dark,
  ink, muted, beige, beige-dark, banner-from, banner-to, strip, event-border, dot-gray, accent,
  accent-dark, row-hover, nav, nav-hover, label`. Nothing else.
- **No motion library.** CSS transitions plus the one keyframe `card-scale-in` (`index.css:145`).
- **Reduced motion via Tailwind's `motion-safe:` prefix** (`Modal.tsx:36` is the precedent).
- **Press-scale of record `0.96`** (`Button.tsx:29`). 150ms `ease-out` for interactive state,
  200ms for surfaces (`SlideOver.tsx:32,42`). No third duration.
- **Three locales are mandatory** (`en`, `ru`, `tg`) with a parity test at
  `i18n/journalsParity.test.ts`.
- **Journal entries are created lazily.** `journal_generation_service.generate_journals` creates
  only `Journal` (period) rows. `JournalEntry` rows appear on first save via
  `batch_update_entries`. This is the foundation of §3.1.
- **Optimistic locking is live.** `JournalEntry` and `JournalStudentSummary` both carry
  `version_id_col` (`models/journal_entry.py:29-31`). Conflict handling already exists in
  `useJournalAutosave` — do not disturb it.

---

## 1. Settled decisions

Asked and answered. Do not relitigate.

1. **Rewrite the journal components to IMKON tokens** (§2.1). One design vocabulary in the
   codebase. No aliases added to `@theme`.
2. **The mentor dashboard is organized around the ungraded work queue** (§4.1). Today's schedule
   and at-risk students are secondary blocks, not co-equal columns.
3. **Price and commercial data come out of mentor views** (§4.1.3). UI decision only — the API
   still returns `price`; nothing about access control changes.
4. **Keep the all-periods accordion, fix its summaries** (§4.3). Collapsed rows must show real
   data. No one-period-per-screen rewrite.

---

## 2. Defects to fix

These are the bulk of the value. Each is verified, with evidence. Do these before any new feature.

### 2.1 73 inert style classes, all in the mentor's grading surface

The journal components are written against shadcn's palette. Per §0, none of these keys exist, so
Tailwind generates **no utility at all** and the class does nothing:

| File | Count |
|---|---|
| `pages/JournalDetail.tsx` | 21 |
| `components/journals/JournalScoreChart.tsx` | 13 |
| `components/journals/JournalScoreCell.tsx` | 10 |
| `components/journals/JournalPeriodSection.tsx` | 7 |
| `components/journals/ExamWeightModal.tsx` | 7 |
| `components/journals/JournalGrid.tsx` | 6 |
| `components/journals/JournalStudentRow.tsx` | 5 |
| `components/journals/JournalSaveStatus.tsx` | 4 |

Confirmed visible consequences:

- `JournalDetail.tsx:122` — sticky header is `bg-background/95 backdrop-blur` with **no background
  color**, so grid rows scroll visibly underneath it.
- `JournalDetail.tsx:153,165,177,189` — metric-tile icon chips (`bg-primary/10 text-primary` and
  friends) render with no chip and no color.
- `JournalPeriodSection.tsx:143` — `text-destructive` error text is not red.
- Every `text-muted-foreground` label inherits body color, flattening the label/value hierarchy in
  all four metric tiles and both grid captions.

**Mapping to apply.** Mechanical, one pass over the 8 files:

| Replace | With | Note |
|---|---|---|
| `bg-background`, `bg-background/95` | `bg-cream`, `bg-cream/95` | page surface |
| `text-foreground` | `text-ink` | |
| `text-muted-foreground` | `text-muted` | |
| `text-primary` | `text-maroon dark:text-accent` | matches `Sidebar.tsx:150` |
| `bg-primary/10` | `bg-maroon/10 dark:bg-accent/10` | |
| `text-destructive` | `text-red-600 dark:text-red-400` | matches `MentorsTable.tsx:129` |
| `border-border/60` | `border-border-warm` | resolves today, but inconsistent |

**Separately — `bg-muted/*` is a different bug.** `--color-muted` *does* exist, so
`bg-muted/60` (`JournalGrid.tsx:86`), `bg-muted/90` (`:87`), `bg-muted/30`
(`JournalPeriodSection.tsx:77`) and `bg-muted/60` (`JournalStudentRow`) all render — but
`--imkon-muted` is a **text** grey being painted as a surface. That is why the grid header and
sticky name column read muddy. Replace all of them with `bg-strip`.

Expect this one to change appearance visibly. That is the point; it is currently wrong.

Verify with: `grep -rn "bg-background\|text-foreground\|text-muted-foreground\|text-primary\b\|bg-primary/\|text-destructive\|bg-muted/" src/ --include=*.tsx` returning nothing under `components/journals/` or `pages/JournalDetail.tsx`.

### 2.2 The attendance metric is fabricated

`JournalDetail.tsx:72`:

```ts
attendanceRate: Math.min(100, classAvg * 0.95),
```

Attendance is the class average score multiplied by 0.95, rendered in a tile with a
`CalendarCheck` icon and a `%` suffix — indistinguishable from a measured value. A mentor reading
it is being shown a number that describes nothing.

The real data exists: `JournalStudentSummary.attendance_count` and `total_lessons`
(`models/journal_student_summary.py:22-23`). Fix per §3.2 — compute server-side, and **delete the
`* 0.95` line entirely** rather than adjusting it.

### 2.3 The collapsed period average is always "—"

`JournalPeriodSection.tsx:34` fetches detail only when expanded:

```ts
const { data: detail } = useJournal(expanded ? period.id : undefined);
```

`periodAvg` is derived from `detail` (`:54-71`). But the average badge renders only when
**collapsed** (`:123-130`). The data it needs is never loaded in the state that shows it, so it
renders `"—"` unconditionally — the one number that would let a mentor scan a course's periods at
a glance.

Fix per §3.1: aggregates come from the (cheap) period list, not from the (expensive) full journal
fetch. Do **not** fix this by eagerly fetching every period's full detail — that is N full grids
for a course with 12 periods.

### 2.4 Every mentor page-load fires a guaranteed 403

`CoursesStatsStrip.tsx:13` calls `useEnrollmentsTotal()`, which is ungated
(`lib/enrollments/hooks.ts:55-60`) and hits `GET /enrollments/` — `require_superadmin`
(`api/v1/enrollments.py:36`). For a mentor it always 403s and the third card shows `—` forever.

Fix: gate the strip by role. A mentor sees a **mentor-shaped** strip (§4.2.1) — their course
count, their student count, their ungraded-period count — not org-wide totals they have no
business seeing and cannot load anyway.

Also: all three labels are hardcoded Russian (`:20, :28, :36`).

### 2.5 The mentor's main hub is not translated

`Journals.tsx` hardcodes Russian at `:14-16` (filter labels), `:50` (heading), `:51-53`
(subtitle), `:67` (placeholder), `:101` (error), `:103` (retry). The project ships three locales
with a parity test for this exact namespace. A Tajik- or English-speaking mentor sees Russian on
their primary screen.

Move all of it into the `journals` namespace, all three locales, and extend
`journalsParity.test.ts` to cover the new keys.

### 2.6 The at-risk threshold is a magic number

`JournalDetail.tsx:63` — `if (avg < 60) atRisk += 1`. Hardcoded in a `useMemo` in a page
component, invisible to anyone configuring the system, and computed client-side from chart data
that is itself role-gated. Move to a backend constant exposed in the metrics response (§3.2), so
the UI renders whatever the server says the threshold is.

---

## 3. Backend work

Contract-first. Regenerate `CONTRACT.md` (`backend/scripts/generate_contract.py`) after.

### 3.1 Extend `GET /courses/{id}/journals` with per-period aggregates

Fixes §2.3 without N full journal fetches. Each item in the existing list gains:

```jsonc
{
  // …existing Journal fields…
  "student_count": 18,
  "lesson_count": 8,
  "cells_expected": 144,      // student_count * lesson_count
  "cells_filled": 96,         // COUNT(journal_entries) for this journal
  "avg_percentage": 74.3,     // AVG over JournalStudentSummary, null if none
  "state": "partial"          // upcoming | empty | partial | complete
}
```

`state` logic — leaning on the lazy-entry property from §0:

- `upcoming` — `period_start > today`
- `empty` — `cells_filled == 0`
- `complete` — `cells_filled == cells_expected`
- `partial` — otherwise

One query for entry counts (`GROUP BY journal_id`), one for summary averages, one for enrolment
counts. No N+1 — this endpoint returns every period of a course at once.

`cells_expected` uses **currently enrolled, non-deleted** students. A student who withdrew
mid-course will make historical periods read as over-filled; clamp `cells_filled` to
`cells_expected` for the percentage but keep raw counts in the payload.

### 3.2 New: `GET /courses/{id}/journal-metrics`

Replaces the client-side `metrics` block at `JournalDetail.tsx:49-76`, including the fabricated
attendance (§2.2) and the magic threshold (§2.6).

```jsonc
{
  "class_avg_percentage": 74.3,
  "attendance_rate": 91.2,        // SUM(attendance_count) / SUM(total_lessons) — REAL
  "periods_total": 12,
  "periods_complete": 4,
  "at_risk_count": 3,
  "at_risk_threshold": 60         // one source of truth
}
```

Access: same guard as the rest of the course endpoints (`check_course_access`, `courses.py:27`),
so superadmin and the owning mentor. Unlike `/progress-chart`, this carries no per-student rows,
so it needs no student-specific narrowing.

### 3.3 New: `GET /mentors/me/grading-queue`

Backs the dashboard (§4.1.1). Returns periods across **all** the mentor's active courses where
`state` is `empty` or `partial` **and** `period_start <= today`, newest first:

```jsonc
[{
  "journal_id": 41, "course_id": 7, "course_title": "SAT Math Prep",
  "period_label": "Week 4", "period_start": "…", "period_end": "…",
  "state": "partial", "cells_filled": 96, "cells_expected": 144,
  "is_current": true
}]
```

`is_current` — `period_start <= today <= period_end`. Sort: current period first, then most
recently ended. A mentor's most urgent work is the period they are teaching right now, then the
one that just closed.

Reuse the §3.1 aggregate query, scoped by `Course.mentor_id == current_user.id` instead of by
course. Do not implement it twice.

### 3.4 Fix `useEnrollmentsTotal` misuse

No backend change. Frontend only: the hook stays, but `CoursesStatsStrip` stops calling it for
non-superadmins (§2.4, §4.2.1). Add an `enabled` parameter mirroring
`useMentors(params, isSuperAdmin)` (`Journals.tsx:34`), which is the existing pattern for exactly
this problem.

---

## 4. Screens

Every list gets loading (`CardSkeleton`), error (retry, per `MentorDashboard.tsx:46-55`) and empty
states. Mobile-first, single column under `md`.

### 4.1 Dashboard (`/`) — rebuilt around the work queue

`MentorDashboard.tsx` today is a blue gradient banner, a course list whose only number is the
course **price** (`:69`), and a "Quick reference" card containing nothing but
`t("teacherHelpText")`. Replace wholesale.

Vertical order:

**4.1.1 Grading queue — the primary block.** Not a banner. Heading row ("Needs grading" + count
pill `bg-strip text-muted rounded-full px-2 py-0.5 text-xs tabular-nums`), then rows from §3.3:

- left: course title (`text-sm font-semibold text-ink`) + period label (`text-xs text-muted`)
- middle: a `FillBar` of `cells_filled / cells_expected` with the caption `96 of 144`
- right: state badge — `Current` (`bg-maroon/10 text-maroon dark:bg-accent/10 dark:text-accent`),
  `Not started` (amber), `In progress` (neutral `bg-strip text-muted`)
- whole row links to `/journals/:course_id` **with the period pre-expanded** (§4.3.3)

Empty state carries real meaning here: "Everything is graded." — this is the one empty state in
the app that is good news. Say so, with a `CheckCircle2` in emerald.

**4.1.2 Today's lessons — secondary strip.** Derived from `CourseSchedule` for the mentor's active
courses. Course title, time range, student count. Omit the block entirely when there are no
lessons today rather than rendering an empty shell.

**4.1.3 My courses — compact rail.** Replaces the current list. Per §1.3 **no price.** Each card:
title, exam type, student count, class average, and periods-complete progress. `grid gap-4
md:grid-cols-3`, capped at 6 with an "All →" link to `/courses`.

**4.1.4 At-risk students — collapsed by default.** Students below `at_risk_threshold` (§3.2)
across all courses, name + course + percentage, linking to that student's row in the relevant
period. Collapsed accordion so it doesn't dominate; expanded automatically when the count is 0
would be wrong — keep it collapsed and show the count in the header.

The gradient banner (`:16-32`) is deleted, not shrunk. It occupies the top of the viewport and
carries zero information.

### 4.2 Journals hub (`/journals`)

**4.2.1 Role-shaped stats strip.** Per §2.4, mentors get: my active courses · my students ·
periods needing grading (from §3.3, so it's one number that actually drives action). Superadmin
keeps the current org-wide strip. All labels through i18n (§2.5).

`JournalsStatsStrip` today shows "total journals" = total *courses*
(`useCourses({page_size:1}).total`) and "active courses". For a mentor with three courses these
are two numbers they already know. Replace both.

**4.2.2 Filters.** Same three-state filter, but labels through i18n (§2.5) and the selected state
using IMKON tokens — currently `border-blue-600 bg-blue-50 text-blue-600` (`Journals.tsx:82`),
which is a fourth accent color unrelated to the app's maroon/accent identity. Use
`border-maroon bg-maroon/10 text-maroon dark:border-accent dark:bg-accent/10 dark:text-accent`.

**4.2.3 Cards.** `JournalCard` gains the §3.1 aggregates: a `FillBar` of grading progress and the
period state, so the hub answers "where is work outstanding" without opening anything. The mentor
avatar block (`JournalCard.tsx:42-54`) is dead weight for a mentor — it's always them. Render it
only for superadmin.

### 4.3 Course journal (`/journals/:id`)

**4.3.1 Sticky header.** Fix the transparent background (§2.1). Add a
**"Next ungraded" jump button** on the right — scrolls to and expands the first `empty`/`partial`
period. On a 12-period course this replaces a lot of scrolling.

**4.3.2 Metric tiles.** Wire to §3.2. Attendance becomes real (§2.2); at-risk uses the server
threshold (§2.6) and shows it in the tile's sub-line (`below 60%`) so the number is interpretable.
Delete the client-side `metrics` `useMemo` (`:49-76`) entirely.

**4.3.3 Period accordion.** Per §1.4, structure kept. Changes:

- Collapsed rows show **real** data from §3.1 — average, `cells_filled / cells_expected`, and a
  state dot (complete emerald / partial amber / empty `bg-dot-gray` / upcoming muted). This is
  §2.3's fix and the single biggest usability gain on this screen.
- Accept a `?period=<id>` query param to open a specific period, so §4.1.1 and §4.3.1 can deep-link.
- Keep `useJournal(expanded ? …)` lazy fetching for the **grid**. Only the summary comes eagerly.

**4.3.4 Grid ergonomics** (after §2.1 lands, not before):

- Sticky name column keeps `bg-strip` and a real right-edge shadow; today's
  `shadow-[1px_0_0_0_rgba(0,0,0,0.05)]` (`JournalGrid.tsx:87`) is invisible in dark mode.
- Arrow-key navigation between cells. `focusedCellKey` state already exists
  (`JournalGrid.tsx:34`) but only responds to focus events — wire ↑↓←→ to move between cells,
  which is the difference between a grid and a list of inputs for someone entering 144 values.
- Today's lesson-date column gets a subtle `bg-strip` tint so the mentor can find it in an
  8-column period without counting.

---

## 5. Components

- **`GradingQueueRow`** (`components/mentor/`) — §4.1.1. Reused on the dashboard; keep it
  independent of the dashboard's data fetching so §4.2 can reuse it later.
- **`MentorStatsStrip`** (`components/mentor/`) — §4.2.1. Do not add a role branch inside
  `CoursesStatsStrip`/`JournalsStatsStrip`; a separate component with a role switch at the call
  site is clearer than three conditionals inside one strip.
- **`PeriodStateBadge`** — the `upcoming | empty | partial | complete` vocabulary from §3.1,
  defined once. It appears on the dashboard queue, the journals hub cards and the accordion rows;
  three ad-hoc implementations will drift.
- Reuse as-is: `FillBar`, `PersonAvatar`, `Button`, `CardSkeleton`, `Toast`, `Pagination`.

---

## 6. i18n

All new copy in the `journals` and `dashboard` namespaces across `en`, `ru`, `tg`. Extend
`i18n/journalsParity.test.ts` to cover the keys added in §2.5 and §4. Dates through
`i18n/formatters.ts` — `JournalGrid.tsx:92-93` and `MentorsTable.tsx:28-34` both hand-roll date
formatting; the grid one is in scope here, use `formatDate`.

---

## 7. Sequencing

Each step ends in a working app. Steps 1–5 are defect fixes and deliver most of the value.

1. **§2.1 token rewrite** — 8 files, mechanical, verified by the grep in §2.1. Do this first;
   every later visual judgement is unreliable until the screen renders correctly.
2. **§2.4 + §3.4** — role-gate the stats strip. Stops the guaranteed 403 on every mentor load.
3. **§3.1** — period aggregates; then **§2.3** — collapsed rows show real data.
4. **§3.2** — journal metrics; then **§2.2** (delete the `* 0.95`) and **§2.6** (server threshold).
5. **§2.5** — i18n for `Journals.tsx` + strip labels, all three locales, parity test green.
6. **Regenerate `CONTRACT.md`**; update `lib/courses/types.ts`, `lib/journals/types.ts`.
7. **§3.3** grading-queue endpoint + **§5** shared components.
8. **§4.1** dashboard rebuild.
9. **§4.2** journals hub.
10. **§4.3.1–4.3.3** course journal header, tiles, accordion.
11. **§4.3.4** grid ergonomics — keyboard navigation last, it benefits from a settled layout.

---

## 8. Out of scope

Named so they are not silently absorbed: the admin's mentor-management pages (`Mentors.tsx`,
`MentorsTable.tsx`, `MentorFormPanel.tsx`, `MentorProfile.tsx`); mentor payroll and
`payment_day_of_month`; any change to `useJournalAutosave`'s conflict-resolution logic; the
student cabinet (see `STUDENT_CABINET_UX_PLAN.md`); and making `at_risk_threshold` editable in
org settings — §3.2 makes it a server constant, which is the prerequisite, not the feature.
