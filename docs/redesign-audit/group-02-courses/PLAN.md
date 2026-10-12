# Group 02 — Staff courses

Status: independently reviewed and revised with the user's approval of [Group 02 recommendations](../reviews/GROUP-02.md). Implementation has not started. Implement after [Group 01](../group-01-auth-shell/PLAN.md) shared shell, tokens and surfaces. Screenshots show the original application, not this target.

## Evidence and limits

[Page manifest](manifest.json) contains 16 real seeded captures: course list/detail for superadmin and mentor at 1440 × 1000 and 390 × 844 in both themes. [Admin list](superadmin-courses-contact.html), [mentor list](mentor-courses-contact.html), [admin detail](superadmin-course-detail-contact.html) and [mentor detail](mentor-course-detail-contact.html) expose the images. [Surface manifest](surfaces/manifest.json) adds 12 create/edit/enrollment captures in the same size/theme combinations: [Create](surfaces/superadmin-create-course-contact.html), [Edit](surfaces/superadmin-edit-course-contact.html), [Enrollment](surfaces/superadmin-enroll-student-contact.html). All seven contact sheets and eight selected original images were independently inspected; the review names the files and supplied KITOB assets.

The captured admin phone detail is 3,906px tall. Roster names disappear while prices and withdrawal controls survive; period columns become color slivers. Mentor names wrap into narrow columns. List summary cards delay results. Create/edit surfaces expose the underlying page and their footers meet partly hidden required controls. English-mode screenshots contain Russian labels. Mentor list cards claim no assignment although detail identifies the mentor. No document-level overflow was reported, which does not establish readable inner content.

`screenshots/superadmin-course-detail-desktop-light.png` displays 101–102% scores, a 65% headline average and a 64% trend summary. These need scope/denominator verification; the screenshot does not prove a scoring defect. `surfaces/screenshots/superadmin-edit-course-desktop-dark.png` and `CourseUpdate` establish immutable price/exam/schedule terms. Source establishes immediate enrollment on candidate selection and exclusion filtering over only the first 20 candidates.

No forms were submitted or candidates selected during capture. Duplicate/delete/withdrawal confirmations were source-reviewed, not captured. Loading/error/alternative empty states, focus return, dirty dismissal, actual motion and physical-phone keyboards remain implementation acceptance criteria. This revision did not capture or mutate the live application.

## Visual and responsive contract

Apply [tokens.md](../../../tokens.md): KITOB navy, blue, orange and white through semantic tokens only. Canvas uses `bg-cream`, panels `bg-card`, quiet summaries `bg-strip`, selected tabs `bg-beige`, main text `text-ink`, metadata `text-muted`, structural dividers `border-border`, and actual control boundaries the distinct `control-border` token. Interactive rows use `bg-row-hover`. Primary controls use primary/on-primary pairs: navy/white in light, pale-blue/dark-ink in dark, never legacy orange dark-primary styling. Orange is sparing emphasis, not a score ramp or white-text button. Status/risk color always accompanies text. Remove arbitrary colored roster stripes and repeated colored metric icons.

Use the shared 240px desktop sidebar at 1024px and above and Group 01 labeled phone navigation below; reserve its height plus safe-area inset. Desktop gutters are 28–32px, phone gutters 16px, content maximum width 1440px. Titles are 28/36px desktop and 24/32px phone; body/phone inputs 16/24px, desktop data 14/20px. Cards have 16px radius and 16px phone / 20–24px desktop padding; controls 10px radius, targets at least 44px, inputs 48px high. Use 16px between related groups and 24px between sections. Long labels grow naturally; fixed heights must not hide content.

Below 768px use compact course rows and single-period Progress. At 768px and above use desktop content presentations even while the shell remains mobile below 1024px. Course cards use two columns when each can retain 320px plus a 20px gap; three only when actual content width supports the same minimum. Prefer fewer columns/rows to reduced text size.

The shared shell owns KITOB branding; course images identify courses. Missing images retain the same geometry with a quiet course/book icon, not another full KITOB logo. Group 01 prepares the supplied assets' stray raster edges. No large emblem, banner or decorative background enters course content.

All visible copy, accessible names, errors and counts use `t()` in en/ru/tg. Dates/times use shared locale formatters; no local date functions or time slicing. Money remains a decimal string with existing decimal format/comparison helpers. Changing numbers use `tabular-nums`.

## `/courses` — anatomy and role behavior

Desktop order: title with authoritative course count; admin Create course opposite; toolbar; results; pagination. There is no summary metric strip. All/Active/Archived may include counts only if authoritative global counts exist, never counts derived from one page. Organization enrollment totals stay on the dashboard.

Toolbar contains growing search, visible status choices, supported sort and the existing desktop row/grid choice. Wrap groups without squeezing targets. Cards contain a reserved 112px image region, linked wrapping title, one status, mentor when available, date range, quiet exam cadence and monthly price. Price/footer aligns across different title lengths through flex layout. Description appears only in detail. Admin overflow is a sibling to navigation, never nested inside a link. Desktop rows use the same information hierarchy and neutral separators. Mentor cards and desktop rows also expose a labeled secondary Open journal link, separate from the title link; direct journal access is available in every presentation, not only on phones.

Below 768px use one `bg-card` result region with row dividers. Each row has a 48px thumbnail, flexible identity body and optional separate 44px admin overflow. Title wraps across two ordinary lines and expands for longer names when necessary; mentor follows; date/price occupy wrapping metadata lines. Mentor rows add a labeled secondary Open journal link below metadata, saving a detail visit without taking title width. Title still opens Overview. Use the existing authorized course journal destination. The ordinary seeded layout should expose two complete rows at 390 × 844 after title/search/status; translations, zoom and smaller viewports may increase height rather than clip content.

Phone toolbar is full-width search, visible status choices and a Filters trigger for supported sort. Indicate a nondefault sort on the trigger; include Reset and Done in the surface. Sort applies immediately, with dismissal on Done/Escape/outside click. No phone view toggle or separate phone view-preference store. Crossing 768px changes presentation while preserving query/filter/page, restoring desktop preference when returning to desktop width.

Superadmin can create/edit/duplicate/delete through authorized controls. Mentor sees assigned courses and journal access only. Do not fetch the admin mentor directory for mentor cards. If the list response cannot supply the current mentor name, omit that redundant line rather than claim no assignment. Admin mentor identity needs an authorized bounded lookup or tested enriched contract, never one request per card. No unavailable enrollment-total tile is rendered.

### List queries, state and four states

Current `GET /courses/` supports status, page and page_size; source does not establish server search/sort. Replace the first-100-items assumption with explicit pagination. Until a separate search/sort contract exists, label local text search and ordering as current-page operations, and retain pagination even when that page has no matches. Never claim the whole catalog is empty from one page or fetch an unbounded catalog to justify a search label.

Persist validated URL fields `status`, `page`, `q`, `sort`, desktop `view`. Defaults are all, first page, empty search, existing supported ordering and grid. Server filter changes reset to page one. Local search does not silently change server-page ownership. Title count describes the server status-filtered total; any match count names its current-page scope. Preserve list scroll in route/session state keyed by the validated URL.

Loading uses matching row/card geometry. Initial error gives translated failure and working Retry. Empty catalog offers admin Create course or mentor assignment guidance. Filter/local no matches offers Reset and remaining-page navigation. Loaded content survives refetch with a small status message, not opacity dimming. Refetch error retains last successful content with retry. Pagination controls retain 44px targets and keyboard access.

## `/courses/:id` — identity, tabs and ownership

Desktop: Back to courses; compact identity card; tabs; active panel. Identity has optional 80px thumbnail, wrapping title, one status, mentor, date range and course monthly price left. Open journal is the primary action right, followed by admin overflow containing Edit, Duplicate, Delete. Overflow has a translated accessible name and clear destructive separation. Description is excluded from identity.

Phone: Back row; title with separate 44px admin overflow; one status; wrapping mentor/date; distinct price line; full-width Open journal; tabs. Omit thumbnail/banner. At 390 × 844 with the captured ordinary title, tabs and the beginning of Schedule should appear above bottom navigation. This is a hierarchy check, not a fixed-height constraint on long text.

Tabs are Overview, Students with an available authoritative count, and Progress. Use associated tab/panel semantics, selected state, visible focus and arrow/Home/End navigation with immediate activation. Network loading belongs in the newly active panel. Long translations may scroll locally with an edge affordance; no clipped labels. No sticky detail action footer or animated panels.

| Region | Owns | Excludes |
| --- | --- | --- |
| Identity | Course identity/price, Open journal, admin operations | Description, expanded analytics, repeated logo |
| Overview | Small aggregate strip, weekly schedule, description, admin history disclosure | Roster, progress grid, speculative next lesson |
| Students | Person identity, enrollment date/status/price, enrollment/withdrawal | Overall student-profile average presented as course grade |
| Progress | Course-specific period scores and supported summary | Enrollment mutations, heatmap, decorative trend dashboard |

### Return context and query ownership

Validate `tab` URL state with Overview default and stable `period` ID for Progress. Keep roster/progress search and sort separate in a course-keyed state owner above unmounted panels. Cached query data survives switching tabs. Invalid tab falls back to Overview; invalid/deleted period falls back to an available period with translated explanation, never an unrelated label-matched period. Clear course-specific state when course identity changes.

Opening detail stores a safe internal origin with validated course-list URL and scroll. Explicit Back uses it, falling back to `/courses` on direct entry rather than blindly invoking history. Person/journal links carry course return context: tab, period, search/sort and scroll. Returning restores Students after a profile visit or Progress after journal work. Direct mentor-list journal access carries list origin instead. Groups 03/04 consume this same internal-return convention; validate routes and reject arbitrary external return URLs.

Page-level queries own course identity and genuinely shared aggregates. Overview owns schedule; Students owns roster; Progress owns progress; admin history loads only when its disclosure opens. Activate each pane when needed, reuse cached data and show local refetch state. Hiding JSX alone does not stop unnecessary requests. Enrollment count must not require resolving every student profile; omit unavailable tab counts rather than fabricate zero. Do not add duplicate roster reads for the header. Existing profile fan-out is a separate contract concern below.

### Overview

Use one quiet strip for supported authoritative enrollment count, course graded average and attendance, with neutral separators and no individual metric cards/icons. Unknown values are unavailable, not zero; retain each query's loading/error state. At 320px wrap metric cells without reducing labels.

Weekly Schedule follows immediately. At 768px and above use approximately 2:1 schedule/description columns; stack below. Schedule rows show localized day/start/end time, minimum readable height 44px and natural growth. Description uses normal wrapping body text. Do not synthesize a next occurrence from the weekly pattern. Admin mentor history is a secondary disclosure below, with its own query and states; mentor never requests it.

Each pane has matching loading, local Retry, explained empty and loaded states. No-description copy is valid; failed schedule/history is never empty. Failures do not remove identity or other tabs.

### Students

Header contains count, search with honest scope and admin Enroll student. Desktop rows contain identity, enrollment status, price-at-enrollment with currency and accurate unit, enrollment date, and separate admin overflow. Neutral dividers replace full-height enrollment colors. If a documented cross-page identification purpose emerges, retain color only as a small labeled marker.

Phone rows place avatar/full linked name first, optional email second, price/status third; menu stays separate. Long identity/contact wraps without being compressed by price/actions. Mentor roster is read-only, with person links only where authorized. Withdrawal is an enrollment operation, never account deletion.

Remove current profile `avg_score` from roster rows: it is not established as course-specific, and Progress owns course grades. Identity course price and enrollment snapshot price remain distinct even if equal.

Loading follows final row anatomy. Error has working roster Retry. Unresolved identities show a separate partial-data message and retry failed reads; do not assume deletion from a failed request. Empty collection explains enrollment/assignment. No search matches offers Reset without hiding Enroll. Paginated/local search must disclose scope or use tested server search.

### Progress and grade semantics

Document retained averages' scope and denominator against backend behavior before implementation. Overview uses the canonical course aggregate, not a frontend mean of period averages. The observed 65% versus 64% may have legitimate weighting; do not relabel them as equivalent or change scoring rules. Remove the decorative cohort sparkline and duplicate trend summary from this release.

At 768px and above render one neutral numeric table: sticky identity 220–260px, period columns at least 104px, summary at least 112px, rows at least 52px. Use 14px readable headings, consistent numeric alignment, opaque `bg-card` sticky cells and a border at the scrolled edge. Overflow belongs in a labeled keyboard-reachable comparison region, never the document or squeezed columns. Add date headings only by joining stable period IDs to authorized journal metadata; never infer dates from “Week 1”. Without dates, retain the truthful backend label.

Below 768px render full-width period selector, search/count/sort, and person rows with course-specific percentage plus earned/maximum score when supplied. Default to latest graded period only when real grading state establishes it; otherwise show the latest scheduled period labeled as scheduled. Describe it as ungraded only when the source establishes that state; unknown grading status is unavailable, not proof that no grading occurred. Preserve selected period across viewport changes and return navigation. No initial phone Compare mode or heatmap/view toggle.

Cells are text, not buttons all opening the same journal. Identity retains Open journal. Cell-specific navigation is deferred until exact student/period context is supported. Person links preserve Progress return context. Sort names by active locale; missing grades sort after graded values with stable tie-breakers. Numeric sort labels state whether selected-period or course-summary values drive ordering.

True zero displays zero. Missing/ungraded displays a dash with explanation, never inferred from `score > 0`. Values above 100% remain visible; verify bonus/denominator meaning before introducing a cap or invalid warning. Show raw score/maximum only when supplied. Risk uses authoritative threshold and grading state; missing is not at risk. Use neutral score surfaces and semantic risk text only where warranted.

Loading matches table/phone rows; error has local Retry. No periods explains setup; scheduled-but-ungraded explains results await grading. Search no matches keeps period controls and Reset. A future chart requires at least two graded periods, not scheduled-period count, and must not turn missing into zero.

## Permissions

`check_course_access` permits superadmin, assigned mentor and enrolled student, and denies accountant. This group covers staff routes; student learning belongs to Group 06. Create/PATCH/image/delete/copy, mentor history and enrollment mutations require superadmin. Course journal/metric endpoints check course access; retain individual journal service authorization. Direct mentor links use the existing authorized destination.

Re-read guards before new role-facing queries, including person links. Do not fetch admin-only directories for mentors, loosen guards or treat hidden controls as privacy enforcement. A 403/404 produces translated access/not-found content and safe return, without leaking inaccessible identity.

## Create/edit — bounded form and lifecycle

At 768px and above use an end-aligned 560px drawer bounded by visible viewport; below use full-width/full-height modal. Both use header / one `minmax(0, 1fr)` scrolling body / footer. Header has title and 44px Close; footer has Cancel/Create or Save as normal layout cells, never an overlay over inputs. Body contains overscroll. Underlying page is inert and scroll-locked through the shared overlay owner. Safe-area padding applies once at footer boundary; closing restores page scroll/focus. Dynamic viewport bounds require real iOS/Android keyboard verification.

The 560px width and 768px threshold are intentional course-form variants of the shared surface, accommodating schedule and course terms. Group 03 person forms use a preferred 480px drawer from 640px. Share the primitive, overlay ownership, header/body/footer layout and dismissal/focus lifecycle; parameterize width and responsive threshold rather than requiring identical geometry or introducing a second modal implementation.

Create order: Identity (title/description), Mentor & dates, Price & exams, Schedule, optional Image last. Phone fields use one column. Desktop may pair dates and exam/price when readable. Schedule day enable targets are at least 44px; phone start/end controls follow on their own labeled rows. Validate uniqueness/order and existing backend rules, without inventing recurrence. Mentor selector has loading/error retry/empty guidance and truthful pagination; a first-100 result must not imply all mentors.

Edit exposes title/description, mentor, dates and status. A read-only Course terms block shows original price, cadence and schedule with one translated immutability explanation; values are text, not disabled input lookalikes. Image remains the supported separate upload flow. `CourseUpdate` excludes price/exam_type/schedules: never send them. Preserve dirty-field PATCH semantics.

React Hook Form/Zod preserves valid input; errors are translated and associated with fields. Invalid submit focuses/scrolls the first invalid field inside the body. Server field errors attach locally, general failure remains visible near form heading. Decimal price uses string validation and decimal input mode. Save without changes is disabled; a newly selected image counts as a change.

Clean Cancel/Close/Escape/backdrop closes without writing. All dirty-dismissal paths use the shared Discard changes confirmation: Keep editing restores field focus; Discard clears draft and closes. The same coordinated overlay owner handles this confirmation without competing focus traps or scroll locks. Pending disables repeat submit and dismissal while the request settles, with clear Saving/Creating and stable footer width. Never imply closing cancels a dispatched mutation. Failure retains editable draft; success refreshes identity/list and restores the initiator, or destination heading after navigation.

Course write and image upload are separate. If save succeeds but upload fails, show partial success, retain the selected image and retry against the saved course ID. Retry must not create another course or reapply saved fields. Closing this state explains that course changes are already saved and only the image remains; Cancel never promises rollback of completed writes.

## Enrollment — selection, confirmation and results

Admin Enroll opens centered 560px desktop dialog and full-height phone modal using the same header/body/footer pattern. Header identifies course/action. Body contains 48px search, candidate radio rows, visible selected identity and read-only supported terms. Footer has Cancel/Enroll student; Enroll is disabled until one eligible student is selected. Phone has one scrolling body, not a short nested list viewport.

Candidate tap only selects. Selection stays visible across search/page changes with Change student; show full name and useful contact with checked state and token-based selected surface. Supported terms remain read-only decimal-string facts; no invented editable price/start-date fields. Only explicit Enroll sends the mutation.

Use existing debounced server student search where supported, resetting paging on query change. Filtering excluded IDs from a candidate page must not imply exhaustion: an all-excluded first page retains Load more through relevant pages. Distinguish loading, error/retry, no query matches and no eligible students only after exhaustion. Preferred server eligibility is a separate contract task. Server validation remains authoritative if another session enrolls the person; show specific duplicate/ineligible feedback with recovery.

Cancel/Close/Escape/backdrop before submit clears selection without writing; selection alone needs no dirty-form warning. Pending blocks repeat submit/dismissal with stable progress label. Failure retains selection and inline error. Success closes picker, stays on Students, refreshes roster/count and gives translated feedback. No unsolicited page jump or animated insertion. If search/paging hides the person, offer View enrolled student to clear conflict and reveal the row after the user's action; locate-by-identity support is required if ordinary paging cannot do this. Do not pretend a hidden row is visible. Focus returns to Enroll or to the revealed name after explicit reveal.

## Withdrawal, duplicate and delete

Use centered desktop/bounded phone confirmations with named course/person, actual consequence, Cancel and one explicit confirmation. Withdrawal affects enrollment, not account. Duplicate preserves existing schedule semantics; failed/missing schedule blocks confirmation with recovery rather than incomplete copying. Delete describes actual backend effect and does not promise undo without an endpoint.

Cancellation/Escape/backdrop before submit performs no mutation. Pending prevents repeat submits/dismissal; failure retains target/dialog and recoverable error. Success refreshes data and focuses a surviving control: deletion returns to preserved course list; duplication opens new course; withdrawal stays Students. No swipe-to-withdraw, hold-to-delete or animated row removal.

## Motion and shared libraries

Reuse [MOTION.md](../MOTION.md), without adding patterns. Occasional surfaces use 200ms ease-out opacity 0→1 / scale .96→1 and the shared origin rules: trigger-aligned desktop menus, centered desktop dialogs, shared phone surface origin. Eligible controls use 150ms ease-out transform press feedback `active:scale-[0.96]`; disabled controls remain still. All nonessential movement is `motion-safe:`. Keyboard navigation, focus, tab panels and repeated data operations are immediate. Only changing properties transition; no `transition-all`.

One coordinated overlay owner closes obsolete shell surfaces before a course form/dialog takes modality, owns scroll locking/focus, and releases stale locks on route/breakpoint change. Close/reopen during 200ms must not leave invisible blockers or delay focus. Reduced motion leaves surfaces immediately usable.

Keep tables, scores, refetch, results insertion/removal and metrics still. No heatmap animation, route fade, tab slide, card stagger/lift, rolling number or chart drawing. Gate hover by capability. Reuse Group 01 accessible primitives and existing toast; no independent Base UI, toast, table, chart, gesture, virtualization or motion dependency for this group.

## Separate contract work and deferred features

Visual changes use existing authorized capabilities with honest scope labels. Track these separately, with dependency order and behavior tests:

| Improvement | Required boundary |
| --- | --- |
| Global course search/sort | Current list supports status/pagination. Add query fields, stable server ordering and accurate totals through controller/service/repository before replacing current-page labels. |
| Eligible student pagination | Course-scoped authorized eligibility, accurate paging/exhaustion and enrollment race validation; existing paged search is an honest interim path. |
| Bounded course roster/count | Authorized identity/enrollment snapshots, pagination and reliable aggregate count, avoiding per-student profile requests or unrelated profiles. Include locating a newly enrolled row if needed for reveal. |
| Grading metadata gaps | Minimal tested fields for zero/ungraded, denominator, grading state or dates where existing responses cannot establish them; never inferred frontend scoring. |

Use project class/service/repository boundaries, SQL aggregates/eager loading and authorization/query-count tests. Schema changes require generated `CONTRACT.md` and synchronized TypeScript. Caching does not remove first-load profile fan-out. Do not hide these tasks in cosmetic commits.

Deferred: phone Compare periods, heatmap, dated next lesson without authoritative occurrences, cell-specific student/period journal deep links, mutable course terms and editable enrollment terms. If phone comparison is later approved, retain 144–160px sticky identity, 104px minimum period columns and labeled local scrolling. No activity feed, favorites, bulk enrollment, new chart dashboard, gesture forms or course onboarding illustration is introduced.

## Implementation order and acceptance

1. Group 01 tokens, shell, coordinated surface ownership, dirty dismissal and focus/scroll restoration first. Coordinate reusable person rows with Group 03 and validated internal return context with Groups 03/04; avoid requiring completed people pages to render courses.
2. Map correct Taskmaster files/dependencies before coding. Implement list geometry, pagination/honest scope, mentor journal access and four states. Planning does not complete an implementation task.
3. Split identity/context owner from independent Overview/Students/Progress/history. Establish grading/aggregate meaning, neutral comparison and phone period rows, then return-state preservation.
4. Implement immutable edit terms; bounded forms; dirty/pending/error/partial-upload recovery; enrollment selection/confirmation/pagination/reveal; lifecycle dialogs. Add en/ru/tg keys and bidirectional parity.
5. Verify 320/390/768/1024/1440, both themes, long localized text, text zoom, missing media, ordinary first-screen targets and independent pane failures. No clipped names/values. Check keyboard tabs/menus/dialogs, 44px targets, 16px inputs, scroll/focus return and physical iOS/Android keyboard, safe area, landscape and reduced motion.
6. Regression tests cover mentor guards/no admin directory/history requests; validated list/tab/period return context and invalid period fallback; lazy pane reads; current-page scope and page-two eligible candidate; per-pane states/retry; enrollment select-without-write, confirm/cancel, duplicate failure and hidden-row reveal; immutable/untouched PATCH omission; dirty dismissal and partial upload without duplicate creation; true zero/missing/>100, unequal denominators and course-versus-profile average; cancellation/failure in lifecycle dialogs. Future chart tests count graded periods explicitly.
7. Run `cd backend && python -m pytest app/tests -q`, `cd frontend && npx vitest run`, `cd frontend && npx tsc --noEmit` in Conda base, touched locale parity and contract generation where required. Read gitignored `frontend/src/lib/` files explicitly, report their tracking state and intentionally stage necessary deliverables. Repeat real seeded before/after captures, document hardware gaps and commit logical verified work under repository rules; no push/PR without instruction.

These are required implementation checks, not verification claimed complete here. Only this group plan was revised; app/shared documents/review/Taskmaster were not changed by this group agent, and no commit was made.

## User-authorized shared SVG loading indicator (2026-10-10)

Apply the bounded editable-SVG artwork and animated-book loading contract in [MOTION.md](../MOTION.md), section “User-authorized SVG artwork and brand motion (2026-10-10)”. Use the supplied shared book indicator alongside matching loading geometry/status when activity needs feedback; preserve readable loaded data during refetch and use a static reduced-motion fallback. No full-logo loops on these operational pages, no invented progress percentages or motion library. This explicit authorization does not change permissions, persistence, metric semantics, dependencies or deferred feature scope.
