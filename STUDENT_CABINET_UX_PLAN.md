# Student Cabinet — Structure, Features, Logic and Interface Plan

Status: planned, not implemented.

Scope: a dedicated student surface (`/my/*`) replacing the current two-page student experience
(`Dashboard` + `Settings`). Touches `frontend/src/lib/auth/roleAccess.ts`, `App.tsx`,
`components/Sidebar.tsx`, `pages/Settings.tsx`, `components/dashboard/StudentDashboard.tsx`,
plus new `pages/student/*` and `components/student/*`. Backend work in
`backend/app/api/v1/{courses,students}.py`, `services/course_service.py`,
`repositories/sqlalchemy/user_repository.py`.

Audience: the agent implementing this. Read sections 0–3 before editing anything.

---

## 0. Context the implementer needs

- **No motion library.** `framer-motion`/`motion` are not in `package.json`. All motion is CSS
  transitions plus the one existing keyframe (`card-scale-in`, `src/index.css:145`).
- **Reduced motion is handled by Tailwind's `motion-safe:` prefix**, not a global media query
  (`Modal.tsx:36` is the precedent). Every non-essential animation added here carries it.
- **Design tokens** live in `src/index.css:3-26` (`--imkon-*` → `--color-*`). Use token classes
  (`bg-card`, `text-ink`, `text-muted`, `border-border-warm`, `bg-strip`, `bg-row-hover`,
  `bg-beige`, `text-nav`, `text-label`), never raw hex. Both light and dark values exist for every
  token — a change that only looks right in one theme is not done.
- **Press-scale of record is `0.96`** (`Button.tsx:29`). Interactive state changes 150ms
  `ease-out`; surfaces 200ms (`SlideOver.tsx:32,42`). Do not introduce a third duration.
- **Three locales are mandatory**: `en`, `ru`, `tg` under `src/i18n/locales/`. A key added to one
  and not the others is a defect — `i18n/journalsParity.test.ts` is the precedent for enforcing it.
- **Money is a decimal string, never a number** (`lib/courses/types.ts:31`). Not that this plan
  renders money — see §1.2.
- **Existing primitives to reuse, not re-create**: `PersonAvatar`, `Button`, `Modal`, `SlideOver`,
  `CardSkeleton`, `TableErrorState`, `Pagination`, `Toast`, `ThemeToggle`, `LanguageSwitcher`,
  `EnrollmentStatusBadge`, `FillBar` (`components/courses/FillBar.tsx`).

---

## 1. Settled decisions

These were asked and answered. Do not relitigate them.

### 1.1 Active vs. archive is driven by enrollment status

Two independent axes exist in the data model: `Course.status` (`active` | `archived`,
`models/course.py:15`) and `Enrollment.status` (`active` | `withdrawn` | `completed`,
`models/enrollment.py:9`). For the student:

```
Active  := enrollment.status == "active"  AND  course.status == "active"
Archive := everything else the student is enrolled in (not soft-deleted)
```

A completed enrollment, a withdrawn enrollment, and an archived course all land in **one**
Archive bucket. The student is never shown the word "withdrawn" as a section heading; the
distinction surfaces only as a small badge on the card (§5.2.3).

### 1.2 No finance in the student cabinet

Balance, debt, payment history and charges stay accountant-only. `api/v1/finance.py` is entirely
behind `require_accountant`/`require_superadmin` and **stays that way** — no student-scoped
finance endpoints, no debt banner, no price on student-facing course cards.

Consequence for implementation: `CourseResponse.price` is present in the payload the student
receives from `GET /courses/`. **Do not render it.** The current admin `CourseCard`
(`StudentProfile.tsx:12-31`) prints `{course.price} TJS` — the student card is a new component
that omits it.

### 1.3 Full ranking, computed server-side

The student sees their position among classmates: `rank` and `class_size`, per course and per
period, plus the class average for context.

**Constraint that must not be broken:** `JournalService.get_journal` narrows the roster to the
requesting student (`services/journal_service.py:59-64, 83-88`), so a student's journal payload
contains no peer data today. Ranking must preserve this. Return **aggregates and a position**
(`my_rank`, `class_size`, `class_avg_percentage`), never a list of peers with names or scores.
Any implementation that ships the full roster to a student client is wrong, even if the UI only
renders the rank.

Presentation rule: rank is always paired with the student's own trend, and rendered in neutral
tokens (`text-ink` on `bg-strip`) — not in red/green semantics. Position is information, not a
verdict.

### 1.4 Mentor lesson comments are visible to students

`JournalEntryResponse.comment` and `has_comment` (`lib/journals/types.ts:44-51`) are already sent
to the student by the existing endpoint. The lesson list renders them (§5.4.3).

**Action item outside this plan:** mentors have been writing these comments assuming an internal
audience. Tell them before this ships. This is a communication task, not a code task, but the
release is not "done" without it.

---

## 2. Assumed decisions

Proposed and not explicitly settled. Implement as written unless told otherwise.

1. **The student cabinet lives at `/my/*`, not behind role-conditionals in admin pages.** Rationale
   in §3.1. The alternative — `isStudent && …` branches inside `Courses.tsx` / `CourseProfile.tsx`
   / `JournalDetail.tsx` — was rejected because those three pages carry grading, autosave, roster
   and mentor-history logic that a student must never reach.
2. **`/students/:id` stops being a student destination.** Students keep API-level access to their
   own profile, but the UI never links there. `isPathAllowed` keeps the rule (defence in depth);
   the dead back-link problem (`StudentProfile.tsx:47`, links to `/students`, which `RoleGuard`
   denies for students) disappears because students no longer land on that page.
3. **The Settings "Notifications" tab becomes superadmin-only** — for every role, not just
   students. It submits `handleSaveOrgSettings` (`Settings.tsx:282`), which PATCHes **org-wide**
   rules; `api/v1/settings.py:24` gates that behind `require_superadmin`. Today a mentor,
   accountant or student can toggle it and receives a silent 403. Hiding it from students alone
   would leave the same bug for two other roles.
4. **Mobile gets a bottom tab bar under `md`.** The sidebar's collapse-to-icons design
   (`Sidebar.tsx:66-92`) is built for an 8-item admin nav; for a 4-item student nav on a phone it
   is overhead.
5. **No new dependency.** Charts are SVG built in-repo, following `JournalScoreChart.tsx`.

---

## 3. Information architecture

### 3.1 Why a separate surface

Today the student is a guest inside staff pages. `roleAccess.ts:25` grants
`["dashboard", "settings"]`; `isPathAllowed` additionally admits `/students/:ownId` and
`/notifications`. The result is that the student's primary destination is the admin's
student-inspection page. Two costs: every admin change risks leaking into the student view, and
every student need becomes another role branch in a file owned by admin concerns.

A `/my/*` tree inverts this. Student pages import from `lib/courses`, `lib/journals`,
`lib/users` — the same data layer — but own their own presentation.

### 3.2 Routes

| Path | Page | Purpose |
|---|---|---|
| `/` | `StudentOverview` (via `Dashboard.tsx` role switch) | The hub. Real numbers, next lesson, active courses, last graded period. |
| `/my/courses` | `MyCourses` | Active \| Archive segmented control. |
| `/my/courses/:courseId` | `MyCourseDetail` | Schedule, mentor, my performance in this course, period list, trend chart. |
| `/my/journal/:journalId` | `MyJournalPeriod` | One period, read-only: score breakdown + per-lesson list. |
| `/notifications` | existing `Notifications` | Already per-user (`api/v1/notifications.py:13`). Reused as-is. |
| `/settings` | existing `Settings` | Profile tab only for students (§5.5). |

### 3.3 Access control

`roleAccess.ts` gains a `NavKey` of `"myCourses"`:

```ts
student: ["dashboard", "myCourses", "settings"],
```

`isPathAllowed` gains, in the `role === "student"` branch:

```ts
if (topLevel === "my") return true;
```

The `/my/*` pages are student-shaped but not student-exclusive at the guard level — a superadmin
hitting `/my/courses` gets an empty state rather than a 403, which is the right failure mode for a
support person reproducing a bug. Backend scoping (§4) is the real boundary.

Remove `"students"` from the student branch of `isPathAllowed` **only after** confirming nothing
else links there. Low priority; the guard is harmless.

---

## 4. Backend work

Contract-first: do this before the frontend, and regenerate `CONTRACT.md` after.

### 4.1 Enrich `GET /students/me/profile`

`repositories/sqlalchemy/user_repository.py:60-92` (`get_student_profile_stats`) currently returns
raw `Course` rows plus three org-wide numbers. It gives the UI nothing per-course.

New response shape (`schemas/user.py`, `StudentProfileResponse`):

```jsonc
{
  "user": { /* unchanged UserResponse */ },
  "totals": {
    "avg_percentage": 78.4,        // unchanged semantics, renamed for clarity
    "attendance_percentage": 92.0, // derived: attended / total_lessons
    "absences": 3,
    "total_lessons": 38,
    "active_course_count": 2,
    "archived_course_count": 4
  },
  "courses": [
    {
      "course": { /* CourseResponse */ },
      "enrollment_status": "active",     // active | withdrawn | completed
      "bucket": "active",                // active | archive  — per §1.1, computed server-side
      "my_avg_percentage": 81.2,
      "attendance_percentage": 94.0,
      "absences": 1,
      "periods_total": 12,
      "periods_graded": 4,
      "my_rank": 3,                      // §1.3
      "class_size": 18,
      "class_avg_percentage": 74.1,
      "next_lesson_at": "2026-08-05T10:00:00+05:00"  // null if none
    }
  ]
}
```

Implementation notes:

- **`bucket` is computed in the repository, not the client.** One source of truth for §1.1.
- **No N+1.** Per-course aggregates come from one `GROUP BY` over `JournalStudentSummary` joined
  through `Journal` to `Course` — the pattern already used at `user_repository.py:111-120`. Rank
  needs a window function (`RANK() OVER (PARTITION BY journal.course_id ORDER BY avg DESC)`) over
  the same aggregate, filtered to the requesting student afterwards.
- **`next_lesson_at`** derives from `CourseSchedule` rows the same way
  `journal_service.get_lesson_dates` does. Extract that date-walking into a reusable helper rather
  than duplicating it — it currently lives inside the journal service.
- Keep the old flat `avg_score` / `absences` / `total_lessons` fields for one release if
  `StudentDashboard`/`StudentProfile` still read them; delete once both are migrated.

### 4.2 Open `progress-chart` to enrolled students, scoped

`api/v1/courses.py:173-185` calls `check_course_access` (which *does* admit an enrolled student,
`courses.py:44-56`) and then immediately 403s anyone who isn't superadmin or mentor
(`courses.py:180-184`). Replace the hard 403 with a role-shaped response:

- superadmin/mentor: unchanged — full per-student datasets.
- student: `{ periods: [...], my_series: [...], class_avg_series: [...], my_rank, class_size }`.
  **No peer datasets, no peer names.** Per §1.3.

### 4.3 New: `GET /students/me/journals`

Without it, "all my periods" costs one request per course. Returns the student's periods across
all enrolled courses, newest first, each with `journal_id`, `course_id`, `course_title`,
`period_label`, `period_start/end`, `sum_score`, `max_period_score`, `percentage`,
`attendance_count`, `total_lessons`, and a `state` of `graded | in_progress | upcoming`.

`state` logic: `upcoming` if `period_start > today`; `graded` if a `JournalStudentSummary` row
exists with `max_period_score > 0`; otherwise `in_progress`.

Supports `?course_id=` so §5.3.4 can reuse it.

### 4.4 Extend `GET /journals/{id}` for students

Add to the response, **for students only**: `my_rank`, `class_size`, `class_avg_percentage` for
that period. The roster narrowing at `journal_service.py:83-88` stays exactly as it is.

---

## 5. Screens

Every screen: mobile-first, single column under `md`, then the stated grid. Every list has a
loading state (`CardSkeleton`), an error state (`TableErrorState` pattern, with retry) and an
empty state (§6.3). "It renders when data exists" is not a finished screen.

### 5.1 Overview (`/`)

Replaces `StudentDashboard.tsx` wholesale. The current file fetches `useMyStudentProfile()` and
renders **none** of it (`StudentDashboard.tsx:8` — `profile` is used only for the name and a link),
spending the top 40% of the viewport on a gradient banner containing static i18n help text.

Vertical order, top to bottom:

**5.1.1 Identity strip** — replaces the gradient banner. One row, `rounded-2xl border
border-border-warm bg-card p-4`:
`PersonAvatar` (48px) · name (`text-lg font-semibold text-ink`) · greeting line
(`text-xs text-muted`, e.g. "3 lessons this week") · right-aligned `EnrollmentStatusBadge`.
The gradient (`bg-gradient-to-r from-maroon to-rose-900`) is dropped, not shrunk. It is the most
expensive real estate on the page and currently carries zero information.

**5.1.2 Stat row** — `grid grid-cols-2 gap-3 md:grid-cols-4`. Four tiles, each
`rounded-2xl border border-border-warm bg-card p-4`: label (`text-xs uppercase tracking-wide
text-muted`) over value (`text-[28px] font-bold tabular-nums text-ink`).

| Tile | Source | Note |
|---|---|---|
| Average | `totals.avg_percentage` | Suffix `%`, one decimal. |
| Attendance | `totals.attendance_percentage` | |
| Absences | `totals.absences` | Sub-line `of {total_lessons}` in `text-xs text-muted`. |
| Active courses | `totals.active_course_count` | Taps through to `/my/courses`. |

`tabular-nums` is mandatory — these numbers update and must not reflow.

**5.1.3 Next lesson card** — `md:col-span-2`. The soonest non-null `next_lesson_at` across active
courses: course title, weekday + time, mentor name + `PersonAvatar` (24px). If none, the card is
omitted entirely rather than showing an empty shell.

**5.1.4 Active courses rail** — heading row ("My courses" + a text link "All →" to `/my/courses`),
then up to 3 `StudentCourseCard`s (§6.1) in `grid gap-4 md:grid-cols-3`. Only `bucket === "active"`.

**5.1.5 Latest graded period** — the most recent `state === "graded"` period from §4.3. Renders the
`ScoreBreakdown` component (§6.2) plus a link to `/my/journal/:id`. This is the single highest-value
element on the page for a student and it does not exist today in any form.

### 5.2 My courses (`/my/courses`)

**5.2.1 Header** — title + total count as a pill (`bg-strip text-muted rounded-full px-2 py-0.5
text-xs tabular-nums`), following the convention set in `STUDENTS_PAGE_UX_PLAN.md §2.1`.

**5.2.2 Segmented control** — Active | Archive. Not tabs-with-underline (that's the Settings
pattern), not two routes. One `role="tablist"`, `bg-strip rounded-xl p-1`, selected pill
`bg-card shadow-xs font-semibold text-ink`, unselected `text-nav`. Counts in each label.
Selection persists in the URL as `?bucket=archive` so the view is linkable and survives reload.

**5.2.3 Grid** — `grid gap-4 sm:grid-cols-2 xl:grid-cols-3` of `StudentCourseCard` (§6.1).

Archive cards differ, and the difference must be legible at a glance:
- progress bar replaced by a final-percentage badge,
- card surface `bg-strip` instead of `bg-card`, image (if any) at `opacity-75`,
- a small status badge: `Completed` (emerald) or `Left` (neutral `bg-strip text-muted` — **not**
  red; per §1.1 this is not framed as a failure) or `Course archived`.

### 5.3 Course detail (`/my/courses/:courseId`)

Not a trimmed `CourseProfile.tsx`. That page carries mentor history (`CourseProfile.tsx:339-355`),
roster management and edit affordances that a student must not see.

Layout above `lg`: two columns, `lg:grid-cols-3` with main content spanning 2.

**5.3.1 Header** (full width) — back link to `/my/courses`, course title (`text-xl font-bold
text-ink`), exam type + date range as `text-xs text-muted`, mentor chip (`PersonAvatar` 28px +
name) on the right. **No price, no student count, no edit button.**

**5.3.2 My performance strip** (main column) — four tiles like §5.1.2 but course-scoped:
my average, attendance, absences, and **rank** (`{my_rank} of {class_size}`, with
`class_avg_percentage` as a sub-line "class avg 74.1%"). Per §1.3 the rank tile uses neutral
tokens.

**5.3.3 Trend chart** (main column) — SVG line chart, x = periods, y = percentage. Two series:
mine (`--color-maroon` / `--color-accent` in dark) at 2px, class average at 1px dashed
`text-muted`. Follow `JournalScoreChart.tsx` for the SVG approach and the responsive viewBox.
Data from §4.2. Fewer than 2 graded periods → render the empty state, not a one-point line.

**5.3.4 Period list** (main column) — one row per period from §4.3 (`?course_id=`):
period label + date range on the left; on the right, percentage (`tabular-nums font-semibold`) and
a state dot — graded (emerald), in progress (amber), upcoming (`bg-dot-gray`). Whole row is a link
to `/my/journal/:id`; upcoming rows are not links and carry `text-muted`.

**5.3.5 Sidebar column** (`lg:col-span-1`) — weekly schedule (day + time rows from
`GET /courses/{id}/schedule`, today's row highlighted `bg-beige`), then the course description
in `text-sm text-muted` with a "more" disclosure past ~4 lines.

### 5.4 Journal period (`/my/journal/:journalId`)

Read-only. **Do not reuse** `JournalStudentRow`, `JournalScoreCell`, `JournalSaveStatus`,
`ExamWeightModal` or `useJournalAutosave` — those exist for grading and carry mutation paths,
optimistic-lock versions and autosave timers that have no meaning here.

`GET /journals/{id}` already returns a `students` array narrowed to exactly one element for a
student (`journal_service.py:83-88`). Read `students[0]`; if it is absent, render the error state
rather than crashing.

**5.4.1 Header** — back link to the course, `period_label`, date range, course title.

**5.4.2 Score breakdown** — the `ScoreBreakdown` component (§6.2), plus the rank line from §4.4.

**5.4.3 Lesson list** — one row per entry in `students[0].entries`:
date (`tabular-nums`) · attendance icon (`CheckCircle2` emerald / `XCircle` rose) · score
(`{score}` right-aligned, `tabular-nums`) · comment. Per §1.4 comments are shown: inline in
`text-xs text-muted italic` when short, expandable when long. Rows where `attendance === false`
get `bg-strip` and a muted score.

Lesson dates in `lesson_dates` with no matching entry are **upcoming** — render them muted with an
em-dash score, so the student sees the shape of the period rather than a truncated list.

### 5.5 Settings (`/settings`)

Minimal, surgical changes to `pages/Settings.tsx`:

1. **Notifications tab → superadmin-only.** Change the guard at `Settings.tsx:130-139` to
   `{isSuperAdmin && (…)}`, matching the System tab at `:118`. Per §2.3 this fixes mentor and
   accountant too.
2. **Guard `activeTab` against a stale value.** With the tab hidden, `activeTab` can still be
   `"notifications"` (it can't today via UI, but will be reachable if tab state is ever persisted
   to the URL). Add `isSuperAdmin` to the render conditions at `:281` as well as the button.
3. **Add `LanguageSwitcher` beside `ThemeToggle`** in the appearance card (`:206-212`). A student
   whose UI is in the wrong language currently has to find it in the header.
4. **Wire the avatar upload button** (`:153-158`) or remove it. It is currently a `type="button"`
   with no handler — a control that does nothing. `AvatarUploadField` and `uploadAvatar`
   (`lib/users/hooks.ts`) already exist; prefer wiring it.

No other role sees any change.

---

## 6. Shared components to build

Under `components/student/`.

### 6.1 `StudentCourseCard`

Props: `{ entry: StudentCourseEntry; variant: "active" | "archive" }` where `entry` is one item of
§4.1's `courses`.

Structure: optional cover image (`photo_path`, `aspect-[16/9] object-cover`, `rounded-t-2xl`) →
title (`font-semibold text-ink`, `line-clamp-2`) → exam-type + date range (`text-xs text-muted`) →
**my percentage** (`text-2xl font-bold tabular-nums`) → `FillBar` for `periods_graded /
periods_total` with the caption `4 of 12 periods` → mentor chip.

Never renders `price` (§1.2). Whole card is a link to `/my/courses/:id`; hover
`bg-row-hover`, `transition-colors duration-150`, press `active:scale-[0.96]`.

### 6.2 `ScoreBreakdown`

Props: the `JournalEmbeddedSummary` shape (`lib/journals/types.ts:53-66`).

Renders `sum_score` / `max_period_score` as a large `tabular-nums` figure with the percentage, then
a stacked horizontal bar segmented into homework / attendance / exam / bonus, with a legend giving
each component's absolute value. This is the vocabulary the mentor-side journal already
established — the student must see the *same* decomposition, or the score reads as arbitrary.

Colour: four distinct hues from the existing palette, checked in both themes. Do not encode
"good/bad" — these are components of a total, not judgements.

### 6.3 `StudentEmptyState`

Empty states matter far more here than in admin: an admin with an empty table knows why, a student
with no courses does not. Props: `icon`, `title`, `body`, optional `action`.

Required copy, all three locales:
- **No courses at all** — "You're not enrolled in any course yet." + "Your coordinator will add you
  once enrolment is confirmed." No action button (there is nothing the student can do).
- **No archived courses** — "Nothing archived yet." + "Courses appear here when they finish."
- **No graded periods** — "No grades yet." + "Your first period will appear here once your mentor
  grades it."
- **Chart with <2 points** — "Not enough data for a trend yet."

### 6.4 `StudentBottomNav` (under `md`)

Fixed bottom bar, `border-t border-border bg-card`, 4 items: Overview, Courses, Notifications,
Settings. Icons at 22px matching `Sidebar.tsx:146`, label `text-[10px]`. Active item
`text-maroon dark:text-accent`. Honour `env(safe-area-inset-bottom)`. The sidebar is hidden under
`md` when the role is student.

---

## 7. Shell changes

- `Sidebar.tsx:28-37` — add `{ navKey: "myCourses", key: "nav.myCourses", to: "/my/courses",
  icon: BookOpen }`. The existing `NAV_ACCESS` filter (`Sidebar.tsx:56-57`) then does the work.
- `Dashboard.tsx` — the existing role switch routes students to the new `StudentOverview`.
- `Header.tsx` — verify the notification bell is present for students; it is the only entry point
  to `/notifications` once the student nav is 4 items.

---

## 8. Motion and states

- Card hover: `bg-row-hover`, 150ms. Press: `active:scale-[0.96]`.
- Segmented control: the selected pill slides via `transition-transform` 200ms, `motion-safe:` only.
- Stat tiles and cards on first paint: `card-scale-in` (`index.css:145`), staggered 40ms apart,
  capped at 6 elements, `motion-safe:` only. Do not stagger on refetch — only on initial mount, or
  the page twitches every time a query invalidates.
- Chart line: `stroke-dasharray` draw-in on mount, `motion-safe:` only.
- Loading: `CardSkeleton` in the same grid geometry as the loaded content, so nothing jumps.
- Error: retry button, following `StudentProfile.tsx:75-91`.

---

## 9. i18n

New namespace `student.json` in `en`, `ru`, `tg`. Do not scatter student copy across `dashboard`,
`courses` and `journals` — the tone differs (a student is addressed directly; admin copy is
descriptive). Add a parity test mirroring `i18n/journalsParity.test.ts`.

Note `formatDate` (`i18n/formatters.ts`) is already locale-aware; use it for every date. Times need
a matching `formatTime` — add it there, not inline.

---

## 10. Sequencing

Each step ends in a working app.

1. **Backend §4.1** — enrich `/students/me/profile`. Tests for the `bucket` rule (§1.1) and for the
   rank window function.
2. **Backend §4.2, §4.3, §4.4** — progress-chart student branch, `/students/me/journals`, journal
   rank fields. Test that a student response contains **no peer identifiers** (§1.3) — this is the
   test that protects the invariant.
3. **Regenerate `CONTRACT.md`** (`backend/scripts/generate_contract.py`); update
   `lib/users/types.ts`, `lib/journals/types.ts`, `lib/courses/types.ts`.
4. **Settings fix (§5.5)** — smallest, highest-value, unblocks nothing but fixes a live bug for
   three roles.
5. **Routing + access (§3.2, §3.3) + shell (§7)** with placeholder pages.
6. **Shared components (§6).**
7. **Overview (§5.1)**, replacing `StudentDashboard.tsx`.
8. **My courses (§5.2).**
9. **Course detail (§5.3).**
10. **Journal period (§5.4).**
11. **Mobile bottom nav (§6.4)** and a pass over every breakpoint.
12. **i18n parity test (§9)** green in all three locales.

---

## 11. Out of scope

Named so they are not silently absorbed: finance for students (§1.2), student-uploaded documents,
messaging between student and mentor, push/Telegram preferences for the student's own
notifications (the current Notifications tab is org-wide rules, a different feature), and any
change to the mentor grading flow.
