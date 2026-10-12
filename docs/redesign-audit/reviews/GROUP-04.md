# Group 04 independent review — journals and grading

Status: recommendations for approval only. The baseline plan, application, tokens, data and capture artifacts have not been changed. No implementation or runtime mutation tests were performed. This review does not close implementation tasks.

The baseline identifies the right central problem: the phone presents a gradebook that cannot be used to grade. Its Lesson view, period selector, readable persistence state and secondary Progress view should stay. The highest-value additions are precise editing semantics and draft ownership; adding more analytics or modes would weaken this workspace.

## Evidence inspected and limits

Read [Group 04 PLAN](../group-04-journals/PLAN.md), [README](../README.md), [IMPLEMENTATION](../IMPLEMENTATION.md), [MOTION](../MOTION.md), and [tokens.md](../../../tokens.md). Applied the requested mobile-native, emil-design-eng, find-animation-opportunities and pick-ui-library skills; project constraints take precedence over illustrative skill recipes.

Actually viewed all six PNG contact sheets: `superadmin-journals-contact.png`, `mentor-journals-contact.png`, `superadmin-journal-detail-contact.png`, `mentor-journal-detail-contact.png`, `superadmin-exam-limit-contact.png`, `mentor-exam-limit-contact.png`. Original images inspected separately:

- [mentor detail, phone light](../group-04-journals/screenshots/mentor-journal-detail-mobile-light.png): the first viewport is consumed by identity, four metrics and a chart; the visible table shows only names/totals/percentages. Names clip and desktop keyboard instructions remain on phone.
- [superadmin detail, desktop dark](../group-04-journals/screenshots/superadmin-journal-detail-desktop-dark.png): the large chart sits above the working grid; orange selected cells compete with orange brand/navigation; nine colored student lines overlap. A 102% result is visible.
- [mentor hub, phone dark](../group-04-journals/screenshots/mentor-journals-mobile-dark.png): three tall statistic cards precede search and two course cards; one metric is unavailable. This consumes attention without helping select a journal.
- [superadmin exam setting, desktop light](../group-04-journals/screenshots/superadmin-exam-limit-desktop-light.png): small central modal, generic maximum-score label, and recalculation warning, without visible course/period context. The full-page capture extends below the viewport scrim; that alone is not proof that the on-screen modal backdrop fails.

The manifest contains **20 accepted captures**. **Four phone exam-dialog variants remain uncaptured**, because sticky table headers intercepted the ordinary trigger click. This review neither forces that control nor substitutes a synthetic capture. No phone dialog, keyboard-open state, saved edit, conflict, error, empty collection or archived read-only state was visually verified. Source findings below are identified separately from screenshot observations.

Viewed the exact supplied `KITOB Brand Guidelines Poster.png`, complete `ChatGPT Image Oct 8, 2026, 05_14_59 PM-1.png`, and emblem `…PM-2.png` in `/home/compilelord/Downloads`. Their navy/blue/orange book identity supports the proposed calm palette. Use the real assets through Group 01; the journal does not need another hero, book illustration, serif data heading or ornamental growth motif. Preserve proportions and clear space. Raster edge speckling is visible in the supplied asset previews; asset preparation and inspection on actual light/dark backgrounds belong to the shared asset package, not a new Group 04 logo treatment.

## Baseline decisions to retain

| Before: visible baseline | After: already specified by PLAN | Why |
| --- | --- | --- |
| Chart and metric stack before editable content | Gradebook first; Progress secondary | Daily work should be reachable immediately. |
| Phone identity and total columns conceal editing | Dedicated Lesson rows; Summary for period totals | Makes grading possible at 320–390px without document overflow. |
| Historical Week 5 carries Current badge | Date-active period, otherwise accurate Latest label | Prevents editing under false temporal context. |
| Small offscreen exam-settings trigger | Period settings outside the scroll region | Resolves the documented reachability failure. |
| Hidden save icon, wheel hijacking, tiny/hover-only controls | Reserved status, native scroll, named controls | Trust and predictable navigation are essential. |
| Warm maroon/orange interface | Central semantic KITOB tokens in both themes | Existing token plan is sufficient; no second journal palette is needed. |

These are confirmations, not new scope. Keep the permission rules, four data states, three locales, shared date formatting, valid zero/over-100 results, accessible dialogs and required regression suites already in the plan.

## Must-fix additions before implementation

### M1 — Specify one grading context and an implementable phone structure

**Classification:** design and interaction specification; new detail within the existing Lesson-view proposal. **Evidence:** both detail contact sheets and the phone light original show an extremely tall preamble, clipped names and no reachable lesson editor.

Use this phone order: Back to Journals; wrapping course title; compact mentor/read-only context; a full-width period control with date range and state plus a separate 44px Period settings action; Gradebook/Progress; inside Gradebook, Lesson/Summary; lesson previous/date/next controls; one reserved save-status line; divided student rows. Avoid four metric cards above the roster. At 390×844 in the default locale, at least one complete editable student row should fit before scrolling, after the shared shell is present. Long translated text may grow naturally; never achieve this target by clipping titles or shrinking text.

Each student row has a full-width wrapping name, followed by an action line: labeled attendance control, score button displaying the current value, and a 44px comment action. At 320px, wrap the action line rather than compress controls. Use 16px names, 14px supporting labels, 12px secondary metadata only, 16px page gutters and quiet row dividers. Keep comments visibly identifiable when present. An error/conflict line may expand below the row; normal saves should not repeatedly alter row height.

Only the lesson/date context and reserved status may remain sticky while scrolling the roster; do not stack sticky global header, title, tabs, period selector and lesson toolbar until they consume the viewport. Bound overlays above the bottom navigation and safe area. Modal focus makes background navigation inert; do not let the bottom bar cover the comment form footer. Software keyboard changes must not close or clear the comment draft.

Default lesson selection must be deterministic: valid explicit lesson date in selected period, otherwise today's scheduled lesson, otherwise latest scheduled lesson on/before today, otherwise first scheduled lesson. Previous/next stop at the period boundary; never silently change the period. Invalid period/date links show a brief localized notice before using the fallback. The selected period and lesson must survive returning from a profile and browser Back/Forward. Dates use shared formatters and date-only comparisons appropriate to the course's established calendar semantics.

**Benefit:** prevents wrong-lesson edits and makes the first phone screen useful. **Dependency/risk:** shared shell, shared surface primitive and period route state. No new backend capability is needed for selection within the supplied `lesson_dates`; if course timezone semantics are unspecified, resolve them explicitly instead of relying on UTC string slicing.

### M2 — Define score, attendance and comment actions once for all input methods

**Classification:** existing-behavior repair and tests, separate from visual styling. **Source evidence:** `JournalScoreCell.tsx` sends `{attendance: !attendance, score}` for Space, but checkbox uncheck sends score `0`. `useJournalAutosave.ts:358` and `JournalService.batch_update_entries` normalize any positive score to attendance `true`. Consequently Space on a positive-scored entry cannot produce the same absence change as the checkbox. This is a source finding, not a captured interaction.

Use one canonical edit command for desktop keyboard, checkbox and phone controls. Preserve the backend rule: choosing 1–5 marks attendance present; choosing 0 retains the current attendance. An explicit absence action must use the established checkbox semantics—attendance false and score 0—through every input path. Preserve the existing comment unless explicitly edited/cleared. Explain the score-reset consequence alongside the attendance control or in contextual help; do not introduce a confirmation dialog for every student.

The phone six-choice score picker should show the student, selected lesson date, current score and choices 0–5 in a 3×2 layout with at least 44px targets. Choosing a value updates the row immediately, queues autosave, closes the picker and returns focus to the initiating score button. Escape/Close changes nothing. Do not auto-advance phone focus to another student unexpectedly. Desktop's existing downward advance after keyboard grading remains explicit, documented and tested. Picker opening and keyboard navigation are immediate.

Comment Save means apply the comment draft to the journal's existing autosave flow; after dismissal, the row/global status must still say Saving or Unsaved until acknowledged. Cancel discards only the open comment draft, not earlier journal edits. An empty saved comment is an explicit clear. Escape/outside dismissal with a modified comment must have a defined retain/discard behavior; use the same behavior in desktop and phone shared editors.

**Acceptance:** identical payload and visible results for Space, checkbox and phone absence; selecting zero does not imply absence; choosing positive score implies presence; changing a grade preserves comment; cancel sends no comment mutation. **Risk:** do not call existing inconsistent front-end behavior a new scoring policy or silently change backend rules.

### M3 — Give autosave one owner across Lesson, Summary and Progress

**Classification:** implementation architecture necessary for the planned redesign; not a new user feature. **Source evidence:** `JournalPeriodSection.tsx` owns the autosave hook using `expanded ? period.id : undefined`; `flush()` in `useJournalAutosave.ts` returns early when a request is already in flight and catches failures internally. Thus simply awaiting the current `flush()` is not a reliable navigation success check.

Own the selected journal's draft/queue above the responsive views and tabs, keyed by actual journal ID. Mode changes, opening student breakdown and resizing must not recreate the queue. Keep one canonical draft per entry and per summary; never mount independent mobile and desktop hooks for the same journal. Store focus by student ID, lesson date and control, rather than row index.

For period/course/route navigation, a drain operation must settle only when that journal's queued and in-flight edits are acknowledged, or return a typed failure/conflict outcome. Do not attach unresolved old-period drafts to the new journal ID. On failure, keep the user in the old context with Retry, Stay and an explicit discard path. Browser unload remains best-effort; do not promise a guaranteed network save. Returning from an authorized student profile restores the selected lesson and roster position after successful persistence.

Aggregate state must include entry drafts, exam/bonus drafts, requests in flight and unresolved conflicts. Priority: Conflict, Failed, Saving, Unsaved, Saved. Never announce Saved while a conflict remains. Provide one polite status region and an accessible Review action leading to affected entries. Navigation and cell values update immediately; acknowledgements arrive asynchronously with stable layout.

**Acceptance:** switch Lesson→Summary→Progress during debounce; switch period during a slow request; failed navigation flush; resize while dirty; summary-only in-flight request; browser Back; multiple rapid changes to the same cell. Assert request journal IDs, final server values, retained drafts and focus. **Dependency/risk:** queue work should precede responsive editors. The baseline says preserve contracts, not preserve unsafe hook internals.

### M4 — Preserve the actual local values for conflict review and partial success

**Classification:** existing persistence repair that makes the baseline conflict UI implementable. **Source evidence:** `useJournalAutosave.ts` applies `conflict.current` to the editor cache and later Keep mine reads that cache. The proposed Your value/Server value comparison needs a separate local snapshot. A dirty edit that exists when a conflict arrives is also automatically rebased by current code. Separately, successful entry batches are not applied to cache until all summary requests in `Promise.all` finish; a summary failure can enter the common retry path after some operations have succeeded.

Record the sent local value, latest local draft and returned server value/version separately. Conflict review displays student, date, field labels and complete differing values; comments must be readable, not only represented by a conflict dot. Keep mine submits the intended latest local draft with the returned version; Use server updates both visible entry and authoritative summary. A second concurrent write can conflict again and must remain reviewable. A conflict with `current: null` needs a localized unavailable-entry state and refetch action; do not leave Keep mine enabled when no version exists.

Track entry-batch results and individual summary outcomes separately. Apply confirmed successes immediately; retry only unsettled work, without reverting newer drafts to older in-flight snapshots. Disable duplicate conflict-resolution submission while pending, while keeping unrelated rows usable.

**Acceptance:** another editor changes score/comment; Keep mine preserves the actual local score/comment; user makes a newer change during request; one summary fails while another summary and entry batch succeed; repeated stale version; missing current entry. **Benefit:** makes the proposed trust UI true. **Risk:** no backend concurrency semantics should be loosened to make the interface appear successful.

### M5 — Separate real zero, missing entry and ungraded-domain state

**Classification:** contract clarification; any new graded/ungraded distinction is domain/schema work, not a cosmetic fix. **Visible evidence:** detail images show score dashes beside 0% totals, completed periods, and 102%. **Source evidence:** `JournalEntryResponse.score` is a number with no graded flag; `JournalStudentRow` substitutes score 0 for a missing entry; the service's `cells_filled` counts `JournalEntry` rows, not explicit grading decisions.

Render an actual numeric zero as 0 and a missing response/summary as unavailable. Do not label score 0 as Not graded, and do not infer Completed/Needs grading from positive scores. The current DTO does not establish whether a stored zero was deliberately awarded or represents an untouched record. The plan's graded-only chart gate needs a verified existing domain signal or a separately approved minimal backend task defining it. Until then, use accurate period-score wording and the available period list; do not invent a graded count, inferred progress percentage or ungraded filter.

Metric labels must state scope: selected period versus whole course. Backend course averages must not be relabeled selected-period averages when the period changes. In Summary, show the server components and denominator together: homework, attendance, exam, bonus, total/max and percentage. Existing core constants give homework 0–5 per lesson, one attendance point, bonus up to 20 and exam maximum 0–100; verify against the live contract during implementation. Preserve valid above-100 percentages and avoid capping the displayed value.

**Benefit:** removes misleading precision without inventing educational policy. **Dependency:** a grading-state decision affects Group 06 as well; define it once across staff/student views, generate the contract and update types together if approved.

### M6 — Make summary edits deliberate and preserve paired fields

**Classification:** existing edit reliability plus detailed design, not additional scoring capabilities. **Source evidence:** `JournalStudentRow.tsx` commits exam and bonus on blur, using the other field from the server summary; `editSummary` replaces the queued draft per student. Editing both before an acknowledgement can overwrite one local value. Local text inputs initialize from props without a synchronization policy.

Summary rows should open a student-period breakdown in place, with one labeled Edit exam and bonus action. The bounded editor presents both fields together, current allowed ranges, existing totals and Apply/Cancel. Numeric inputs are 16px, use a numeric keyboard and reject out-of-range/non-integer input inline; do not silently clamp or convert invalid text into zero on blur. Apply queues both values from the same local draft and existing summary version; Cancel sends no write. Return focus to that student's action and keep the roster position. Keep ordinary Summary reading independent of the edit form.

Period settings should not recalculate the exam maximum while unresolved exam/bonus edits are pending: drain the queue first, preserve context on failure, then submit the maximum change and apply returned summaries. Show current period name/range, current maximum, allowed 0–100 range and the existing recalculation explanation. Do not predict new percentages before the server supplies them unless the established scoring contract is used consistently.

**Acceptance:** edit bonus then exam before debounce, failed save then retry, server refresh while editing, cancel, keyboard-open phone footer, and maximum reduction below an existing score. **Dependency/risk:** this adds explicit editor behavior to an already existing mutation; it does not add bulk grading or new weighting rules.

## Remove or narrow these baseline recommendations

| Exact baseline recommendation to remove/narrow | Replacement | Why and scope |
| --- | --- | --- |
| “Optional full Table mode may scroll locally” on phone | Ship Lesson and Summary only on narrow layouts; keep the desktop table at widths that support it | A third phone mode recreates the obstructed spreadsheet, adds state/focus work and has no demonstrated user need. This removes optional scope. |
| “A shallow summary shows class average, attendance, completion and at-risk count” before grading | Move analytical metrics to Progress; Gradebook shows period/date, roster count and save status | Even a shallow four-metric strip competes with the teaching task and introduces scope/denominator dependencies. Phone evidence strongly supports removing it. |
| “Selecting a student opens the authorized profile or their period breakdown” | Open the period breakdown in place; provide a separate explicit View profile link only when authorized | Removes an implementation ambiguity and avoids a route change when the teacher expects score details. Preserve dirty-draft handling for the explicit link. |
| “Surface opening reuses motion-safe 200ms CSS” when applied to the score picker | Grade picker/focus/lesson changes are immediate; retain 200ms only for occasional settings/comment surfaces | The grade picker may open dozens or hundreds of times per teaching session. Repeated 200ms motion fails the frequency gate. |
| “Readable journal rows or a two/three-column grid” | Choose divided rows as the initial hub layout for both roles; reserve card variants for a demonstrated need | The current tiny desktop catalogs and tall phone cards do not need a second visual system. A row supports wrapping title, cadence, status and optional admin mentor identity without empty card footers. |

These are proposed baseline deletions only; no plan has been edited. Do not remove the chart/table accessibility alternative, error/retry states, persistence checks or permissions to save implementation effort.

## Useful additions, ranked after the must-fix work

1. **Student search within the selected period.** Existing-data UI capability, not new server search: one clearly scoped 16px search field above the roster, full names preserved, stable roster order, localized “No students match” plus Clear search. Typing in search never invokes grade shortcuts. Filtering does not discard hidden rows' pending edits; global status still includes them. Show matched/total count only when filtering, not another permanent statistic card. Evidence: clipped identity in phone detail, nine seeded students, and chart-only search on desktop. No roster-scale/performance claim is made from nine students.
2. **Compact scoring explanation in Summary.** Design-only use of established server components: a “How this total is calculated” disclosure near total/max explains homework + attendance + exam + bonus and the denominator. This makes the observed 102% understandable. Avoid a page-wide explainer above grading; avoid deriving policy from chart color or course cadence alone.
3. **Stable local navigation state.** Extend the planned period URL handling to selected view/lesson where useful, without persisting personal drafts in URLs or storage. Use history replacement for rapid date/view selection if it prevents dozens of meaningless Back steps, and document the history policy. Resizing between desktop/mobile restores the same period and student context, never resets to the newest period.

Potential new domain capabilities—graded-state tracking, bulk “mark all present”, a dedicated missing-work queue, offline persistence and multi-session draft recovery—are **not** included by these UI recommendations. They require separate user approval, semantics and tests. Bulk attendance is especially inappropriate as an unsolicited shortcut: it changes many student records with one action.

## Theme, motion and dependency decisions

Use `bg-card` for the stable working surface, `bg-strip`/`bg-beige` for context, `text-ink`/`text-muted` for hierarchy, semantic borders, primary blue for selected lesson/focus and ordinary primary actions. Orange is sparse attention emphasis, never the normal color of every saved grade or a generic error. Use dedicated success/warning/destructive pairs for persistence states and pair them with text/icon semantics. Preserve tabular numerals and readable zeroes. No raw palette values in page styles; both themes come from the shared token contract.

`frontend/package.json` already supplies React Query, Zustand, React Router, React Hook Form and Zod. No grading package is warranted. Reuse the accessible shared dialog/popover primitive selected in Group 01; this review does not request an additional library or installation. The score picker does not justify a drawer/gesture package. Keep charts as existing SVG plus table.

| Location | Today | Purpose | Frequency | Suggested motion and gate |
| --- | --- | --- | --- | --- |
| Period settings / occasional comment surface | Hand-built overlays; phone keyboard behavior unverified | Spatial consistency | Occasional | Reuse shared opacity 0→1 and scale .96→1, 200ms ease-out; `motion-safe:` only; immediate focus/accessibility lifecycle. Eligible only while occasional. |
| Standard pointer controls | Inconsistent small-control feedback | Feedback | Repeated | Project-standard transform 1→.96 at 150ms ease-out with `motion-safe:`; values/actions commit immediately and focus geometry stays stable. No pointer-only behavior required for keyboard use. |

Rejected: score-picker entrance/exit (frequency); moving focus or selected lesson (keyboard/frequency); animated score totals and chart drawing (functional data); row entrances/stagger (frequent rerender and reading); overscroll suppression on the whole document (native page scrolling must work). Native sheet containment and physical-device keyboard testing remain required. Keep source text selectable; only controls suppress selection.

## Implementation order and verification handoff

After approval: shared shell/tokens/primitives → canonical edit semantics and grading-state contract decision → queue/conflict/summary fixes → selected-period routing → desktop grid and phone Lesson/Summary → Progress and period settings → final locale/theme/physical-device checks. Existing hub row cleanup can proceed independently after the shared shell; new backend grading-state work must remain a separate task/commit from styling.

In addition to the baseline tests, require the M2–M6 behavioral cases above. Geometry checks at 320/390/768/1024/1440 in both themes and en/ru/tg should verify no document horizontal overflow, wrapping long names, reachable settings, 44px controls, 16px inputs, stable focus after filtering/refetch, and the first usable phone grading row. Add keyboard tests for Tab entry/exit, arrows/0–5/Space/C, no shortcut interception inside text fields, Escape and return focus. Use real phones to verify comment/exam input with the keyboard open, safe areas and scroll containment. Loaded captures do not establish loading/error/empty correctness; verify each pane separately, with working retry.

This review used read-only source inspection, including the gitignored `frontend/src/lib/journals/` files. No source/type files were changed or staged. No new capture, backend/frontend test run, contract generation, task status update or commit was performed because this is the separately requested recommendation review. The strongest approval candidates are M1–M4 plus removing phone Table mode and pre-grading metric cards; M5 is a necessary contract decision before claiming graded-only analytics.
