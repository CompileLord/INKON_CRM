# Group 06 — Student learning, settings and personal notifications

Status: reviewed and revised from all approved [Group 06 recommendations](../reviews/GROUP-06.md). Application implementation not started. Dependencies: Group 01 shell/authentication/shared controls, [tokens.md](../../../tokens.md), [MOTION.md](../MOTION.md), shared course identities, Group 04 journal domain states, and the separate identity correction described in Group 03. Work packages and contract gates follow [IMPLEMENTATION.md](../IMPLEMENTATION.md).

## Evidence and limits

[Manifest](manifest.json): 56 accepted real seeded captures across 14 views, each at 1440 × 1000 and 390 × 844 in light and dark. Student views cover active courses, archive, course detail, own journal period, account settings and notifications. Superadmin views cover account, organization, notification rules and notifications. Mentor/accountant each have account settings and notifications. All 14 contact PNGs were inspected; selected full-size desktop/mobile originals in both themes and the supplied brand artwork were inspected independently. Six superadmin settings phone captures report document overflow; personal fields are visibly squeezed even without document overflow. No settings, avatar, notification-rule or read-state mutation was submitted.

The student has one active course and no archived courses. Every captured inbox is genuinely empty. Populated archive/inbox, failed delivery, loading/error variants and mutation behavior are specified for implementation but are not captured evidence. Archive visibly selects the Archive tab and shows its empty state. The runner recorded pathname alone in `actualRoute`, incorrectly treating the omitted query as a redirect; the manifest retains that raw observation and its visual-review correction. This is not a guard bypass or the Group 03 self-profile identity defect. A fixed navigation bar across a full-page image shows its captured viewport position; that image alone cannot prove the last row is inaccessible while scrolling.

| Before — captured or source evidence | After — accepted direction | Purpose |
| --- | --- | --- |
| One large photo card and red score track in My courses | Compact bounded course rows, one destination, labeled result | Make course identity easy to scan without suggesting a score is completion or failure |
| Metrics/chart precede period destinations on phone | Periods first, latest eligible period inside the same list | Reach the useful destination without duplicate actions |
| Period total repeats percentage, stacked bar and component colors; lesson values lack labels | Numeric contributions, labeled homework and attendance, calculation explanation | Explain the result and preserve real zero/bonus meaning |
| Phone account fields clip; immediate settings sit above profile Save | One-column fields; Profile → local Save/Discard → Appearance | Clarify what is saved and keep inputs readable |
| Hardcoded webhook Active and mixed-language helpers | Organization fields and truthful channel help without an Integration placeholder | Avoid unsupported status claims |
| Personal empty inbox resembles a seven-column dispatch console | Own-account event rows, date/read state and explanatory empty state | Expose relevant information without raw technical data |

## Shared layout, style and interaction contract

At 1024px and wider inherit the 240px labeled sidebar; below 1024px inherit Group 01 role-aware navigation and return the rail width to content. Use 16px phone gutters and 28–32px desktop gutters. Course list, journal and inbox content are bounded to 960px; course detail to 1120px; account/organization/rules forms to 640px, inside the shell's overall maximum. These are maxima, not fixed widths. At 768–1023px retain one reading column and readable intrinsic controls; introduce the course-detail side column only when its main column can retain at least 480px. At 320px labels wrap and local tabs scroll; document overflow is never the solution.

Use one page heading at 24px/32px on phone and 28px/36px on desktop, section headings 18px/26px, readable body text, and metadata no smaller than 12px/18px. Panels have 16px phone and 20–24px desktop padding; related items use 16px gaps and distinct sections 24px. Prefer divided rows and whitespace over nesting each statistic, teacher and helper inside a card. Course images identify content at 48–64px square and never become decorative heroes.

Use `bg-cream` for canvas, `bg-card` for content, `bg-strip`/`bg-beige` for quiet grouping/selection, `text-ink` for primary content, `text-muted`/`text-label` for supporting copy, and structural `border-border`. Inputs use the dedicated semantic control boundary from the shared token package; focus uses `ring`. Primary links/actions/selection use the theme-aware primary role, including in dark mode; remove legacy dark-orange overrides for those roles. Buttons use `on-primary`, not literal white. Semantic states include readable text/icon cues. Orange remains a small brand accent, not a score severity or default dark-theme link color. No raw palette literals in components. Logo integration belongs to Group 01; do not repeat the emblem in learning/settings/empty-state cards.

All targets are at least 44 × 44px; form inputs are 48px high with at least 16px text. Text and numbers remain selectable. All visible strings, accessible labels, status copy, pluralization and disclosure labels use `t()` in en/ru/tg with bidirectional parity tests. Dates/times use shared formatters; changing numbers use tabular numerals. Any monetary content introduced later remains a decimal string. Do not shrink translated text to force a first-screen height: at normal seeded 390 × 844 the first useful row/action should be reachable without decorative content pushing it away.

Every independently fetched pane has geometry-matched loading, error with working Retry, explained empty and loaded states. Keep usable loaded data during background refetch and report its refresh failure locally. Missing data never becomes an invented zero, 100% attendance or rank. Error recovery retains route/query/draft context. The page owns authorization recovery; no visible action implies a permission absent from its endpoint.

## `/my/courses` — active and archive

### Anatomy and actions

Both desktop and phone use a bounded divided list. Header: My courses, then Active/Archive tabs with actual counts. Do not repeat a total count beside the heading. On phone tabs use the full available width and at least 44px targets. No search is included in the initial course list; one captured course does not justify it. A multi-column grid is not the required desktop layout, and a single row is not stretched into a hero.

Each course row contains a 48–64px thumbnail or initials/icon fallback, full wrapping course title, concise teacher identity, authoritative enrollment/course status and a small labeled own result when graded. Desktop can right-align the result; on phone it follows the identity if needed. Use one semantic link to `/my/courses/:courseId`, with a visible Open course cue/chevron included in that same destination. Do not nest teacher/profile links, a second Open button or a latest-period shortcut inside it. No score track, card lift, result count-up or arrival stagger. Teacher identity must come from permitted existing data/cache or a separately tested aggregate contract, never one profile request per row.

An authoritative ungraded state displays translated Not graded; a genuinely recorded zero displays zero. Missing grading state is Unavailable, not a guessed Not graded label. A failed aggregate/profile request does not erase a loaded course identity or relabel its result. Numeric results must use the actual aggregate semantics established below.

### Navigation and states

Keep `bucket=archive` in the URL. Active is the canonical default; unsupported values normalize to it without weakening guards. Restore the selected bucket and list scroll on browser Back and on a contextual Back to My courses link. Carry only validated internal return context through course/period navigation. A directly opened course uses the loaded authoritative bucket for its fallback list destination, or canonical active if unavailable; a direct period link first returns to its course. Do not trust arbitrary external return URLs.

The backend bucket is authoritative and depends on enrollment/course status. A past configured end date does not let the frontend reclassify an active enrollment. Archive uses the same compact identities and authorized read-only navigation without staff controls. Its true empty state says no courses have been archived and provides one Return to Active action; copy must not promise that a date alone triggers archiving. Active empty state explains that assigned/enrolled courses appear here; do not invent enrollment or messaging controls for the learner.

Loading reserves list-row geometry and count positions without showing zero counts as fact. Failure supplies Retry in the current bucket. Missing images use fallback without breaking row dimensions. Loaded navigation preserves student routes and guards. The populated archive remains an implementation capture requirement.

## `/my/courses/:courseId` — course learning view

### Desktop and phone anatomy

Use an unboxed compact Back link, course title/status, date range and teacher identity. The teacher is a readable identity line, not a separate decorative panel or forbidden profile destination.

Desktop main column: Periods → compact own-result/attendance summary → optional comparison/trend. A 280–320px side column holds configured weekly schedule and course description. Use a 24px column gap and only enable the side column when the 480px main-column minimum fits; otherwise use the phone reading order. Do not fill the full viewport with sparse metrics.

Phone reading order: identity → one short configured-schedule line or disclosure → Periods → compact own-result/attendance summary → optional comparison/trend disclosure → description. Schedule context does not expand into a long panel before the periods. Periods are the principal action area; no separate latest-period hero or repeated shortcut above the list.

Within Periods, show the latest eligible non-upcoming period first, then remaining periods in a stable, clearly labeled order. Resolve eligibility from the authoritative period state and authorized destination, not score positivity. If upcoming periods also exist, place them after available periods with explicit availability copy. The first eligible row may use a quiet strip/weight and a translated Latest label; it appears once. Each row has period label, date range, known textual state, own recorded result or an explicitly supported ungraded/unavailable label, and a 44px-minimum destination to `/my/journal/:journalId`. Upcoming rows have no link, hover affordance or disabled fake action. Previously accessible read-only periods remain reachable according to authorization.

The summary is one shallow region with labeled personal average and attendance; absences may be supporting text rather than a fourth card. Rank and class average are secondary, conditional comparison context governed by the contract decision below. Do not manufacture a comparative empty card where comparison is unavailable. Description wraps and can disclose long text through a labeled 44px control; expansion is immediate and content remains selectable.

### Schedule and independent states

The existing future-weekly-lesson calculation is not bounded by the course end date. Do not label its output confirmed Next lesson. Initially show configured recurrence, formatted using shared date/time helpers and the supported timezone; explain that it is schedule information, not a confirmed dated occurrence. Preserve backend enrollment buckets. A date-bounded confirmed lesson is a separate domain task with end-date/timezone/eligibility tests.

Course identity loading/error can own the page; profile, periods, schedule and progress own separate states once the course is available. Missing profile does not show 0% or 100%; missing/unavailable rank does not show zero or first place. A schedule request error is not No scheduled lessons. Period-request failure is not No periods. Retain loaded sections and provide Retry only for the failed request. No periods explains that periods have not yet been made available; no graded results explains their absence without pretending the student scored zero.

### Optional progress chart

The period list remains the phone default. A single Progress disclosure may reveal the chart once there are at least two actually graded own points, including a legitimate zero. Eligibility must not count scheduled-only periods or class-average values greater than zero. With fewer than two own points, put a short explanation in that secondary area; do not reserve a large chart-empty hero above the periods.

Keep the current SVG infrastructure. Use a non-clipped value domain including all eligible own and displayed aggregate points, including legitimate scores above 100%; label the nominal 100% reference separately. Do not clamp a bonus result to 100. Missing/ungraded points are gaps; do not coerce them to zero or connect a line across their missing interval. Align points with actual period IDs. Keep labels readable at phone width instead of scaling 10px desktop text down with a 600px viewBox. Long period labels can be shortened only when the accessible text alternative supplies the complete label and value. Provide an adjacent accessible text/table alternative with all plotted dates/labels/values and state gaps. Own and aggregate series have distinct labels/patterns using shared series tokens, not color alone.

Class data remains an authorized aggregate with known population, never peer names/rows. Remove the `as unknown as` response conversion in `MyCourseDetail.tsx`; use a correctly typed student hook/contract or discriminated role response. If grade state/missingness cannot be represented, make a minimal contract extension before enabling the chart, synchronize TypeScript and regenerate CONTRACT.md. Keep the period list usable while that work is pending. Chart loading/error/refetch/insufficient-data states remain local.

## `/my/journal/:journalId` — own period results

### Result and lessons

Use a bounded 960px reading width on desktop and 16px phone gutters. Header contains course Back destination, period title and date range without another enclosing card. Follow it with one result region and one lessons region, not a separate panel for every value.

Lead with the actual `sum_score / max_period_score` and a localized points label. A percentage is secondary, and is not repeated as a large badge when it adds no meaning. Retain a valid zero and any valid bonus percentage above 100. A nonpositive/unavailable maximum must not become an invented percentage denominator. Show four compact, aligned, labeled contributions: Homework, Attendance, Exam and Bonus. Bonus is additive. Do not draw score tracks or stacked bars; do not infer per-component maxima from visual proportions.

Immediately after the total provide a labeled How this result is calculated disclosure. It explains the nominal maximum and the same four contributions with verified authoritative calculation rules, including bonus treatment. It must not invent pass/fail thresholds or normalize scores. Use the already displayed contribution rows as the value source; avoid a second contradictory calculation. Additional per-component maxima require verified domain data. Rank/class-average context is secondary and subject to the separate policy gate below.

Lessons remain chronological. Desktop uses a readable divided list/table with Date, Attendance, Homework and comment context; phone uses divided rows with date/attendance on the first line and labeled Homework on the next where necessary. Display the actual homework result on the verified 0–5 scale, including zero; attendance is a separate textual/icon state. Exam and bonus belong to the period summary, not individual lesson rows.

Short comments are readable inline; long comments use a translated Show comment/Hide comment control with at least a 44px target, `aria-expanded` and a programmatic relationship to the text. No hover is required. Expansion is immediate, text wraps and stays selectable. Do not add lesson filters, attachments, downloads, editing cells, autosave indicators or new lesson navigation absent from the student's authorized contract.

### Domain states and privacy

A past lesson without an entry is Not recorded; only a genuinely future lesson may be Upcoming. Evaluate the date using supported course/application timezone semantics, not a browser-local guess. Recorded absence, present with zero, unavailable score and absent entry are distinct. A recorded future entry remains a recorded entry if the domain allows it; absence of entry alone never establishes Upcoming.

Loading reserves result and lesson geometry. Request failure has Retry and retains course recovery context. Unauthorized/not-found responses have appropriate recovery without revealing another student's data. An authorized period with no own entries explains that results have not been recorded and preserves any known lesson schedule. Missing own row is not automatically a generic server failure; inspect the authorized response meaning before choosing empty versus access recovery. Loaded empty lessons and unavailable summary receive their own truthful copy.

The student journal endpoint returns only the authenticated student's row, including only that student's comments and scores. Verify this with another student's nonempty private comment in the fixture. A client selecting `students[0]` is not the privacy boundary, and a staff shape cannot substitute for the student contract. Class comparisons remain aggregate-only. Course and journal access checks must still reject unauthorized IDs.

## Shared learning contract decisions

Presentation changes must not silently redefine scoring or ranking. The current journal service ranks available summaries using sorted position while its class-size denominator counts course enrollments; course aggregate ranking also uses list position and fallback values. Equal scores can therefore receive distinct positions without a stated tie policy. Before displaying an exact rank, explicitly define and test tie behavior, enrolled-versus-ranked population, included period states, withdrawn/deleted enrollment treatment and missing-summary behavior. Use the agreed actual denominator and a translated scope label. Until resolved, omit the exact rank/comparison display; do not show a fake first place or imply a confirmed competition result. Once available, keep comparison secondary rather than restoring a four-card hero.

Personal/course/class averages and attendance also need their actual period population and denominators. A positive maximum alone is not proof that a period has been graded. Align with Group 04: neither numeric zero/nonzero nor the existence of an entry or summary is an authoritative graded flag. Until an explicit state is available, do not enable graded-only analytics, count a period as completed or manufacture a Not graded classification from score values. The fallback is an accessible period-score list showing actual recorded values and known availability/date context, with completion/grade state identified as unavailable where needed. A latest available-period destination may use verified access/date eligibility without claiming it is the latest graded period. Separate domain work must establish any absent grade-state or denominator fields before chart/completion features rely on them. SQL aggregates/window calculations and repository/service separation follow project rules when backend work is needed; do not preserve a per-course rank-query loop as the planned long-term solution. Own-row response privacy stays unchanged.

## `/settings` — account for every role

### Page structure and section navigation

Use Settings as the heading with role-appropriate account context. Nonadmins have Account content without a lone tab or misleading system-privilege subtitle. Superadmin has Account, Organization and Notification rules, rendered through a shared accessible tab primitive. Labels retain intrinsic readable widths and at least 44px targets; use contained horizontal tab scrolling at 320px instead of document overflow, a new side rail or tiny text. Focused/selected tabs scroll into view immediately. Arrow keys move focus; use Enter/Space activation for panels with asynchronous loads, and expose the selected state/panel relationship.

Persist the admin section in a validated frontend query value, `section=account|organization|notifications`, with Account as default. Unsupported or nonadmin-restricted values resolve to Account without fetching or rendering privileged mutation controls. Browser Back/reload restores a permitted section. Changing section preserves drafts and mutation ownership in the page session; it does not submit or discard other forms. Query selection alone grants no server access.

Account is bounded to 640px. Its order is Profile details → local Save profile/Discard changes and feedback → Appearance. Avatar sits with profile identity but is an independently saved operation. First/last name and phone use visible labels; email is selectable wrapping read-only text, not a disabled clipped input. Role is noneditable. All phone fields, including first/last name, are one column. Desktop may use a two-column name pair only when readable, while email and phone retain full usable width. Actual stored names remain data; rebranding never replaces them.

### Profile draft lifecycle

Load the authenticated current user before presenting editable fields. Match form skeleton geometry. Retrieval failure shows Retry; session expiry follows auth recovery. An optional empty phone is an allowed field state, not a load failure. Hydrate the draft from the authenticated identity and reset it on account identity changes; never leak a previous user's draft into the next session.

Keep one accepted server snapshot per profile form. Refetch may update a pristine draft, but must not overwrite a dirty one. Preserve dirty values across admin sections and recoverable errors. Send only changed allowed fields. Save profile and a quiet Discard changes action appear when dirty, in a reserved in-flow region directly after the fields; pristine state has no active submit. Discard restores the accepted snapshot for this draft, clears field/save errors, and does not reverse any already saved avatar or immediate appearance choice. New edits clear the form's saved status. Feedback is local to Profile, never a global banner shown on another tab.

Validate E.164 phone input, use `type=tel`, supported autocomplete and a suitable keyboard hint. Focus the first invalid field after submission and associate localized error text. Clearing an existing optional phone is an intentional dirty edit: send the schema's explicit accepted empty representation, normally null if supported, rather than `undefined` omission. Confirm actual self-update handling before implementing; if omission versus clear cannot be distinguished, add a separate tested contract correction. Do not silently guess a country code or weaken validation to match a permissive legacy regex.

During profile submission freeze that form's editable fields/Save/Discard to avoid ambiguous in-flight edits and duplicate requests, keeping values readable. Section navigation can continue because the mutation owner survives panel changes. Success stores the accepted returned/refetched values as the new snapshot and shows local saved feedback. Failure preserves draft, exposes field or form error with retry, and does not display saved status. No confirmation modal is added to every tab switch. Scope draft retention to the mounted page session; offline/multi-session persistence and a new password-change flow are outside this task.

The submit region is in normal flow and remains reachable above bottom navigation and keyboard through reserved content padding/scrolling. Do not add a sticky overlay without physical-device evidence that an in-flow region is insufficient. If shared form containers constrain height, use header / one `minmax(0, 1fr)` scroll body / footer layout rows rather than an input-covering overlay. Version information stays secondary and reachable after content.

### Independently saved avatar

Use the current authenticated user's permitted upload endpoint for every role; do not approximate superadmin/accountant as a different person's profile. Picker target is at least 44px. Translate supported file types and actual size limit after checking backend constraints. Local selection starts the independent upload and states that the photo saves separately from profile details. Selecting a file must not submit unsaved name/phone fields.

Show upload pending/progress and error/retry next to the picker; preserve the selected file for retry and allow selecting the same file again. Guard duplicate upload requests. A successful upload updates preview and invalidates the actual user's relevant caches for every role; broken media uses initials. Cancellation of the file picker does not clear the existing image. A failed avatar does not erase the profile draft, and a successful profile save does not falsely claim the avatar succeeded. Do not add photo deletion/cropping unless its existing authorized contract is explicitly verified and scoped.

### Appearance

Appearance follows the profile save region and has immediate-application helper text. Language is a labeled selector with recognizable English/Russian/Tajik names from localized keys; theme is a labeled Light/Dark/System choice group with keyboard semantics, selected indicator and 44px targets. On 320px screens choices wrap or stack without shrinking labels. Do not reproduce the header's six tiny abbreviation/icon targets in a larger card.

Reuse the same locale/theme store as header quick settings. Changes apply and persist through the existing supported client mechanism immediately, including system-theme behavior, and update shared shell controls consistently. They are not included in profile PATCH and do not cause profile saved feedback. No whole-page crossfade. Appearance remains usable if profile retrieval fails because its local state is independent. All helper, label, file requirement, currency, version-label and status copy has real en/ru/tg keys; fallback Russian strings are not translations.

## Superadmin Organization section

Use the same 640px form width, one-column phone geometry and local action/feedback region. Show organization name as an editable field and base currency as informational text. The initial redesign contains no permanent Integration card, Active webhook badge or Not verified placeholder. Do not silently write KITOB into the organization's stored name, use a Russian fallback while loading or introduce editable currency.

Organization GET is authenticated and PATCH is admin-only; enforce this at the endpoint regardless of navigation. Loading reserves fields/actions, retrieval failure has Retry, missing data is unavailable rather than a default organization, and loaded data hydrates a separate draft. Validate authoritative name constraints. Send only dirty `org_name`; never include stale notification values. Save organization and Discard changes follow the profile lifecycle: preserve dirty draft on refetch/tab change/error, local pending disables that form, accepted success replaces its snapshot and refreshes shared settings cache, and feedback belongs to this section. Discard does not undo changes saved by another section.

## Superadmin Notification rules section

Two divided rows: payment notifications and debt reminders. Each row includes an associated accessible checkbox/switch label and truthful channel/help text, with a minimum 44px activation target across its label. Use the existing explicit Save workflow; toggling changes the draft, not the backend. No decorative sliding animation or default-on state while fetching.

Explain that these are organization notification rules for the supported channel, not an individual's inbox preferences. Channel help may describe supported behavior but must not claim webhook health, confirmed delivery, a connected recipient or that enabling a rule sends a test. Do not add setup, test-send or messaging controls.

Use independent saved snapshot/draft/error/success state within this section while sharing the actual organization query cache. Hydrate only after loading; retrieval error offers Retry. Missing/unavailable settings are not defaults. Submit only dirty `notify_payments` and `notify_debts`, never organization name. Provide Save rules/Discard changes when dirty and reserve feedback space. Freeze the relevant draft while pending, retain ownership across tab switches, prevent duplicates, preserve draft on failure and refresh cache on success without overwriting another section's dirty values. Existing false values must remain false through rendering and payload construction.

## `/notifications` — every role's own inbox

### Layout and content

The backend filters `user_id` to the authenticated user for every role, including superadmin. Keep that boundary and describe this as personal Notifications. Use a compact heading and a quiet 44px Refresh action followed by a bounded 960px divided event list. Desktop rows may align the action to the right; phone rows use title/date, secondary context/status, then a visible read action as needed. There are no technical table columns, page-local search/status filters or mandatory recipient/raw entity-ID fields.

Each row leads with a human-readable localized event type based on the supported enum. Unknown types get a neutral translated event label rather than raw internal code. Show the event's date with `formatDate(notification_date)`. If `sent_at` exists and delivery context is useful, show a separately labeled Sent value with `formatDateTime(sent_at)`. Do not feed a date-only value into a datetime formatter, invent midnight, or label the event date as a sent timestamp. Backend ordering remains notification date descending then ID; do not resort the current page by sent time. Optional timestamp absence is absent/unavailable metadata, never a fabricated time.

Read and delivery states are independent. Unread uses a visible textual/accessibility cue and modest text weight or quiet marker. Read remains readable in place. Sent is not Read or a guarantee the user received/viewed the event. Failed delivery is a secondary localized status derived from the actual status field; only failure uses semantic danger/warning treatment. Do not dim the entire row or make the whole row a mark-read trigger.

The response has no free-form message body. Compose only truthful event labels/context from supported fields; do not invent a payment amount, score sentence or notification message. The service currently stores successful `score:<value>` markers and raw failure exceptions in `error_message`. Never render, parse into product content, search or disclose that raw field; its presence does not prove failure. No raw attempts, technical IDs or delivery-error inspector is included. Sanitized public failure reason/message content is separate schema work.

Recipient is optional secondary context only when actual channel/target differences require disambiguation within the user's personal scope. A related-entity destination requires an explicit event-type mapping and a tested role-authorized route. With no verified mapping, use the localized event label without a fabricated link or raw ID. A student must never follow a staff finance/profile route merely because an entity ID exists.

### Read action, pagination and four states

Mark read is explicit and per record. Track pending/error by notification ID; disable only the affected read action, keep other rows usable and preserve row position/focus. On confirmed success replace the action with Read and invalidate list, unread-count and header-preview queries. Existing notification query-family invalidation is retained and tested, not replaced with a second cache system. A failure leaves the record unread with a row-local translated error and Retry. Preserve pending ownership when list refetches; repeated activation must not duplicate the mutation. Do not auto-mark on page entry or disclosure, and do not add swipe-to-read or Mark all read.

Retain server pagination at the supported page size; persist a validated positive `page` in the URL and restore page/scroll on Back. A read action does not reset page, remove the row or refilter it. Retain current usable rows during refresh, show stable pending state via `isFetching`-equivalent query state, and present refresh failure locally. Do not show a new list entrance or count-up. If a now-out-of-range page returns empty while total is positive, recover to the last valid page; distinguish that from a genuinely empty inbox. Avoid premature true-empty messaging before the request has resolved.

Initial loading uses row skeletons matching title/date/action geometry. Initial failure shows Retry and no empty illustration. True empty replaces the list and pagination with a short heading and one explanation that events appear here when created for this account; Refresh stays in the normal header. Do not say All caught up when there have never been events. No search/filter toolbar exists in either empty or loaded state. Loaded rows wrap long event/context text, keep actions in the viewport and allow keyboard access. Authorized populated/read/failed fixtures remain required because all captured inboxes were empty.

## Removed and deferred scope

The revised structures replace the old alternatives: no mandatory two/three-column course grid, list-card latest-period shortcut, duplicate heading count, score tracks, equal-priority rank hero, permanent unverified Integration card, required recipient/raw-reference columns or page-local inbox filtering. Keep a single useful course destination and numeric results. These are implementation decisions, not optional notes beside the former specification.

Useful existing-capability additions are included above: calculation explanation; profile and section-specific Discard; draft retention during refetch/tab changes; explicit optional-phone clearing; readable appearance choices; preserved course/period return context; row-local read pending/retry without loss of place.

| Separate capability or decision | Initial behavior | Gate before expansion |
| --- | --- | --- |
| Rank ties, ranked population, grading state and aggregate denominators | Own results/periods remain usable; exact comparison withheld where unconfirmed | Explicit domain policy, required nullable/state fields, SQL calculation and regressions; no silent policy change |
| Confirmed next dated lesson | Configured recurrence only | End-date, enrollment eligibility and timezone/occurrence contract tests |
| Real webhook health | Omit Integration placeholder; truthful channel help near rules | Approved real health endpoint and meaningful user action |
| Notification message body or public failure reason | Localized event labels; raw `error_message` omitted | Purpose-built sanitized schema and role/privacy tests |
| Global inbox search, status/read filters | Unfiltered server pagination | Demonstrated need and separately tested server filters with correct totals, query persistence and authorization |
| Bulk mark-read/messaging, setup/test-send, lesson downloads, password change | No controls | Separate authorized product workflow and endpoint scope |
| Offline/multi-session drafts, course favorites, calendar export and new charts/gestures | No feature additions | Separate demand and domain specification; not incidental redesign work |

Minimal correctness/schema work needed for existing truthful behavior remains explicit in the roadmap and should not prevent independent layout work. Deferred product capabilities do not become implementation requirements just because their deferral is documented.

## Motion, mobile platform and implementation verification

No new Group 06 motion pattern or dependency is needed. Keep current query/router/forms/Zod/Zustand, existing SVG and shared feedback infrastructure. Use the shared accessible surface primitive if selected in Group 01; do not install Motion, NumberFlow, a chart, toast, gesture, WebGL or state package for these pages.

Pointer press on small controls may scale 1→0.96 with a 150ms ease-out transform transition gated by `motion-safe:`; disabled controls stay still. Never scale a whole course/event row or reading panel. Occasional actual popovers use the shared 200ms opacity/scale recipe and shell overlay ownership. Inline comment/calculation/description disclosures, tabs, routes, period changes and keyboard focus are immediate with no animated height. No score filling/counting, list stagger, chart drawing, traveling tab indicator, swipe gestures, theme crossfade or celebratory empty-state motion. Only changing properties receive transitions; reduced-motion users get immediate usable states.

Inherit dynamic viewport/safe-area handling and reserve bottom-nav height plus inset in content padding. Gate hover by pointer capability. Controls use appropriate touch-action and local selection suppression; readable content retains selection and ordinary scrolling. No body-wide gesture suppression. Browser captures check geometry; physical iOS/Android verifies keyboard, last input/Save reachability, safe areas, browser chrome, focus, landscape, sticky hover and reduced motion.

Before implementation coding, locate the appropriate Taskmaster task/dependencies and update statuses under repository rules. Planning revision marks no implementation task complete. Verification must include:

- Course active/archive reload/Back, valid return context and scroll, direct course/period entry, authoritative bucket rules and no route-guard bypass. Confirm one course destination and one latest-period row.
- Graded zero versus ungraded/missing profile, partial section request failures and independent Retry, absent versus present-zero versus past-not-recorded versus future lesson. No profile fallback that invents 100% attendance.
- Period arithmetic/explanation against authoritative rules, bonus above 100, unavailable/nonpositive denominator, labeled 0–5 homework and explicit attendance, accessible comment disclosure. Chart eligible zero, gaps, scheduled-only exclusion, aligned periods, readable text alternative and no >100 clipping.
- Rank tie/population/missing-summary/withdrawn-enrollment tests for the approved separate policy. Any next-lesson correction has its own end-date/timezone regression. Do not silently implement either inside a cosmetic commit.
- Student journal response contains only the authenticated row, with another student's private nonempty comment proving the boundary; unauthorized course/period access fails; aggregates expose no classmates.
- Every role's account loading/error/Retry, dirty-only PATCH, first-invalid focus, strict E.164, intentional phone clear versus omission, Discard, pending duplicate prevention, preserved draft during refetch/tab switch/failure, local success reset on edit and identity-change reset. Avatar and profile succeed/fail independently; Discard does not undo saved photo/theme/locale.
- Organization/rule draft isolation, false rule values, changed-field-only payloads, no stale cross-section overwrite, admin-only write guards, tab/query restoration and no fake webhook health. Appearance synchronizes with header controls without profile PATCH.
- Inbox own-user filtering and cross-user mark-read denial; populated/empty/loading/error/refresh cases; row-local concurrent pending/retry and cache invalidation; event date versus sent timestamp; successful score-marker and failed raw-exception fixtures never reveal those strings. Page restoration/out-of-range recovery, no page-local filters, no automatic read and no raw-ID staff links.
- Both themes and en/ru/tg parity at 320/390/768/1024/1440; long names, emails and translated labels; missing photos; semantic contrast/control boundaries; keyboard semantics; 44px targets, 16px inputs and no document overflow. Capture populated archive/inbox and failure/mutation states with authorized fixtures during implementation, without inventing baseline evidence.

Run `cd backend && python -m pytest app/tests -q`, `cd frontend && npx vitest run`, `cd frontend && npx tsc --noEmit`, plus touched-namespace parity and meaningful task-specific regressions in mandated Conda base. If any API schema changes, run `python backend/scripts/generate_contract.py` and synchronize CONTRACT.md and TypeScript in the same change. Read/verify ignored `frontend/src/lib/` files explicitly and report their untracked status. No tests, runtime captures or implementation completion are claimed by this documentation revision; implementation later follows the repository's logical-commit protocol.

## User-authorized shared SVG loading indicator (2026-10-10)

Apply the bounded editable-SVG artwork and animated-book loading contract in [MOTION.md](../MOTION.md), section “User-authorized SVG artwork and brand motion (2026-10-10)”. Use the supplied shared book indicator alongside matching loading geometry/status when activity needs feedback; preserve readable loaded data during refetch and use a static reduced-motion fallback. No full-logo loops on these operational pages, no invented progress percentages or motion library. This explicit authorization does not change permissions, persistence, metric semantics, dependencies or deferred feature scope.

## UX overrides from the screenshot review (2026-10-16)

These were found in the Group 06 baseline contact sheets. They apply on top of this plan and follow the user's standing preferences:
- short copy, with explanations behind an (i) InfoTooltip
- icons on metrics and actions
- names, never IDs
- custom listbox popovers
- page-level scroll only
- smooth 150/200ms motion-safe transitions
- charts in the Journal progress chart style

### KITOB-06-01 /my/courses
- Cards use a compact landscape layout on desktop: a three-column grid, an image at a 16:9 ratio with a soft gradient, and a fallback with the course initials on a token tint when no image exists.
- The score uses a tabular-nums number plus a slim progress bar coloured by band (good, ok, risk tokens), never always red. The text "3 of 3 periods" becomes a small stepper of dots.
- The teacher shows as an avatar plus name on one line, with no pill-on-image look.
- Active/Archive is a segmented control with counts. The empty archive says why it is empty in one short sentence.

### KITOB-06-02 /my/courses/:id
- Header: a breadcrumb, the course name, then muted dates and the schedule summary ("Mon · Wed · Fri 09:00–11:00") in one line, plus the teacher avatar. The separate "Weekly schedule" card goes, and the next lesson appears as a highlighted chip ("Next: Fri 09:00").
- Stats: four compact tiles with icons (score, attendance, absences, rank "1 of 9"), with short labels and an InfoTooltip for the class-average definition.
- Trend chart: use the Journal progress chart style, with a smooth line, a dashed class average, a crosshair tooltip and the y-axis from 0 to 100. The current chart is a flat red line with no affordance.
- Study periods: compact clickable rows (period, dates muted, score, chevron) that navigate to /my/journal/:id. Replace the green dots with a score band chip.
- "About course" is collapsed to two lines with a "More" toggle.
- On phone the bottom nav must not overlay content. Add a bottom padding equal to the nav height plus the safe area; the baseline shows the nav covering the chart.

### KITOB-06-03 /my/journal/:id
- Score summary: the large total with a breakdown bar is good. Label the segments with icons and keep the values in a legend row. Rank appears as a small chip, not a boxed card.
- Lesson list: group by week, with each row showing the date (weekday short plus date through formatters), an attendance icon only (a check, or a red x for absent; drop the repeated "Attended" text) and the score as a 28px pill. Add an optional comment indicator.
- Add a small period switcher (the custom listbox, reusing JournalPeriodPicker styling) so the student can move between months without going back.
- Phone: the same bottom-padding fix.

### KITOB-06-04 /settings personal
- Use a two-column settings layout on desktop: a left section nav (Profile, Appearance, Notifications, plus Organization for superadmin) and the content on the right. Do not use tabs that wrap onto two lines on phone (the baseline has "User / Profile" wrapping). On phone, use a list of sections that drill in.
- Sections use the row pattern "label + description muted | control", not stacked form cards.
- Theme and language become two labelled segmented controls with icons (Light, Dark, System and RU, TG, EN). All copy is translated; the baseline has Russian "Тема и язык" inside the English UI.
- Save is contextual: a sticky bottom bar appears only when the form is dirty, showing "Unsaved changes · Discard · Save". There is no permanently floating red Save button.
- Remove the visible version string, or move it into an About row.

### KITOB-06-05 Organization
- Rows: organization name (inline edit), currency (read-only, with an InfoTooltip saying why), and Telegram bot status as a row with the status dot, the bot name and a "Test" action.
- Use the same dirty-save bar.

### KITOB-06-06 Notification rules
- Use toggle switches, not checkboxes. Each rule row shows an icon, a name, a one-line description and channel chips (Telegram), with the switch on the right. Changes autosave with a "Saved" toast, so no Save button is needed.

### KITOB-06-07 /notifications
- A role-appropriate inbox, not a dispatch log table, for students, mentors and accountants. Each item has an icon by type, a title, a one-line body, a relative time and an unread dot. Items are grouped by day, with "Mark all read". The empty state uses an illustration icon and one sentence.
- Superadmin additionally gets a "Delivery log" tab with status chips (sent, failed or queued) and a failed-only filter chip. That tab uses phone cards instead of the squeezed seven-column table.
- The title is "Notifications", not "System Notifications Log". The explanation moves into an InfoTooltip.

### User decision (2026-10-16): students see the real class journal and chart
This supersedes the KITOB-06-03 lesson list and the KITOB-06-02 single-line trend above. On the user's explicit instruction, a student enrolled in a course sees the same journal grid and Progress chart that the mentor sees, with classmates' names and scores, but read-only.
- **Read-only.** No picker, no attendance or comment editing, no keyboard edit mode, and no save marker. The student's own row is highlighted and pinned first.
- **Progress chart.** Same component and style as the mentor's: per-student lines, the class average, the crosshair and the "+N more" legend. The student's own line is selected by default along with the top classmates.
- **Backend.** Needs a student-authorized, read-only class journal endpoint, restricted to courses the student is actively enrolled in or archived from. It returns the same shape the mentor grid consumes, without private fields (comments by others, contact data). This is a privacy-boundary change that needs explicit tests: a non-enrolled student is denied, and no other students' contacts or private comments appear. Coordinate with the backend owner; the Codex backend agent works in parallel.
- **Reuse.** Reuse JournalGrid, JournalLessonView and JournalProgressView with a `readOnly` mode instead of building a separate student view.
