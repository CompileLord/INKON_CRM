# Course Detail Page — Structure, Progress Visualization and Motion Plan

Status: planned, not implemented.
Scope: `frontend/src/pages/CourseProfile.tsx`,
`frontend/src/components/courses/CourseProgressChart.tsx` (replaced), and the course components
it composes.
Audience: the agent implementing this. Read end to end before editing.

---

## 0. Hard dependency

**The progress redesign needs `max_period_score` from the API.** The chart today plots raw
`sum_score` (`backend/app/api/v1/courses.py:212`), and raw sums are not comparable across periods
— a 5-lesson week and a 13-lesson month produce different maxima. Any ramp, any shared axis, any
"class average" over those numbers is meaningless.

`JOURNAL_SCORING_PLAN.md` §Phase 6 makes `/courses/{id}/progress-chart` return
`max_period_score` alongside each score. **Implement that first.** If this page must ship before
it, the only honest interim is to label the visual "rank within period" rather than a score —
do not normalize against the observed maximum and present it as achievement.

Everything below assumes each datapoint carries `score`, `max_period_score`, and a derived
`percentage`.

---

## 1. Why the current progress element fails

`CourseProgressChart.tsx` renders one 40px-tall mini bar chart **per student**, stacked
vertically. With 20 students that is 20 separate charts, and it fails on every axis that matters:

1. **No value is readable anywhere.** No axis, no tick, no label, no tooltip. A bar of unknown
   scale against an invisible maximum. (Anti-pattern: a value that can't be read at all — worse
   than the "tooltip as the only way to read a value" case, which at least has a tooltip.)
2. **A score of 0 renders as a visible bar.** `Math.max(4, (score / max) * 100)` (`:51`) floors
   every bar at 4% — a student with nothing is indistinguishable from a struggling one. This is a
   data-integrity defect, not a styling choice.
3. **Comparison between students is impossible**, which is the entire job of a course-level
   progress view. The data is a grid — students × periods — and it has been shredded into N
   unaligned strips.
4. **20 cycled categorical hues** (`:4-9`, `:29`). The categorical ceiling is 8; past it, hues are
   indistinguishable under CVD. The palette is also cycled by index, so the same student can
   change color when the roster changes.
5. **Student names are painted in the series color** (`:41`). Text wears text tokens; a colored
   mark beside the name carries identity. `#D69E2E` on white fails contrast outright.
6. **The "Average" column is just another bar**, hardcoded gray (`:52`), on the same scale as the
   period bars while being a different quantity (a mean, not a period total).
7. **Period labels repeat under every student** — with 20 students and 8 periods that's 160
   labels for 8 distinct values.
8. **No dark mode.** Hardcoded hexes and a `bg-beige/40` track chosen against a white card.
9. **No loading or empty state.** `CourseProfile.tsx:319` renders `{progressChart && …}`, so the
   section pops into existence and shoves the roster down the page.

## 2. The replacement: a progress matrix

**Form.** Students × periods is a grid comparing magnitude, so the prescribed form is a
**heatmap with a sequential ramp** — one hue, light→dark, more-is-darker — not categorical
color. This kills the 20-hue problem outright: identity comes from the row label, magnitude from
the cell. It scales to 30 students without degrading, and it makes patterns legible that the
current design hides: a struggling student is a pale row, a brutal period is a pale column.

**Anatomy.**

- **Rows** = students, sorted (default: class average descending). Row header = avatar + name in
  text tokens, linking to the student profile.
- **Columns** = journal periods in chronological order, labeled once, in a sticky header.
- **Cells** = the period percentage. Sequential ramp, value printed in the cell in
  `tabular-nums` when it fits with padding, otherwise carried by the tooltip and the table view.
  2px surface gap between cells; 4px radius.
- **Average column**, visually separated by a gap and a hairline rule, not just a different fill —
  it is a different quantity and must not read as "one more period."
- **Empty cell ≠ zero cell.** A period the student was not enrolled for renders as an explicitly
  empty cell (surface, hairline outline, "—"), never as a 0% dark cell. Mid-course enrollees
  legitimately have zeros too (`JOURNAL_SCORING_PLAN.md` decision 4) — a zero is a real score and
  shows as one.
- **Class average trend** above the matrix: a single line, one series, no legend needed (the
  title names it), showing the cohort's average percentage per period. This is the one thing a
  mentor reads first.
- **Attention strip**: students below a threshold get a status marker — icon **and** label, never
  color alone, using reserved status tokens that are not part of the ramp.

**Interaction.**

- Hover or keyboard-focus a cell → tooltip with student, period, `score / max_period_score`, and
  percentage. Hit area ≥24px including the gap.
- Click a cell → that journal period (`/journals/{course_id}`, scrolled to the period if the
  route supports it — check before wiring).
- Click a row header → the student profile.
- **Table view toggle** is mandatory, not optional: every chart needs a WCAG-clean table twin.
  The matrix is already tabular, so build it as a real `<table>` with `<th scope>` and let the
  toggle switch between colored cells and plain numbers.
- One control row **above** the section — sort (average / name / trend), and a search box if the
  roster is long. Never controls inside the chart card.

**Color — compute it, don't eyeball it.**

The ramp is sequential on the brand's warm hue (`--imkon-maroon` / `--imkon-accent` family).
Before shipping, run the validator from the dataviz skill:

```
node scripts/validate_palette.js "<ramp hexes>" --mode light   # surface #ffffff
node scripts/validate_palette.js "<ramp hexes>" --mode dark    # surface #1c1917
```

Fix every FAIL before continuing. Dark mode is a **selected** set of steps from the same ramp
validated against the dark surface — never an automatic inversion of the light ramp. The cell
value's text color must meet contrast against its own cell at both ends of the ramp; if it can't,
the value moves out of the cell rather than being shipped illegible.

**What not to do:** don't add a second y-axis, don't color rows by rank (color follows the
entity), don't put a number on every point of the trend line, and don't reach for categorical
hues again — the moment students carry identity colors, the 8-series ceiling applies and a
20-student course breaks it.

---

## 3. Page structure

### 3.1 Reorder by importance

Current order: hero → schedule + mentor history → progress → roster. Schedule and mentor history
are reference material; progress and roster are the subject of the page.

Target order:

1. Back link + hero
2. **Key metrics strip** (new, §3.2)
3. **Progress matrix** (§2) — full width
4. **Roster** (`CourseRosterSection`)
5. Schedule + mentor history, two columns, at the bottom

Keep it one scroll. Do not introduce tabs — the page is not long enough to justify hiding a
section behind a click, and progress and roster are read together.

### 3.2 Key metrics strip

The page states price, dates and mentor but answers none of the questions a mentor opens it for.
Add a stat-tile row — these are single values, so they are tiles, not charts:

- **Students** enrolled (reuse `FillBar` if the course has a capacity concept — check
  `lib/courses/types.ts` first; if there is no capacity field, show a plain count).
- **Class average** as a percentage, with the delta against the previous period.
- **Attendance rate** across the course.
- **Periods** elapsed / total.

Values use proportional figures at tile size (`tabular-nums` belongs in table rows and axis
ticks, not on a large standalone number). Reuse `CoursesStatsStrip` if its shape fits — inspect
it before duplicating.

### 3.3 Hero card

- **Status pill** (`CourseProfile.tsx:193-200`) is a hand-rolled duplicate of `UserStatusBadge`
  with no dark variants: `bg-green-100 text-green-700` stays light green on a dark surface.
  Extract a shared `StatusBadge` or add the `dark:` variants, matching
  `UserStatusBadge.tsx:8-14`.
- **Hero image** (`:183-187`) needs the standard image outline — `outline-1 -outline-offset-1`
  in `oklch(0 0 0 / 0.1)` light, `oklch(1 0 0 / 0.1)` dark. Pure black and pure white only; a
  tinted neutral picks up the surface behind it and reads as dirt on the edge.
- **Hardcoded blues**: `text-blue-600` on the back link (`:137`) and `bg-blue-600` on the journal
  link (`:212`) sit outside the token system entirely, on a page whose accent is warm. Move both
  to tokens (`text-maroon`, and the `Button` accent variant or a token-based equivalent).
- **Icon buttons** (`:219-242`) have no `focus-visible` ring, while the journal link right next to
  them does. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon/30`,
  plus `dark:hover:bg-red-950/40` on the delete button.
- **Card radius is inconsistent on this page**: the hero and section cards are `rounded-xl`
  (`:180`, `:273`, `:292`) while the progress card and the loading/error boxes are `rounded-2xl`
  (`:146`, `:155`, `:164`, `CourseProgressChart.tsx:16,36`). Pick one — `rounded-2xl` for
  top-level cards — and apply it everywhere on the page.
- **Heading hierarchy** skips a level: `h1` (`:205`) to `h3` (`:274`, `:293`). Section headings
  become `h2`.

### 3.4 Loading and empty states

- Replace the bare `"Загрузка…"` box (`:151-158`) with a skeleton that matches the real layout —
  hero block, metrics strip, matrix — so nothing jumps when data lands.
- On refetch, **hold the previous render at reduced opacity**. Never flash a skeleton over
  content that is already on screen.
- Give the progress section a real empty state for a course with no journals yet: one line plus a
  link to the journal, inside the same card shell, so the section keeps its footprint instead of
  vanishing (`:319`).

---

## 4. Motion

Same rules as `STUDENTS_PAGE_UX_PLAN.md` §4 — no motion library, CSS only, 150ms `ease-out` for
interactive state, 200ms `cubic-bezier(0.2, 0, 0, 1)` for surfaces, everything non-essential
behind `motion-safe:`, and never `transition: all`.

Specific to this page:

- **Matrix cells: no entrance stagger.** The matrix re-renders on every sort and filter change; a
  stagger would replay each time. One fade-in on first mount only.
- **Cell hover**: 150ms ring + tooltip fade. The ring is on the cell's own surface, not a border
  added between cells.
- **Value changes** (a mentor edits a journal in another tab and the query refetches): transition
  `background-color` over 200ms so the change is perceptible without redrawing the grid.
- **Trend line**: no draw-on animation. It is decorative here, and the line re-renders on filter.
- **Skeleton → content**: cross-fade, matching the Students plan.
- **Keep** the existing `transition-[height] duration-300` idiom's restraint — it was the one
  correct instinct in the old component — but it does not carry over, since heatmap cells change
  color rather than size.

---

## 5. Phases

1. **API dependency** — `max_period_score` / `percentage` on the progress-chart response
   (`JOURNAL_SCORING_PLAN.md` Phase 6). *Verify:* endpoint returns both for a weekly and a
   monthly course.
2. **Page structure** — reorder sections, metrics strip, heading levels, unified card radius.
   *Verify:* render as superadmin and as mentor (the layout is role-dependent, `:272`, `:291`).
3. **Hero fixes** — status badge dark variants, image outline, token colors, focus rings.
   *Verify:* toggle dark mode; tab through every hero control.
4. **Progress matrix** — new component replacing `CourseProgressChart`, with the ramp validated
   in both modes, tooltips, table-view toggle, and the empty-cell distinction.
   *Verify:* run the palette validator and paste its output into the PR; render with 1, 8 and 25
   students, with a mid-course enrollee, and with a course that has no journals.
5. **States and motion** — skeletons, refetch opacity hold, cross-fade, cell hover.
   *Verify:* replay at 10% speed in the Animations panel; re-run under
   `prefers-reduced-motion: reduce`.

## 6. Verification for the whole change

- `npm run build` and the linter clean.
- Palette validator passes for light **and** dark; output recorded.
- Render and **look at it** — the validator checks color, not layout. Screenshot at `sm`, `md`,
  `lg` and check for label collisions and overflow. The matrix scrolls horizontally inside its
  own container; the page body never scrolls sideways.
- Keyboard-only: reach every cell, the sort control, the table toggle, the journal link, and
  every hero action.
- Every value visible in the matrix is also readable in the table view.
- States walked: loading, refetching, error, no journals, no students, one student, 25 students.

## 7. Out of scope

Per-student drill-down panels, exporting the matrix, attendance heat as a second matrix, and any
new backend aggregate beyond the `max_period_score` dependency in §0.
