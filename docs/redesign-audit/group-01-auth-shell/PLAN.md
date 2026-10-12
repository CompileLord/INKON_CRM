# Group 01 — authentication, dashboards, and shared shell

Status: independently reviewed and revised following approval of [GROUP-01.md](../reviews/GROUP-01.md). Forty accepted real captures cover login, verification, four seeded dashboards, and mobile shell surfaces. `/set-password` remains source-specified because no legitimate seed session reaches it. Application implementation has not started. This revision changes this plan only; it does not claim implementation, new capture, test execution, or Taskmaster completion.

## Evidence and remaining gaps

The four original `screenshots/login-{desktop,mobile}-{light,dark}.png` images and `screenshots/login-probe.json` establish rendered public forms, correct themes, no horizontal overflow and no page/request errors at 1440 × 1000 and 390 × 844. They do not establish authenticated seed data.

The remaining 36 accepted captures cover four verification variants, four variants per role dashboard and two phone themes per role's notification/settings surface. Independent review inspected all 13 contact sheets, all original login/dashboard variants, and selected original verification/overlay captures. The manifest records successful role login/refresh, four admin courses, 33 students, two mentor courses, three student journal periods and real finance/audit/payment responses. Initial wrong-password attempts are distinct from successful sessions. Notification and mentor grading queues are genuinely empty. Final student captures contain the actual course/mentor JPEG media; rejected blank/proxy-failure trials are not production evidence.

Uncaptured states remain explicit: legitimate forced-password session; populated notification preview/grading queue; desktop opened overlays; loading/error/stale/mutation states; long ru/tg strings and unusual amounts. Browser phone captures do not verify physical keyboard, safe area, dynamic browser chrome, sticky hover, landscape, touch or reduced-motion feel. A fixed bottom bar intersecting a full-page screenshot at the original viewport edge does not alone prove the last content is unreachable.

| Observed baseline | Revised target | Reason |
| --- | --- | --- |
| Small centered desktop login card and text-only IMKON mark | Equal form/brand panels with supplied KITOB artwork | Deliver the requested identity and purposeful desktop composition |
| Staff phone icon rail, displaced settings, clipped notification panel | Full-width content, labeled bottom destinations, mutually exclusive bounded surfaces | Improve readable width and predictable access |
| Tall metric cards, role-colored banners and redundant course/result graphics | Compact summary groups and immediate task sections | Reduce scrolling and competing emphasis |
| Student next lesson appears after its course's displayed end date | Date-bounded, timezone-defined eligible lesson before emphasizing it | A prominent lesson must be trustworthy |
| Dark links inherit orange overrides | Theme-aware primary blue for ordinary actions | Keep both themes aligned with the same semantic hierarchy |

## Shared implementation contract

Use [tokens.md](../../../tokens.md) for centralized light/dark colors, typography, space and shape. Page surfaces use `bg-cream`, content surfaces `bg-card`, quiet summaries `bg-strip`, selected neutral surfaces `bg-beige`, hoverable rows `bg-row-hover`, text `text-ink`/`text-muted`/`text-label`, and structural borders `border-border`/`border-border-warm`. Map ordinary links, selected navigation and primary controls to the theme-aware primary role with `on-primary` foreground. Remove inherited `dark:text-accent`/`dark:bg-accent` overrides from those roles. Orange is a deliberate supporting brand accent, not the default dark action color. Semantic success/danger/warning remain distinct and include a text/icon cue.

Add the approved shared `control-border` role for essential input boundaries. Review calculations show existing proposed border/card pairs at 1.30:1 and 1.52:1 in light, 1.62:1 and 2.14:1 in dark; those do not meet the token contract's 3:1 control-boundary target. Central starting values are light `#7C8EA7` and dark `#748CA9`, respectively 3.34:1 and 4.64:1 on proposed card surfaces. The root token task declares the role and verifies all actual adjacent surfaces; components consume its semantic class, never these literals. Keep structural separators quiet. Inputs also have an explicit focus ring, visible label and associated error; error distinction cannot depend only on border color.

Geometry: 16px phone gutters/panel padding, 28–32px desktop page gutters, 20–24px desktop panel padding, 12px internal metric gaps, 16px related-group gaps, 24px between sections. Content is centered with maximum width 1440px. One H1 per route: 28/36 desktop, 24/32 phone; section headings 18/26; body/phone inputs 16/24; metric labels 14/20 sentence case; metrics 28/36 with tabular numerals. Small metadata may use 12/18. Default controls are at least 44 × 44px; form inputs 48px high; control radius 10px, surface radius 16px. Natural row/field heights grow for translations and zoom. Do not reduce font sizes or truncate essential money/actions to hit a density target.

Every collection or independently fetched pane implements geometry-matched initial skeleton, error with a working local retry, explanatory translated successful-empty state, and loaded state. A failed count/amount is unavailable, not zero. Background refetch retains loaded values and rows. If it fails, show a section-local stale/update-failed message and retry; do not silently imply freshness or replace the loaded pane with initial skeletons. Pending mutations disable only their relevant action, preserve context and announce the actual outcome. No number count-up or animated refetch reordering.

Every visible string, aria label, count, error, empty message and language/theme label uses `t()` with keys in en/ru/tg and bidirectional parity tests. Dates/times use shared formatters and their actual date-only/datetime semantics. Money stays decimal strings through formatting/arithmetic; changing numbers use tabular numerals. Backend authorization and role map remain authoritative. Do not fetch one profile per row to beautify a list.

Mobile platform: retain zoom, use viewport-fit/safe-area support and theme-aware browser chrome, dynamic viewport bounds for app/dialogs and naturally scrolling small-viewport auth layouts. Capability-gate hover. Controls use touch-action manipulation and local selection suppression; content remains selectable. Nested surface bodies contain overscroll. No custom swipe dismissal, global scrolling prohibition or new motion dependency.

## Shared authentication frame and brand assets

Use one frame for login, verification and forced-password setup. The supplied original assets are:

- Full logo: `/home/compilelord/Downloads/ChatGPT Image Oct 8, 2026, 05_14_59 PM-1.png`.
- Emblem: `/home/compilelord/Downloads/ChatGPT Image Oct 8, 2026, 05_14_59 PM-2.png`.
- Brand reference: `/home/compilelord/Downloads/KITOB Brand Guidelines Poster.png`.

Preserve proportions, colors and orientation. Do not rebuild the wordmark with a font, recolor the PNGs, add logo shadows/filters, or invent an inverse version. Measure visible artwork rather than using the transparent canvas as its size. The full logo's protected margin is at least the rendered height of its K on every side. Reserve that margin in the wrapper even if an optimized derivative removes surplus transparent canvas. Preserve the original files. Enlarged inspection suggests rough colored edge pixels, especially beside the emblem's orange page; actual 1×/2× compositing on both intended themes is an asset acceptance gate, not proof of an app defect. Resolve defective artwork explicitly rather than masking it with effects.

At 1024px and wider, use a full-width 50/50 grid with two `minmax(0, 1fr)` columns. The left uses `bg-card`, at least 32px inline padding and a centered inner column capped at 400px. Align the logo stage and form's left edge. Place theme/language utilities in a separate top row outside the logo's protected area. Flexible vertical spacing places the form near the optical center when height permits; at short heights, normal document scrolling keeps logo, form and submit reachable. The form is not another elevated card inside this panel.

The right uses the tokenized light-blue/cool-navy illustration field. Center one emblem/text composition; text maximum width 440px. Visible emblem width starts near 240px at a 1024px viewport and reaches 320px at 1440px, subject to its protected wrapper fitting. Use 32px from artwork stage to editorial heading, then 12px to supporting copy. Editorial heading uses the token's Cyrillic-capable serif, 40/48 on wide desktop, reducing to 32/40 in the narrower 1024px panel. Copy may wrap naturally; limit supporting copy to one short sentence.

Create WebGL-like depth with the supplied dimensional emblem and at most two broad static page-like background shapes using shared surface tokens. Keep shapes outside the protected artwork region. No feature grid, floating badges, orbiting academic icons, extra slogans or continuous animation. A single optional 200ms motion-safe opacity entry of the separate background composition may run on a fresh auth entry; logo/text/form geometry stays fixed, no stagger, and auth-to-auth navigation does not replay it. Keyboard/reduced-motion entry is immediate.

Pointer tracking is removed from the required first implementation. A later approved visual comparison may evaluate background-only displacement capped at ±6px over 200ms ease-out on fine hover pointers, resetting on pointer leave. It must improve the rendered composition and keep the mark/text fixed. That experiment is deferred; the initial composition is complete on touch and reduced motion without it. No renderer or pointer-motion package is required.

Below 1024px, remove the large right pane. Use 16px gutters, a 400px maximum form column, a compact brand/utility header, then 24px before the form heading. Keep a single 44px settings trigger for theme/language. The full logo may occupy its own protected stage; use the supplied compact emblem where header width cannot contain the full protected logo and utility control. Prioritize the form over vertical centering. At 390 × 844 and normal text size, the empty login form's submit is visible without scrolling. At 320px, enlarged text, short landscape or with the keyboard open, let the page scroll rather than compressing controls.

Dark-theme full-color artwork uses an approved white backing where needed for contrast. The shared asset task supplies a semantic brand-plate backing and the required clear space; the plate does not become a large bright decorative card. The embedded logo tagline need not become readable body copy at small shell sizes; supply a translated accessible brand name.

### `/login`

Left-column order: H1; one explanatory sentence; email label/input; password label/input with trailing 44px visibility control; full-width primary submit; invitation-code link. Use 24px after heading/copy group and 16px between form groups. Inputs retain password-manager autocomplete, email keyboard and appropriate capitalization behavior. Keep visibility state and value stable while errors appear. Field errors sit below their input with `aria-describedby`; the form-level error is a readable local alert that grows naturally without relocating focus unexpectedly.

Right copy: “Open a new chapter.” and “Your courses, progress, and learning community in one place.” in the auth namespace, translated into ru/tg. It supplies brand context, not navigation.

States: idle; field-invalid; submitting with stable button width, `aria-busy` and duplicate-submit prevention; authentication rejection; network failure preserving entered values and offering retry. Do not clear credentials on a theme/locale change. Preserve safe redirects, forced-password routing and the invitation route. Visibility is a non-submit control with translated state-aware accessible name and stable focus.

Acceptance: valid login resolves the authorized destination; `//` redirects are rejected; forced-password sessions go to `/set-password`; errors associate with the right fields; visibility/locale/theme preserve typed values; keyboard submit and password manager work; all targets, input text, contrast pairs, artwork proportions and protected margins pass both themes at 320/390/768/1024/1440.

### `/verify-email`

Reuse the auth frame. Left order: H1; concise invited-account explanation; email; a single six-digit code input; primary Confirm; lower-emphasis Resend with cooldown/status; return-to-login link. The right has concise getting-started copy in the same namespace. Keep native numeric input behavior with `inputmode="numeric"`, `autocomplete="one-time-code"`, full-code paste and explicit six-digit validation. Do not introduce six custom focus boxes or an OTP dependency.

States: idle, invalid email/code, verifying, resend pending, resend success/cooldown, expired/invalid code, and network failure. Reserve the resend status region's ordinary line space but allow long translations to grow; status changes must not move the primary action above it. Use interpolated countdown units and tabular numerals. Persist entered email/code across theme/locale changes and prevent duplicate actions; do not claim resend success on failure. Honor server cooldown semantics rather than inventing a new persistent timer contract.

Acceptance: paste/keyboard/autofill work; code length validation is explicit; verification and resend cannot duplicate while pending; cooldown and expired-code messaging work in three locales; errors, back link and controls remain reachable with phone keyboard. Only idle forms were captured. Valid invitation and resend states require legitimate local fixtures; do not forge tokens or send real mail for a screenshot.

### `/set-password`

Source-specified until a legitimate `mustSetPassword` session is available. Preserve the authenticated forced-password guard and do not add a bypass login link. Reuse the shared frame with H1, concise requirements, new-password field, confirmation field, a common 44px visibility control clearly labeled as affecting both, and a full-width save action. Both inputs use `autocomplete="new-password"`; mismatch/policy feedback belongs below the affected field. No focus jumps as requirements update. Desktop uses the static shared illustration; phone keeps the form in ordinary scroll flow.

States: idle, invalid requirements/mismatch, saving, server rejection, connectivity failure and successful authorized landing. Preserve field values on retry, duplicate-submit protection, password privacy in artifacts and session updates after success.

Acceptance: unauthenticated users go to login; ordinary authenticated users leave this route; genuine forced-password sessions remain; valid matching passwords submit once; success clears forced state and lands correctly. Capture both themes and real phone keyboard state once a legitimate test fixture exists. The present 40 captures do not cover this page.

## Shared shell, navigation and overlays

### Desktop at 1024px and wider

Use a 240px labeled sidebar, 16px internal horizontal padding, protected full logo stage and 44px-minimum navigation rows. Fit the visible logo and K-height margin inside the actual 208px inner width; never assume a 200px artwork image leaves sufficient clear space. Selection uses a quiet selected surface, primary icon/text, weight and `aria-current`; avoid separate colored icon tiles. Keep a quiet account/logout area at the bottom, with sidebar scroll if height is limited. Existing explicit desktop collapse may remain if retained during implementation, but route clicks never trigger expansion and widths never animate. Persist only an explicitly chosen collapse preference; it must not control the phone presentation.

The 56px header uses a quiet route context at left and utilities at right. Remove the unused global search input. On dashboards show translated Home, not a second role H1. Detail routes show a permitted parent breadcrumb and current context from their route/data; long names wrap or shorten only nonessential breadcrumb text with the full accessible name available. Use the access map for links, not hand-built role exceptions. Working page searches remain inside their own pages; global search is a separate deferred capability.

A skip-to-content link is the first useful focus target, visible on focus and linked to main content. Main/heading focus after an actual route change is deliberate; data refresh, theme changes and open forms must not steal focus. Preserve list return/scroll context specified by other groups. Direct-entry detail pages get deterministic permitted parent links, not history-only Back behavior.

### Phone and tablet below 1024px

No persistent side rail. Use a 56px header plus top safe-area inset: compact supplied emblem on root pages, or a 44px permitted parent/back action with concise context on detail pages. Header utilities are explicit 44px controls. Mentor/superadmin show notification preview and settings; student/accountant show settings only because Notifications is a primary bottom destination. The shared unread state/badge belongs on that bottom destination for these two roles. Desktop keeps the header preview for every authorized role. An unread-count failure must not announce zero.

| Role | Main bottom destinations | More contents |
| --- | --- | --- |
| Superadmin | Home, Courses, Journals, More | Students, Mentors, Finance, Audit, Notifications, Settings, Logout |
| Mentor | Home, Courses, Journals, More | Own profile, Notifications, Settings, Logout |
| Accountant | Home, Finance, Notifications, More | Settings, Logout |
| Student | Home, My courses, Notifications, More | Own profile, Settings, Logout |

The bottom bar is a minimum 64px plus bottom safe-area inset with four equally allocated destinations, recognizable icons, translated labels and minimum 44px targets. Grow the bar if supported text scaling wraps labels; content padding and scroll-padding reserve its actual height plus 16px breathing room. Selection remains still. More's active indication reflects a permitted current destination inside it; it is not a fabricated route. Own-profile items depend on the auth identity fix; never weaken guards to make them work. No unauthorized items are rendered.

### One overlay lifecycle

Use one shell state: closed, More, settings, or notifications. Opening one closes the previous surface. Explicit click/tap/keyboard activation opens settings; ordinary focus and hover do not. Triggers expose expanded state and their surface relationship. Shell overlays are transient, never restored from persistence after reload or route change.

On phones, use the same modal geometry for More, settings and preview: width `min(360px, viewport width minus 32px)`, centered horizontally, bottom offset `16px + safe-area-bottom`, and maximum height `100dvh minus safe-area-top minus safe-area-bottom minus 32px`. The body scrolls with contained overscroll; title and 44px close control stay outside it. The backdrop covers/inerts the page and bottom bar, so the dialog occupies available space rather than sitting above an interactive second navigation layer. More uses single-column 44px-minimum links and separated logout; no custom drag handle/gesture.

On desktop, settings and notifications are trigger-anchored nonmodal popovers, maximum 360px wide with 16px viewport collision padding and dynamic height bounds. Their origin follows the actual positioned trigger edge. Escape/outside activation closes them and focus can return to the surviving trigger; ordinary Tab traversal does not become a modal trap. Actual payment/form dialogs use the shared modal primitive and their own task geometry.

The shared primitive owns stacking and scroll locks. Only the active modal is focus-contained; background controls are inert. Modal opening establishes focus immediately on its heading/close or appropriate field. Escape, close button and backdrop dismiss shell dialogs. Theme/language choice keeps the dialog open and selected control focused. Navigating a More/preview link closes the shell overlay, releases locks and focuses destination content after navigation. Dismissal without navigation restores focus to the surviving trigger. At the 1024px breakpoint, close any obsolete shell presentation, release locks and restore focus to an equivalent visible control or main context; never leave an invisible focus trap. Payment dialog values survive a viewport resize, and its modal geometry adapts without becoming a shell popover.

Opening payment entry first closes any shell overlay. Closing one surface cannot unlock another active modal. Rapid close/reopen must not create duplicate surfaces or leave an invisible hit blocker. Route selection and keyboard operations are immediate; surface exit must not delay the user's action or retain modality after navigation.

### Quick settings

An accessible titled Theme group offers icon-plus-text Light/Dark/System choices. A Language group offers readable language names in their own languages through locale keys. Each choice is at least 44px high with explicit selected/checked state and a visual check, not color alone. Use three columns only if all labels fit; stack at narrow widths/large text. Keep a visible close button.

Reuse the existing shared theme store and i18n persistence mechanism, synchronized with Group 06 Appearance. Choices apply immediately and need no Save button. Persist explicit light/dark/system and language; system theme continues to follow OS changes while selected. Update browser chrome from effective app theme, not just OS preference. Theme/locale changes retain open surface, focus and form drafts; no whole-page crossfade or hard reload.

### Notification preview

Show a translated personal-notification title, honest unread state and at most five recent authorized rows. Use localized event meaning, event date via `formatDate(notification_date)`, optional separately labeled sent timestamp only when real, and a related subject link only after type mapping/authorization is verified. Follow Group 06's display contract: omit raw `error_message`, internal `score:<value>` markers, exception strings and mandatory raw recipient/entity IDs. Nonempty internal error text is not proof of delivery failure. Unknown types use a safe generic localized label; a sanitized message-body/failure-reason contract is separate work.

Initial loading uses five row-shaped placeholders; error retains local retry and history link; successful empty explains that results/reminders for this account appear here; loaded rows distinguish unread with text/state and modest emphasis. Do not imply “all caught up” when no events have ever existed. Keep history link and close reachable in the bounded surface. No page-local search/filter toolbar or automatic mark-read on opening.

A mark-read action is row-local: pending disables that action, success changes it to Read without removing/reordering the row and refreshes unread state, failure offers inline retry. Preserve successful rows during background refetch and label stale errors. History selection closes preview and navigates to `/notifications`. Current captures cover empty delivery only; ownership and populated/error behavior require tests and legitimate fixtures.

## Role dashboards

Use one quiet heading/identity region and a shallow summary group before task content. Individual metrics can use spacing/dividers rather than separate outlined/elevated cards. Density checks below target normal seeded English content at 390 × 844, not mandatory pixel heights. Long ru/tg text, 320px width and larger text may grow and scroll; clipping is never the solution. Background refresh/error handling follows the shared contract.

### `/` — superadmin

Order: H1 and one operational subtitle; compact receivable/course/student summary; Needs attention; Recent activity. Desktop summary has three equal cells. Phone balance spans full width with paired counts beneath. Display decimal-string currency and independently truthful counts. Below, use a 60/40 split only when the content area supports a minimum 320px supporting column (approximately 840px total including gap); otherwise stack, including narrow 1024px shell layouts.

Needs attention displays five course/enrollment balances, not an implied ranking of five unique students. Each divided row contains student identity and course, due-unpaid amount, overdue duration where real, and one permitted finance action. Keep amount unbroken; move it to its own labeled line at 320px/large values rather than shrinking it. Use danger only for actual overdue status. The footer opens all debts. Where the existing analytics preview has lost course identity, compose from the permitted paginated debts response with a limit of five as specified by Group 05; do not aggregate a fetched page into student totals.

Recent activity shows five field-change records on desktop and three on phones, plus View all activity. Use a translated changed field/value summary with actor/entity/reference/time as supporting context. Allow two lines on phones. Create values do not need repeated “null →”; preserve real null/empty/zero distinctions in the audit detail. Do not merge records by timestamp/entity because no event correlation ID establishes one operation. Technical data belongs in the authorized audit inspector. An audit failure does not remove summary or attention data.

States: individual summary loading/unavailable/loaded; attention row skeleton/error-retry/no-current-balances/loaded; activity row skeleton/error-retry/no-records-yet/loaded. No failure becomes zero or successful-empty. Target: first useful attention row appears before roughly 520px at 390px/default text. Keep one H1, logical section headings and real keyboard links instead of inaccessible whole-card clicks.

#### Attention-to-finance capability

Approved as a separately scoped navigation enhancement, not already implemented. Clicking a course-balance row should open Finance's Debtors destination with permitted student/course context visible and clearable. Validate supported route/filter/API contracts first. Encode only supported, validated context in URL/search state so refresh and browser Back preserve it; use returned stable IDs, never display-name matching. Carry origin/scroll context on return and show the selected filter summary even if its result is empty.

If the existing backend cannot represent that context, add a separate authorized filter/repository/contract task and block completion of this enhancement on it. Until then, a clearly labeled View debts link remains usable; do not pretend a generic destination is already filtered or filter only the fetched page. Requests retain superadmin/accountant permissions, and unauthorized IDs must not reveal data. Acceptance covers valid context, clear, refresh, Back, missing/removed enrollment, empty results, request failure and cross-role denial. Group 05 owns the Finance integration, shared with this dashboard task.

### `/` — mentor

Order: H1/subtitle; compact summary; grading queue; active-course rows. Start with two primary metrics, active courses and periods needing grading. An unavailable student count is a compact translated explanatory metadata line, never a full peer card containing a dash. Resolve the auth identity/data issue; when an accurate count is available, it may become a third quiet summary value. Never conceal that source failure as zero or permanently remove legitimate data to hide it.

The queue is the first actionable section. Each row shows course, period title/state and one 44px Open journal action selecting the real period. Empty-success uses a small calm check/text row explaining there is no pending grading, without a tall congratulations panel. Queue errors use retry rather than “everything graded.” Loading matches the row geometry. Do not fabricate a Today schedule teaser from unchecked dates.

Active courses: desktop two columns when each row has at least 320px; otherwise one column. Phone rows use full content width with title and exam cadence first, then a reachable 44px journal link on its own line when the title is long. Avoid a nested small button squeezed beside a four-line title. Preserve mentor scoping, real journal identifiers, period selection and downstream autosave behavior. Course loading/error/success-empty/loaded is independent from queue and summary.

Acceptance: seeded two courses are mentor-scoped; unknown student count stays explained; queue empty is a successful response; every row action opens the authorized period/course context; no staff finance or unrelated mentor analytics requests. At 390/default text a usable journal action is visible above bottom navigation, including the current empty-queue case.

### `/` — student

Use the student's name as the compact identity-region H1 (24/32 phone, 28/36 desktop), optional 40px avatar, and a short truthful enrollment context; do not add a second large dashboard banner. Phone order: identity, eligible next lesson, two-by-two metrics, compact current-course rows, latest graded result. Desktop keeps the identity and shallow summary across the top, then a larger next-lesson/course column and a latest-result column with minimum 300px. Use the split only with at least 824px available content width (500px main + 24px gap + 300px result); otherwise stack, including constrained 1024px shell layouts. Keep DOM/keyboard order meaningful.

Metrics are average score, attendance, absences with denominator, and active-course count/link. Values remain static/tabular; valid zero, unavailable and ungraded are distinct. Preserve authoritative aggregate rules. A score is a numeric result, not course completion: follow Group 06's approved shared result component, removing default score tracks/stacked bar and redundant duplicate percentages. Use success/information semantics only when justified, never a red bar for the seed's 98%.

#### Eligible next lesson — required correctness dependency

The captured next lesson date `10/12/2026` is after the displayed course range `06/01/2026–08/31/2026`. Source inspection confirms `user_repository.py` calls a weekly-schedule helper without course date bounds, and that helper uses naive current datetime. Fix this as a separate tested domain task before promoting the lesson as the main feature. Respect course/enrollment eligibility, course start/end boundaries and a documented school timezone; shared formatting must represent that timezone correctly. Do not weaken status/bucket rules or infer eligibility from a course title.

Loaded anatomy: small Next lesson label; prominent localized weekday/date and start time; course title; mentor metadata; one View course link. Mentor data follows the existing enrolled-mentor authorization boundary. Successful no-eligible-lesson response renders a compact “No upcoming lesson scheduled” explanation with a course/schedule destination. Request failure is retryable and distinct; loading reserves the same region. Avoid fabricated times or implied attendance after course end. If mentor lookup alone fails, keep the valid lesson/course/time visible and treat mentor information as unavailable.

Tests cover before course start, after course end, same-day passed lesson, absent schedules, multiple eligible courses and timezone/date-boundary cases. Move scheduling business logic into the project's typed service abstraction as needed, retaining repository/service separation; this is not a one-off JSX filter workaround.

#### Current courses and latest result

Render up to three current-course previews as compact rows with 64 × 64 identification thumbnail, wrapping title and schedule metadata, small labeled personal score, and one clear course destination. Avoid another period shortcut nested inside the row; periods are prominent in Group 06 course detail. At 320px allow score/link onto a lower full-width line. If media fails, keep the reserved 64px geometry and translated accessible fallback; final audit media loaded correctly.

Course states: matching row skeletons, local retry, enrollment explanation on successful empty and loaded rows. At 390/default text, next-lesson navigation and useful course text should be visible before decorative media occupies the viewport. Identity and summary must not consume a hero-sized region.

Latest result is graded-only. The existing service orders journals by descending period start and the dashboard filters graded records; preserve that interpretation rather than silently choosing recently edited records. Title includes the course and period. Lead with score/nominal maximum; use a secondary percentage only where it adds meaning, and four compact aligned labeled contributions (homework/attendance/exam/bonus). Bonus remains additive and may produce a value above 100%; do not clamp or use a misleading capped completion track. Reuse Group 06's translated “How this result is calculated” disclosure using verified calculation rules; no animated height. One Details link opens the actual permitted journal. No invented grade thresholds.

Result loading/error-retry/no-graded-period/loaded is independent from profile/course data. Missing journals never masquerade as “No grades yet.” Preserve own-row privacy, ungraded exclusion, zero scores and denominator correctness. At end-of-page scroll, result and action remain above the safe-area-aware bottom navigation.

#### Calendar export — deferred optional capability

Retain the approved recommendation as a deferred follow-up, not an initial redesign requirement or a visible disabled placeholder. After lesson eligibility, start/end/duration and timezone are trustworthy, a single secondary Add to calendar action may export that lesson as a calendar file with translated event text and a permitted course link. No connected calendar account, automatic send or external calendar write is implied.

Before enabling it, create a separate capability task covering reliable duration/end contract, timezone/date-boundary handling, escaped event text, stable event identity and file-generation tests. If any field is unavailable, keep the feature deferred rather than guessing. The initial dashboard has only its primary course link in this region and still meets design completion without calendar export.

### `/` — accountant

Order: H1/short subtitle and primary Accept payment; shallow summary; latest-payment list. Desktop action sits at heading right; phone uses a full-width 44px-minimum button immediately below heading copy. Remove the green banner and decorative role pill. Use semantic primary/on-primary; receipts may use subdued success text, not a green surface around the page.

Summary groups current due-unpaid receivable, net cash collected for an explicit period, and current debtor count. Clearly scope the period label to collected cash, including refund meaning as specified by Group 05; current receivable is not a historical snapshot and latest payments remain all dates unless their own query is filtered. Phone amounts may share two columns only if complete decimal string/currency fits. Large amounts use full-width rows without smaller type; debtor count can be a supporting line. No error-to-zero fallbacks. Preserve independent analytics/count query state.

Recent payments show five records: desktop aligned table, phone divided ledger rows. Phone first line contains identity/reference and nonwrapping decimal amount; subsequent full-width lines show course/allocation context, method and formatted date/time. Let an unusually large amount move to its own labeled line. Use only identity supported by the authorized response; no per-payment profile requests. The seed contains five payments, receivable 7,450 TJS and 17 debtors, with identifiers rather than guaranteed names. Those integers do not verify arbitrary-decimal precision.

List states: matching five-row skeleton, local error/retry, successful-empty explanation, loaded records. Background refetch retains records and explicitly marks failure. At 390/default text, payment action is immediate and at least the first recent-payment row is visible without scrolling. Default summary density must not push it below the fold.

Accept payment closes shell previews and opens the existing authorized Group 05 workflow in the shared modal. Group 05 owns form geometry, decimal validation, allocation-priority semantics, unsaved dismissal and ledger behavior. Do not duplicate or simplify those rules here. Pending disables duplicate submission. Success shows a durable translated returned payment reference and View payment action; the receipt/detail keeps actual allocations/current status and has independent loading/error/retry. A receipt or analytics-refresh failure never asks the user to repeat a successful payment. Preserve originating dashboard/finance context and return focus appropriately. Amount/date/method values survive responsive changes while the form is open.

Acceptance: only permitted accountant data is fetched; period collection zero differs from loading/error; five real records retain amounts/methods/allocations; payment success refreshes relevant sections; failure states remain local; full values and actions fit at 320/390 with long localized labels. Finance precision corrections or joined name enrichment are distinct backend tasks, not hidden in this layout change.

## Motion and persistence acceptance

Only existing CSS transitions and `card-scale-in` are allowed. Interactive press feedback: transform 1→0.96, 150ms ease-out on small controls under `motion-safe:`; disabled remains scale 1. No scaling whole rows/panels. Gate hover effects by fine-pointer/hover capability. Focus/color feedback remains available without motion.

Occasional shell/form surfaces use opacity 0→1 and scale .96→1 over 200ms ease-out; phone shell dialogs originate bottom-center, desktop popovers at the resolved trigger position, centered form dialogs at center. Exit follows the same path where it does not delay requested navigation/dismissal. Retarget interrupted CSS transitions or use the established entry keyframe; do not add a new timing vocabulary or timeout-based focus trap. Keyboard activation/Escape, route changes and reduced motion are immediate. Focus is never delayed for animation.

Auth supports the single static depth composition and optional fresh-entry background opacity treatment described above; required pointer tracking is removed. Reject repeating auth-route fades, looping logos, theme-wide crossfades, KPI lifts/count-ups, list stagger, moving tab indicators, chart drawing and journal keyboard animation. The highest-value motion is feedback and a clear occasional surface boundary.

Persist theme/language through their existing shared mechanisms, explicit desktop-collapse preference only if retained, permitted Finance URL context and list-return position. Do not persist open overlays or auth passwords. Theme/language changes and viewport changes preserve in-progress form values; successful submission, explicit discard and logout follow the owning form/auth contract. No new state, toast, chart, motion, WebGL or gesture library is needed. The shared-primitives task may retain the previously proposed Base UI choice for accessibility after verification; no dependency was installed by this audit.

## Ordered tasks and completion gates

| Work package | Dependency and approved scope | Completion evidence |
| --- | --- | --- |
| Shared tokens/assets/controls | Central control-border and brand-plate roles; primary dark migration; actual PNG sizing/clear space/edge checks | Text/control contrast, artwork 1×/2× both themes, 44px targets, 16px phone inputs |
| Auth identity | Resolve current token/store identity mismatch before self-profile links | Restored/refreshed identity and role/forced-password guard tests; no authorization bypass |
| Shell and auth frame | Shared controls/assets, accessible overlay primitive; identity for self links | All page anatomy above, role navigation, route context, skip link, one-overlay lifecycle, form states |
| Date-bounded lesson correctness | Eligibility/timezone/service behavior before student next-lesson emphasis | Explicit start/end/passed/empty/timezone/multiple-course tests, contract sync if needed |
| Four dashboards | Shared shell, accurate data contracts and Group 05/06 shared row/result conventions | Independent initial/stale states, density and long-value checks, real authorized destinations |
| Attention-to-finance context | Group 05 route/filter integration; backend filter task only if unsupported | URL/clear/back/refresh/permission/missing-context cases; no fake local-page filtering |
| Deferred features | Optional calendar export, later parallax comparison and true global search remain separately scoped | No placeholders or claims of existing capability; meet stated contracts before enabling |

Before coding, follow `.taskmaster/tasks/tasks_index.json`, identify the correct task file/dependency order and mark only the actual task in progress. This approved planning revision does not create or complete implementation tasks. Services/business workflows remain typed classes with appropriate injected abstractions; backend changes preserve clean layers, privacy, decimal precision and database invariants. Regenerate `CONTRACT.md` using the project script after any schema change and synchronize TypeScript types in the same change. Read ignored `frontend/src/lib/` files directly, report their untracked status and intentionally stage necessary deliverables during implementation.

Required automated acceptance includes all page cases above plus: no duplicate overlay; hover/Tab does not open settings; immediate keyboard surface use; rapid close/reopen; route/breakpoint dismissal and unlock; focus restoration when triggers disappear; payment resize persistence; cross-user notification read denial and row-local failure; honest unread failure; theme/system/locale persistence and draft retention; safe redirects; independently retryable/stale dashboard panes; genuine zeros/ungraded/above-100 scores; course-bound schedule semantics; supported Finance context and role denial; all three locales with parity; no hardcoded visible strings or `as any`.

Run backend tests, frontend tests and TypeScript checks in the mandated Conda base environment, plus task-specific behavioral/parity checks:

```text
cd backend && python -m pytest app/tests -q
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit
```

After implementation, capture both themes at 390/1440 and verify 320/768/1024, long labels/names/amounts, missing media, initial/stale/error/empty/loaded states and keyboard/reduced-motion behavior. Obtain legitimate fixtures for forced password, nonempty inbox/queue and missing desktop-open surfaces; keep absent evidence explicit. Verify physical iOS/Android keyboard, safe-area/browser chrome, landscape, touch, input zoom and final scroll reachability. Commit only verified logical implementation changes under the project protocol; no push/PR without authorization. This plan revision performs none of those implementation operations.

## User-authorized SVG artwork and brand motion (2026-10-10)

The user supplied and authorized editable full-logo/emblem SVGs and animated book/full-logo SVGs, saved under `frontend/src/assets/kitob-svg/`. These supersede PNGs for active logo placements; preserve the original PNG and SVG files as source evidence. SVGs contain vector paths, not live text. Preserve proportions and measured protected margins. Theme-specific color adjustments are authorized where needed; inspect both themes rather than automatically adding a large white backing.

The animated book is the shared activity indicator for page loading and meaningful pending processes. It supplements matching skeleton geometry and a translated loading status; it must not imply progress percentages, replace retained data during refetch, or block keyboard use. Use restrained size and stable layout.

The full supplied logo animation loops in the desktop 50/50 login brand composition and the existing invitation/account-activation experience at `/verify-email`; there is no new public registration route. On phones prioritize the form and use compact static branding rather than adding a large animated panel. Keep both original animations unchanged as source assets and author a deliberate derivative if needed: their supplied CSS currently plays once, so looping must preserve the coordinated sequence rather than independently repeating every part with mismatched durations.

This explicit user request supersedes the earlier prohibition of repeating brand/loading animation ONLY for these supplied assets and placements. Asset-internal CSS sequence timings are a bounded exception to the 150/200ms control/surface vocabulary. Other UI motion remains CSS-only150ms interactive/200ms occasional surfaces, motion-safe and immediate keyboard operation. No motion/WebGL library, pointer tracking, animated numbers or unrelated decorative effects. Reduced motion receives a static readable logo/emblem with no shine, stagger or looping. Stop activity motion when the process ends; never persist passwords or replay via timers that remount forms. Verify real renders and reduced-motion behavior; do not claim a static screenshot proves the loop.
