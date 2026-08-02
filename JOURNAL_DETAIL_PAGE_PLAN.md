# Journal Detail Page — Autosave, Structure and Chart Plan

Status: planned, not implemented.
Audience: the agent implementing this. Read end to end before editing a single file.

**Scope**

| Layer | Files |
| --- | --- |
| Backend | `backend/app/schemas/journal.py`, `backend/app/services/journal_service.py`, `backend/app/api/v1/journals.py`, `backend/app/tests/integration/test_journals.py`, `CONTRACT.md` (regenerate) |
| Frontend data | `frontend/src/lib/journals/types.ts`, `endpoints.ts`, `hooks.ts`, new `frontend/src/lib/journals/useJournalAutosave.ts` |
| Frontend UI | `frontend/src/pages/JournalDetail.tsx`, `frontend/src/components/journals/JournalPeriodSection.tsx` (heavily rewritten), `JournalScoreChart.tsx` (rewritten), new `JournalSaveStatus.tsx`, new `JournalStudentRow.tsx`, new `JournalChartLegend.tsx` |
| i18n | `frontend/src/i18n/locales/{en,ru,tg}/journals.json` |

**Out of scope:** `CourseProgressChart.tsx` (course page — covered by `COURSE_DETAIL_PAGE_PLAN.md`), journal generation, the journals list page.

---

## 1. What is wrong today

Evidence, not opinion. All references are to files at their current state.

### 1.1 Saving

1. **Nothing persists until a manual click.** `JournalPeriodSection.tsx:60` holds every edit in a local
   `pending: Map`. A tab close, a route change, an accordion collapse (`JournalDetail.tsx:155`), or a
   session expiry silently discards all of it. There is no `beforeunload` guard and no persistence.
2. **Two different save models in one table.** Attendance/score use the batch button
   (`:233-241`); bonus/exam use a *per-row* button that only appears when dirty (`:384-400`). A mentor
   editing one student's row must find and click two different save controls in two different places.
3. **A single stale cell rejects the whole batch.** `journal_service.py:248-252` raises 409 on the
   first version mismatch, after which nothing in the batch is written. With autosave this becomes a
   hard failure mode, not an edge case.
4. **The save response carries no state.** `batch_update_entries` returns `{"status": "success"}`
   (`journal_service.py:291`). The client cannot learn the new `version` values or the recalculated
   `sum_score`, so `hooks.ts:19` invalidates the whole journal detail query after every save. That is a
   full round-trip per save, and it remounts the table under the user's cursor.
5. **Recalculation is O(students) round-trips.** `journal_service.py:288-290` calls
   `SumCalculationService.recalculate` in a loop, and each call re-reads the journal and re-queries
   entries (`sum_calculation_service.py:14-30`). A 20-student batch is 40+ redundant queries when
   `recalculate_journal` already exists and does it in three.
6. **Autosave cannot be added naively.** Firing the existing mutation on every keystroke would
   invalidate → refetch → remount the table 5× a second, and every in-flight save would race the
   version numbers of the next one. The plan below fixes the contract *first* for this reason.

### 1.2 Structure and UX

7. **No save state is visible anywhere.** The only signal is a button label counter,
   `Save (3)` (`:240`), and a toast that disappears after 3s (`JournalDetail.tsx:48`).
8. **The score control is a `<select>` per cell** (`:327-340`). For a 20×13 grid that is 260 native
   dropdowns — three interactions (open, scan, pick) for a value that is one keystroke, `0`–`5`.
9. **No keyboard grid navigation.** Tab order walks comment button → checkbox → select, left to right,
   with no way to move down a column. Entering a week of marks is a mouse marathon.
10. **Dirty cells are marked `bg-blue-50/60`** (`:305`, `:326`) with no dark-mode variant — invisible
    in dark theme, and it collides with the maroon accent used everywhere else.
11. **Hardcoded English in a trilingual product**: `Exam Max` (`:220`), `Edit Exam Weight` (`:230`),
    `(max 20)` (`:272`), `Edit period exam maximum score` (`:225`), and the entire exam-weight modal
    (`:428-451`). `table.sum` is the untranslated string `"Sum"` in all three locales.
12. **The sticky name column breaks its own layout.** `td` at `:288` is `sticky` *and* `flex`, which
    drops the cell out of table layout — row heights desynchronize between the frozen column and the
    scrolling body.
13. **The period header has no context.** A collapsed row says only "Week 3" — no date range, no
    completion state, no class average. There is no reason to open one period over another.
14. **The whole detail query refetches when any period is saved** because every period section holds
    its own `useJournal` (`:54`) but the invalidation key is shared per journal id.

### 1.3 The chart

15. **The user's reported bug**: the per-student average — the last point of every series and the whole
    point of the "Average" label (`JournalScoreChart.tsx:150`) — is readable only by hovering the last
    x-position. The legend (`:202-215`) prints names with no values at all. **It must become a
    left-side list showing each student with their average, sorted.**
16. **The tooltip lists every visible student, unsorted by proximity, positioned with a fixed
    `translateX(8px)`** (`:186-191`) — with 20 students it is a wall of text that overflows the card's
    right edge on the last points.
17. **20 cycled categorical hues** (`:33-38`). The categorical ceiling is ~8; beyond it colors are not
    distinguishable, and under CVD far fewer are. Identity must come from the row label, not hue #17.
18. **Hidden students still set the y-axis** — `max` is computed from all `datasets` (`:59-62`), not
    `visibleDatasets`, so filtering the roster down to two students doesn't rescale the plot.
19. **Every point of every series is a `<circle>`**: 20 students × 9 periods = 180 nodes re-rendered on
    every `pointermove` because `hoverIndex` lives in the chart's own state (`:42`).
20. **No axis label, no units on the y-axis beyond `%`, no empty-vs-zero distinction.**

---

## 2. Phase 1 — Backend: make autosave possible

Do this phase first and completely. The frontend work depends on the new response shapes.

### 2.1 New response schemas

In `backend/app/schemas/journal.py`:

```python
class JournalEntryStateResponse(BaseModel):
    student_id: int
    lesson_date: date
    attendance: bool
    score: int
    comment: Optional[str]
    version: int

    model_config = {"from_attributes": True}


class JournalEntryConflictResponse(BaseModel):
    student_id: int
    lesson_date: date
    submitted_version: int
    current: JournalEntryStateResponse


class JournalBatchUpdateResponse(BaseModel):
    applied: list[JournalEntryStateResponse]
    conflicts: list[JournalEntryConflictResponse]
    summaries: list[JournalStudentSummaryResponse]
```

`JournalStudentSummaryResponse` already exists and already carries `version` and `percentage` — reuse
it unchanged.

### 2.2 Partial-success semantics for `PUT /journals/{id}/entries`

Replace the fail-the-whole-batch behaviour in `JournalService.batch_update_entries`
(`journal_service.py:177-291`):

- Validate authorization and score range exactly as today (score range is already enforced by Pydantic
  `Field(ge=0, le=5)`; the manual check at `:216-220` is dead code — delete it).
- **A missing entry is skipped into `conflicts`, not a 404.** The current 404 (`:243-246`) fires
  whenever the roster or schedule changed since the page loaded, and under autosave that would be a
  routine occurrence.
- **A version mismatch marks that one item as a conflict and continues with the rest.** Every item that
  matched is written.
- **Status code compatibility rule (important):** return `409 Conflict` *only when every submitted item
  conflicted and none applied*. Otherwise return `200` with the envelope above. This preserves the
  existing single-stale-entry test (`test_journals.py:125-139`) while making partial batches survivable.
- Populate `applied` with the post-write state of each entry — **including the incremented `version`**.
  SQLAlchemy's `version_id_col` (`journal_entry.py:30-32`) bumps it on flush, so read `entry.version`
  *after* `await self.db.flush()`.
- Include the *current* server state in each conflict entry so the client can reconcile without a refetch.
- Replace the per-student recalculation loop (`:288-290`) with a single
  `SumCalculationService.recalculate_journal(journal_id)` call — it already batches (`sum_calculation_service.py:59`).
  Then re-select the summaries for the affected students and return them in `summaries`.
- Keep the audit logging exactly as-is (`:269-277`); it is per-entry and correct.

Wire `response_model=JournalBatchUpdateResponse` on the route in `api/v1/journals.py:30`.

### 2.3 Symmetric response for the summary PATCH

`PATCH /journals/{journal_id}/students/{student_id}/summary` already returns the full summary — no
change needed. Verify it returns the post-recalculation `version`; `journal_service.py:391-393`
refreshes the object, so it does.

### 2.4 Exam-max-score PATCH must return the affected summaries

`update_exam_max_score` changes `max_period_score` for every student in the period. Today it returns
only the `Journal` (`api/v1/journals.py:60`), so the client has no choice but to invalidate. Return:

```python
class JournalExamMaxScoreUpdateResponse(BaseModel):
    journal: JournalResponse
    summaries: list[JournalStudentSummaryResponse]
```

### 2.5 Backend tests

In `backend/app/tests/integration/test_journals.py`:

- Keep `test_..._put_conflict` asserting `409` (all-conflict case) — it must still pass unchanged.
- **New** `test_batch_update_partial_conflict`: two entries, one with a stale version → expect `200`,
  `len(applied) == 1`, `len(conflicts) == 1`, conflict carries `current.version`, and a follow-up `GET`
  shows the good entry written.
- **New** `test_batch_update_returns_incremented_versions`: submit with version `v`, assert
  `applied[0].version == v + 1`, then immediately re-submit using the returned version and assert it
  succeeds without a `GET` in between. *This is the test that proves autosave can run without refetching.*
- **New** `test_batch_update_returns_recalculated_summaries`: assert `summaries[0].sum_score` and
  `percentage` match what a subsequent `GET /journals/{id}` reports.
- **New** `test_batch_update_missing_entry_is_conflict_not_404`.
- Regenerate `CONTRACT.md`: `python -m scripts.generate_contract` from `backend/`.

Run: `cd backend && pytest app/tests/integration/test_journals.py -q`.

---

## 3. Phase 2 — The autosave engine

Build this as one hook, `frontend/src/lib/journals/useJournalAutosave.ts`. It is the heart of the
change; the UI components stay dumb.

### 3.1 Requirements it must satisfy

| Requirement | Mechanism |
| --- | --- |
| No lost edits | Dirty buffer survives re-render (ref), flushed on blur, collapse, unmount, tab-hide and route change |
| No lag while typing | Buffer lives in a `useRef`; only the edited cell re-renders |
| No request storms | Debounce 700 ms idle, hard flush at 3 s max latency |
| No races | Single in-flight request; edits during flight queue into the next batch |
| No table remount | Optimistic `setQueryData`; **never** invalidate journal detail during editing |
| Recoverable failures | Failed items return to the dirty buffer; 3 retries with backoff; manual retry |
| Honest conflicts | Server state from `conflicts[]` replaces the cache and the cell is flagged, not silently overwritten |

### 3.2 State model

Three distinct maps, keyed by `entryKey(studentId, lessonDate)` from `types.ts:93`:

- `dirtyRef: Map<string, JournalEntryUpdate>` — edited, not yet sent. A ref, not state.
- `inFlightRef: Map<string, JournalEntryUpdate>` — sent, awaiting response.
- `cellStatus: Map<string, "dirty" | "saving" | "saved" | "error" | "conflict">` — React state, used
  only for the per-cell indicator. Update it in batches, never per keystroke.

Summary drafts (`bonus_score`, `exam_score`) get a parallel `summaryDirtyRef: Map<number, …>` and flow
through the same scheduler, calling the summary PATCH per student. They debounce longer (1000 ms) —
they are typed numbers, not clicks.

Derive one aggregate status for the header:
`"idle" | "pending" | "saving" | "saved" | "error"`.

### 3.3 The scheduler

```
edit(key, patch)
  → merge into dirtyRef (score > 0 implies attendance = true, as today at JournalPeriodSection.tsx:105)
  → optimistic setQueryData: patch the cell in the cached JournalDetailResponse
  → mark cellStatus = "dirty"
  → schedule()

schedule()
  → clear existing debounce timer, set a new one at DEBOUNCE_MS (700)
  → if no maxLatency timer is running, start one at MAX_LATENCY_MS (3000)

flush(reason)                       // reason: "debounce" | "maxLatency" | "blur" | "unmount" | "hidden" | "manual"
  → if a request is in flight → set needsRefluchAfterInFlight and return
  → move everything from dirtyRef into inFlightRef, clear dirtyRef
  → cellStatus for those keys = "saving"
  → PUT /journals/{id}/entries with [...inFlightRef.values()]
```

On response:

- For each `applied` item: write it into the cache **with the returned version**, set
  `cellStatus = "saved"`, and schedule the badge to fade to `idle` after 1.5 s.
  Skip any key that is dirty again — a newer local edit wins the display, but keep the new version.
- Replace `students[].summary` from the returned `summaries[]`. This is what makes the Sum column and
  the percentage badge update live without a refetch.
- For each `conflict`: write `conflict.current` into the cache, set `cellStatus = "conflict"`, and
  **do not** re-queue the local value. Show a row-level notice with "Keep mine" (re-queues with the new
  version) / "Keep theirs" (drops the local value). Never resolve silently in either direction.
- Clear `inFlightRef`; if `needsReflushAfterInFlight` or `dirtyRef` is non-empty, `flush("chained")`.

On network/5xx failure: merge `inFlightRef` back into `dirtyRef`, `cellStatus = "error"`, retry with
backoff `1s → 3s → 8s`, then stop and surface a persistent error bar with a manual **Retry**.
On `401`: do not retry — the existing `httpClient` refresh path handles it; re-flush once after.

### 3.4 Exit guards

- `useEffect` cleanup on unmount → `flush("unmount")` (fire-and-forget; the mutation is not aborted).
- `document.addEventListener("visibilitychange")` → when `hidden`, `flush("hidden")`.
- `window.addEventListener("beforeunload")` → if `dirtyRef.size > 0 || inFlightRef.size > 0`,
  `e.preventDefault()` to trigger the browser's leave prompt. Add and remove the listener with the
  dirty state, so a clean page never shows a spurious prompt.
- React Router: block accordion collapse and the back link while `dirtyRef.size > 0` by flushing first.

### 3.5 Cache invalidation policy

Delete the `invalidateQueries(["journals","detail",id])` calls in `hooks.ts:19,34,49`. Instead:

- Journal detail cache is maintained **only** by `setQueryData` from mutation responses.
- The progress chart (`["courses","progress-chart",courseId]`) is invalidated on a trailing 5 s debounce
  after the last successful save, so the chart catches up without fighting the editor.
- Set `staleTime: 30_000` on `useJournal` so a window refocus does not clobber in-progress edits.

### 3.6 Explicitly rejected alternatives

- **`localStorage` draft persistence** — adds a stale-draft reconciliation problem worse than the one it
  solves, given the server is reachable in ~700 ms. Not needed once the exit guards are in place.
- **Per-cell independent requests** — 260 cells × one request each is worse than one coalesced batch.
- **Removing the Save button entirely with no visible status** — autosave without a persistent
  "All changes saved" affordance reads as data loss. Status indicator is mandatory (§4.2).

---

## 4. Phase 3 — Restructure `JournalPeriodSection`

### 4.1 Split the component

`JournalPeriodSection.tsx` is 456 lines doing eight jobs. Split:

- `JournalPeriodSection.tsx` — header, expand/collapse, data fetch, owns the autosave hook.
- `JournalGrid.tsx` — the table shell, column headers, keyboard navigation, sticky columns.
- `JournalStudentRow.tsx` — one `<tr>`, wrapped in `React.memo`. Props must be primitives plus stable
  callbacks so a keystroke in row 3 does not re-render rows 1–20.
- `JournalScoreCell.tsx` — attendance toggle + score input + comment affordance + save indicator.
- `JournalSaveStatus.tsx` — the aggregate status pill.
- `ExamWeightModal.tsx` — extracted from `:428-453`, fully translated.

### 4.2 The save status pill

Sticky at the top of the expanded period, beside the period label. Single element, five states:

| State | Text (i18n key) | Visual |
| --- | --- | --- |
| idle, nothing dirty | `save.allSaved` "All changes saved" | muted text, check icon |
| dirty, debounce pending | `save.pending` "Saving soon…" | muted, pulsing dot |
| in flight | `save.saving` "Saving…" | spinner |
| just saved | `save.saved` "Saved" | green check, fades to idle after 2 s |
| error | `save.failed_one` / `save.failed_other` "{{count}} changes not saved" | red, with `save.retry` button |

Keep a **Save now** button visible but secondary (`variant="secondary"`), disabled when clean. Removing
the button outright is a regression in perceived control; demoting it is the right move. Its handler is
`flush("manual")`.

### 4.3 The score cell

Replace the `<select>` (`:327-340`) with a compact text-like control:

- A `<button>` per cell showing the score, or an em-dash when the lesson has no mark.
- Focused cell accepts `0`–`5` to set the score directly, `Backspace`/`Delete` to clear to 0,
  `Space` to toggle attendance, `c` to open the comment editor.
- Click opens a 6-item popover (0–5) — one interaction less than a native select, and it works on touch.
- `aria-label` must include the student name and the date, not just "Score" (`:332`) — a screen reader
  in a 260-cell grid needs the coordinates.

**Keyboard grid navigation** in `JournalGrid.tsx`: roving `tabindex` — exactly one cell is
`tabIndex={0}`, the rest `-1`. Arrow keys move focus; `Home`/`End` jump to row start/end;
`PageUp`/`PageDown` move by 10 rows. This is what makes autosave actually pay off: a mentor can mark a
whole class without touching the mouse.

### 4.4 Visual states

- Dirty cell: `ring-1 ring-amber-400/60 dark:ring-amber-500/50` — a ring, not a background, so it does
  not fight the sum badge colors, and it has a dark variant (fixes defect 10).
- Saving: same ring plus `opacity-70`.
- Saved: `ring-1 ring-emerald-400/60`, transitioned out over 400 ms after 1.5 s.
- Conflict: `ring-2 ring-red-500` and the row gets the reconciliation bar.
- Respect `prefers-reduced-motion` for the fade and the spinner.

### 4.5 Fix the sticky name column

The name cell at `:288` must be `<td className="sticky left-0 z-10 bg-card px-4 py-2">` with an inner
`<div className="flex items-center gap-2">`. Do not put `flex` on the `td`.
Add `shadow-[1px_0_0_0_var(--color-border-warm)]` so the frozen column reads as frozen when scrolled.

### 4.6 Period header context

Collapsed header should carry: period label, date range (`formatDate` both ends), lesson count, class
average badge for the period, and a completion indicator (`n/m` cells marked). Fetch is already
per-period, so compute averages from `detail` when expanded and from the `progressChart` datasets when
collapsed — the chart response already contains per-period scores (`courses.py:229-236`).

Mark the current period with a subtle `period.current` badge (the logic already exists at
`JournalDetail.tsx:53-58`).

### 4.7 Bonus/exam columns

Delete the per-row save button (`:384-400`). Both inputs feed `summaryDirtyRef` and autosave on the
same scheduler. Clamp on blur, not on change — clamping mid-typing (`:357`, `:371`) makes it impossible
to type `15` when the max is `20` and the field currently reads `1` (you get `1` → `15`, fine — but
typing `20` into a max-`20` field after clearing yields `2` → `20`, and deleting to empty yields `NaN`
→ `Math.min` → `0`). Handle the empty string as "no value yet", not `0`.

---

## 5. Phase 4 — The chart: student list with averages on the left

This is the explicit user request. Rewrite `JournalScoreChart.tsx` as a **two-pane component**:
a left rail listing students with their averages, and the line plot on the right.

### 5.1 Layout

```
┌─ Score progress ──────────────────────────────────────────────┐
│ [search students]                    [Show: all / top 5 / …]  │
├──────────────────────┬────────────────────────────────────────┤
│ ● Ivanov A.    92% ↑ │                                        │
│ ● Petrov S.    88% → │            (line chart)                │
│ ● Sidorov M.   74% ↓ │                                        │
│ ○ Orlov K.     61% ↑ │                                        │
│ …scrollable…         │                                        │
│──────────────────────│                                        │
│   Class average 79%  │                                        │
└──────────────────────┴────────────────────────────────────────┘
```

- Left rail: `w-56 shrink-0`, `max-h-[300px] overflow-y-auto`, one row per student.
- Each row: color swatch, avatar (`PersonAvatar`, size 20), name (truncate), **average percentage**
  (`tabular-nums`, `font-semibold`), and a trend glyph comparing the last period to the previous one
  (`↑` ≥ +3pp, `↓` ≤ −3pp, `→` otherwise) with `title`/`aria-label` giving the exact delta.
- **Sorted by average descending by default**, with a sort control (`avg desc` / `name` / `last period`).
- Rows are toggles (replacing the bottom legend at `:202-215`): click to hide/show the series; hidden
  rows use a hollow swatch and `opacity-50`. Keep `aria-pressed`.
- Hovering/focusing a row **highlights that series** in the plot (others drop to `opacity-25`,
  stroke-width 3 on the highlighted one). This is what makes 20 series readable without 20 hues.
- Pinned footer row inside the rail: **class average** across all students.
- Below `lg`: the rail moves *above* the chart as a horizontally scrollable strip of the same chips.
  Never let the page body scroll horizontally.

The last x-axis point labelled "Average" (`:150`) stays in the data but should be **excluded from the
plotted line** and rendered only in the rail — a mean is a different quantity from a period total and
must not sit on the same trend line. Slice it off: `labels.slice(0, -1)`, `values.slice(0, -1)`, and
read `values[values.length - 1]` for the rail. (`CourseProgressChart.tsx:26-29` already does this
slicing correctly — follow that precedent.)

### 5.2 Chart fixes

- Compute `max` from `visibleDatasets`, not `datasets` (fixes defect 18) — and keep the floor at 100
  so a strong class doesn't get a misleadingly compressed axis.
- **Cap distinct hues at 8.** With more students, color only the top 8 by average (or the
  hovered/selected ones) and render the rest in a neutral `text-border` stroke at `opacity-40`. Identity
  comes from the rail row, not the hue. Delete the 20-color palette (`:33-38`).
- Colors must come from the enrollment's `color_hex` when it is set and distinct — keep the
  dedup pass at `:49-56` but drop the index-cycled fallback in favor of the neutral treatment.
- Tooltip: show **only the nearest series** plus the class average at that x, not all 20 rows. Flip
  horizontally (`translateX(-100%)`) when `hoverIndex > labels.length / 2` so it never overflows the card
  (fixes defect 16). Include period label, `score / max_score`, and percentage.
- Render points only for the hovered index and the series endpoints; draw the rest as path only
  (fixes defect 19). Move `hoverIndex` handling into a `useCallback` with the closest-index math
  memoized against `labels.length`.
- Add `role="img"` with an `aria-label` summarizing the chart, and a visually-hidden `<table>` of the
  same data for screen readers.
- Keep an explicit empty state and add a loading skeleton — `JournalDetail.tsx:127` renders the chart
  with `undefined` data during load, which currently flashes the "no data" message before the real data
  arrives. Pass `isLoading` down and branch on it.

### 5.3 `JournalDetail.tsx` page structure

- Sticky page header (course title, mentor, student count, back link) that condenses on scroll.
- A metrics strip under the header: class average, attendance rate, periods completed, at-risk count
  (average < 60%). Follow `JournalsStatsStrip.tsx` for the visual language.
- Chart, then periods.
- Only one period section holds a live autosave engine at a time (only the expanded one fetches —
  `:54` already guards this with `expanded ? period.id : undefined`; preserve that).
- The collapse handler (`:155-160`) must await the autosave flush before collapsing.
- Replace the single-slot `Toast` with a small stack, or keep the toast for errors only — with autosave,
  a success toast per save would be noise. **Success is communicated by the status pill, not a toast.**

---

## 6. Phase 5 — Translations

All three locales must be updated in the same commit: `en`, `ru`, `tg`. No `t("key", "English default")`
fallbacks — the codebase's own `CourseProgressChart.tsx` does this and it is why Russian strings are
hardcoded in source there. Do not repeat it.

Add to `frontend/src/i18n/locales/*/journals.json`:

```jsonc
{
  "save": {
    "allSaved": "…", "pending": "…", "saving": "…", "saved": "…",
    "failed_one": "…", "failed_other": "…", "retry": "…", "saveNow": "…",
    "offline": "…", "unsavedWarning": "…"
  },
  "conflict": {
    "title": "…", "body": "…", "keepMine": "…", "keepTheirs": "…"
  },
  "period": {
    "week": "Week {{n}}", "month": "Month {{n}}",     // existing
    "current": "…", "range": "…", "lessons_one": "…", "lessons_other": "…",
    "completion": "…", "average": "…"
  },
  "chart": {
    "title": "…", "average": "…", "noData": "…",       // existing
    "classAverage": "…", "studentAverage": "…", "sortBy": "…",
    "sortAvgDesc": "…", "sortName": "…", "sortLatest": "…",
    "searchStudent": "…", "showAll": "…", "topN": "…",
    "trendUp": "…", "trendDown": "…", "trendFlat": "…",
    "hideSeries": "…", "showSeries": "…", "ariaSummary": "…", "loading": "…"
  },
  "table": {
    "…existing…",
    "sum": "…",                                        // currently the literal "Sum" in ru and tg — fix
    "examMax": "…", "editExamWeight": "…", "examWeightTitle": "…",
    "examWeightWarning": "…", "examWeightLabel": "…", "examMaxUpdated": "…",
    "examMaxUpdateFailed": "…", "maxN": "…",
    "scoreCellLabel": "…", "attendanceCellLabel": "…", "commentCellLabel": "…",
    "gridHelp": "…"
  },
  "metrics": { "classAverage": "…", "attendanceRate": "…", "periodsDone": "…", "atRisk": "…" }
}
```

Notes for the translator-agent:

- `save.failed_one` / `save.failed_other` use i18next plurals. Russian and Tajik need the full plural
  set — for `ru` that is `_one`, `_few`, `_many`; `studentsCount` at `:13` is already wrong in `ru`
  (`"{{count}}"` with a single form reads "5 студентов" but also "1 студентов"). Fix it while you are
  in the file.
- `table.sum` must become a real word: `en` "Total", `ru` "Итог", `tg` "Ҷамъ".
- `table.maxN` takes `{{n}}` so `(max 20)` and `(max {{exam_max_score}})` (`:272-273`) stop being
  concatenated English.
- `chart.ariaSummary` takes `{{students}}` and `{{periods}}`.
- Cell `aria-label`s interpolate `{{name}}` and `{{date}}`.
- Keep terminology consistent with the existing `courses` namespace: "Средний"/"Миёна" for average.

Verification: `grep -rn 't("' frontend/src/components/journals frontend/src/pages/JournalDetail.tsx | grep ', "'`
must return nothing (no inline defaults), and every key present in `en/journals.json` must exist in
`ru` and `tg`. Add that key-parity check as a small vitest in `frontend/src/i18n/`.

---

## 7. Accessibility requirements

- The grid is a real `<table>` with `<th scope="col">` and `<th scope="row">` — the student name cell is
  currently a `<td>` (`:288`); make it a row header.
- Roving tabindex (§4.3), never `tabindex` on every cell.
- Save status pill: `role="status" aria-live="polite"` so state changes are announced. The conflict bar:
  `role="alert"`.
- All state must be conveyed by more than color: the dirty ring pairs with a small dot glyph; the trend
  arrows in the chart rail carry text alternatives.
- Focus rings visible on every interactive cell — `focus-visible:ring-2 focus-visible:ring-maroon`.
- Score popover: `Escape` closes and returns focus to the cell; arrow keys move through the options.
- Respect `prefers-reduced-motion` for all fades, the spinner, and the header condense.
- Verify contrast for the amber/emerald/red rings in both themes.

---

## 8. Performance budget

Target: a 25-student × 13-lesson period (650 editable cells).

| Metric | Budget | How |
| --- | --- | --- |
| Keystroke → paint | < 16 ms | Dirty buffer in a ref; `React.memo` on rows; no context re-render |
| Rows re-rendered per edit | 1 | Stable callbacks via `useCallback`, primitive props |
| Requests during a 30-cell burst | ≤ 3 | 700 ms debounce + 3 s max latency + in-flight coalescing |
| Refetches of journal detail during editing | 0 | `setQueryData` only; no invalidation (§3.5) |
| Chart nodes | < 300 | Points only at hover index + endpoints |
| Chart re-render on pointer move | chart only | `hoverIndex` state stays inside the chart; rail is memoized |

Verify with the React DevTools Profiler: record a 10-cell edit burst and confirm only the edited rows
and the status pill commit. Confirm request count in the Network tab.

---

## 9. Testing

**Frontend (vitest + RTL)**, new `frontend/src/lib/journals/useJournalAutosave.test.ts`:

1. Debounce coalescing: 5 edits within 700 ms → exactly 1 request containing 5 items.
2. Max latency: continuous edits every 300 ms for 4 s → at least one flush before the stream ends.
3. In-flight coalescing: edit during a pending request → second request fires only after the first
   resolves, and contains only the new edits.
4. Version reconciliation: response versions land in the cache; a follow-up edit sends `v+1` and no
   409 occurs.
5. Conflict: a conflicted cell shows server state, is flagged, and the local value is *not* auto-resent.
6. Failure and retry: 500 → items return to the dirty buffer, backoff retries, then a manual retry
   succeeds and clears the error.
7. Unmount and `visibilitychange` both trigger a flush of pending edits.
8. No `invalidateQueries` on the journal detail key during a save (spy on the query client).

**Component tests** for `JournalScoreChart`: the left rail lists every student with the average from the
last data point, sorted descending; toggling a row rescales the y-axis; the tooltip flips side past the
midpoint.

**i18n**: key-parity test across `en`/`ru`/`tg` for the `journals` namespace.

**Backend**: §2.5.

**Manual QA checklist:**
- Mark a full week by keyboard only; confirm the pill reaches "All changes saved" and a hard reload
  shows every mark.
- Kill the network mid-edit; confirm the error state, then restore and confirm recovery with no loss.
- Two browser windows on the same period: edit the same cell in both; confirm the conflict UI, and that
  the *other* cells in the batch still saved.
- Close the tab with a pending edit; confirm the browser prompt.
- All three languages; verify no English leaks and no clipped labels in Tajik (longest strings).
- Dark mode for every new state color.

---

## 10. Order of work

Each step is independently reviewable. Do not start a step before the previous one's tests pass.

1. **Backend contract** (§2) + backend tests + regenerate `CONTRACT.md`.
2. **Frontend types and endpoints** (`types.ts`, `endpoints.ts`) matching the new responses.
3. **`useJournalAutosave`** (§3) + its unit tests, wired to the existing table with zero UI change.
   *At the end of this step, autosave already works.* Ship-able checkpoint.
4. **Component split and grid UX** (§4) — status pill, score cell, keyboard navigation, sticky column
   fix, bonus/exam autosave, period header context.
5. **Chart rewrite** (§5) — left rail with averages, hue cap, tooltip, axis fix.
6. **Page structure** (§5.3) — sticky header, metrics strip, toast policy.
7. **Translations** (§6) across all three locales + parity test.
8. **Accessibility and performance pass** (§7, §8) with profiler evidence.

## 11. Acceptance criteria

- [ ] No edit in the journal grid requires a click on a Save button to persist.
- [ ] Leaving the page, collapsing a period, or hiding the tab never loses an edit.
- [ ] A failed save is visible, recoverable, and never silently discards the user's value.
- [ ] A concurrent edit by another mentor produces an explicit conflict UI, never a silent overwrite,
      and never blocks the non-conflicting cells in the same batch.
- [ ] Typing in the grid causes no visible lag and no table remount at 25×13.
- [ ] The chart shows every student's average in a sorted left-side list without hovering.
- [ ] Every user-facing string resolves from `journals.json` in `en`, `ru` and `tg`; no inline defaults.
- [ ] The full grid is operable by keyboard alone and announced correctly by a screen reader.
- [ ] `cd backend && pytest app/tests/integration/test_journals.py -q` passes;
      `cd frontend && npm run test && npx tsc --noEmit` pass.
