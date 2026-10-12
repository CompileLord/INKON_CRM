# Group 01 independent design review

Status: recommendations for approval only. No baseline plan, token, application, capture, or Taskmaster state was changed. No live application actions were performed.

The baseline direction is sound. The largest improvement will come from its simpler shell and shorter dashboard hierarchy. Keep the equal desktop authentication split, quiet learning illustration, compact phone form, labeled role navigation, and restrained motion. The additions below make that direction more exact and address a few issues that a palette swap would leave behind.

## Evidence inspected and limits

Read Group 01 `PLAN.md`, the audit `README.md`, root `tokens.md`, `MOTION.md`, and `IMPLEMENTATION.md`. Read the mobile-native, emil-design-eng, find-animation-opportunities, and pick-ui-library skills. Project timings, semantic colors, translation requirements, and CSS-only constraints override illustrative skill examples.

Viewed all 13 contact PNGs in `group-01-auth-shell`: verification; all four dashboards; all eight role-specific notification/settings sheets. These collectively show the 36 non-login accepted captures. Also viewed all four original `login-{desktop,mobile}-{light,dark}.png` files, all 16 original role dashboard variants, original verification phone images in both themes, `superadmin-notifications-open-mobile-light.png`, and `student-quick-settings-open-mobile-dark.png`.

Viewed the exact supplied references:

- `/home/compilelord/Downloads/KITOB Brand Guidelines Poster.png`
- `/home/compilelord/Downloads/ChatGPT Image Oct 8, 2026, 05_14_59 PM-1.png` — full logo.
- `/home/compilelord/Downloads/ChatGPT Image Oct 8, 2026, 05_14_59 PM-2.png` — book emblem.

Screenshot filenames below are relative to `group-01-auth-shell/screenshots/`, unless identified as contact sheets. Read-only source checks included authentication, shell, dashboard, notification and modal components, `frontend/package.json`, and the student schedule/repository logic. Source evidence is distinguished from observed rendering.

Explicit limits remain: no legitimate forced-password capture; no populated notification preview or grading queue; no error/loading/long-locale screenshots; no opened desktop overlay captures; no physical-phone keyboard, safe-area, landscape, or touch verification. The full-page student image shows a fixed bottom bar across the document at the original viewport edge; that alone does **not** prove the bottom of the page is unreachable. Initial blank/media-proxy failures are excluded. Final student captures show loaded photographs.

## Already covered — keep without adding duplicate work

The baseline already specifies removal of the staff phone rail and unused global search; bounded settings/notification surfaces; 44px targets and 16px phone inputs; the login 50/50 split; proper supplied artwork; all three locales; independent collection states; semantic score colors; human-readable activity; decimal-string money; permitted mentor access; guarded password setup; safe redirects; reduced motion; and physical-device checks.

It also already rejects gradient dashboard banners, static-card hover lift, count-up metrics, route fades, new WebGL/motion dependencies, six custom OTP boxes, and unauthorized profile enrichment. These are implementation requirements, not new findings from this review.

## Must-fix additions before implementation approval

### M1. Separate essential input boundaries from quiet structural borders

Affected: all authentication forms and shared controls; this is a shared-token dependency for later groups.

Evidence: `login-mobile-light.png` and `guest-verify-email-mobile-dark.png` have faint field outlines. The proposed token table makes `border` serve both structural separators and inputs. Calculation from the proposed values gives only 1.30:1 for light `border` on `card`, 1.52:1 for light `border-warm` on `card`, 1.62:1 for dark `border` on `card`, and 2.14:1 for dark `border-warm` on `card`. These do not meet the token document's own 3:1 control-boundary target when the boundary is what identifies the input.

| Before | After | Why |
| --- | --- | --- |
| One faint border role covers decorative separators and essential field outlines | Add a semantic control-boundary token while retaining quiet structural borders | Forms remain identifiable without making every dashboard separator heavy |
| Focus is the only strong field distinction | Clearly visible resting boundary plus the existing focus ring and translated field label | A user can locate a field before focusing it |

Concrete proposal: add a centrally declared control-border role, initially light `#7C8EA7` and dark `#748CA9`, subject to approval. These calculate to 3.34:1 on the proposed light card and 4.64:1 on the proposed dark card. Use the resulting semantic class on essential input outlines, not inline literals. Recalculate against every actual adjacent surface and error state during implementation. No global thickening of card borders.

Dependency/risk: the root token contract needs a deliberate addition. The calculation is a design check, not a claim that any implemented form currently passes.

### M2. Make the login composition and asset sizing explicit

Affected: `/login`, `/verify-email`, `/set-password`, desktop sidebar and compact phone brand header.

Evidence: all four original login images show a small centered form and unused desktop canvas. The baseline solves that. The supplied poster adds a more specific requirement: the full logo's clear space equals the height of its letter K. The supplied PNGs also contain substantial transparent canvas; enlarged viewing suggests rough colored edge pixels, especially beside the emblem's orange page. This is an asset-integration risk, not an application-rendering finding.

| Before | After | Why |
| --- | --- | --- |
| “Logo near the top” and “center emblem” leave scale, whitespace and responsive composition open | Specify artwork stage sizes, clear space, and exact content alignment separately | Prevents huge transparent image boxes, illegible marks, or oversized white plates |
| Brand depth is defined mainly as pointer motion | Establish a successful static composition first | Touch and reduced-motion users receive the same brand experience |

Concrete addition to the existing 50/50 layout:

- At 1024px+, use two equal `minmax(0, 1fr)` columns. Give the left panel 32px minimum inline padding and a 400px form maximum. Align its logo stage and form to the same left edge. Keep the utility controls in a separate top row so they never compete with the logo's protected area. Use flexible vertical space around the form; at short viewport heights, let the document scroll rather than vertically clipping either the logo or submit action.
- Right panel: one centered composition with a maximum 440px text width; emblem visible-art width approximately 240px at 1024px, rising to 320px at 1440px; 32px between artwork stage and heading; 12px from heading to supporting copy. Preserve aspect ratio. Use at most two broad background page-like shapes in existing surface tokens; keep shapes outside the protected logo area. No orbiting badges, feature chips, extra slogans, or floating academic icons.
- Measure the full logo by visible artwork, then reserve at least one rendered K-height around it. Calculate its allowed size from the 240px sidebar's actual inner width instead of inserting a 200px image and hoping the clear space fits. Avoid forcing its tiny embedded tagline to behave as normal interface text; the translated image name provides identification.
- On phones, use a compact brand/utility header followed by a 24px gap and the form heading. Prefer one 44px settings trigger containing theme/language access over two tiny control clusters. Keep the supplied emblem for compact shell identification; the auth form can retain the full logo in its own stage when width permits.
- A dark-theme white brand plate must have its own semantic backing role and include the protected margin. Inspect both supplied PNGs on the intended light and dark backgrounds at actual 1×/2× sizes. Preserve originals; optimize transparency bounds only when that preserves every legitimate artwork pixel and the wrapper restores required clear space. If visible defects persist, resolve the artwork asset explicitly; do not hide them with glow, blur, CSS recoloring, or an invented inverse logo.

Dependency/risk: this needs artwork measurements and both-theme rendered inspection before final size approval. The poster supplies the brand metaphor and protection rule, not proof that the PNG edges are production-ready. No asset was edited here.

### M3. Complete the shared overlay lifecycle, not only its width

Affected: More, quick settings, notification preview, and the accountant payment dialog.

Evidence: `superadmin-notifications-open-mobile-light.png` starts beyond the left edge; every `*-quick-settings-open-contact.png` shows header displacement. These visible failures are already addressed. Source adds a remaining implementation concern: settings currently open on hover/focus, while the custom modal controls body overflow independently and does not implement focus containment.

Concrete addition:

- Use one mutually exclusive shell-overlay state: closed, More, settings, or notifications. Opening one closes the previous surface. A bare hover or ordinary Tab focus must not open settings; use explicit activation with `aria-expanded` and a relationship to its surface.
- Below 1024px, use one consistent modal presentation for the three shell surfaces: `min(360px, viewport width minus 32px)`, 16px side clearance, bottom placement with `16px + safe-area inset`, and a height bound derived from `100dvh` minus top/bottom safe areas and 32px. Keep title and 44px close control outside the scrolling content. More uses a single vertical list of 44px-minimum links, followed by a separated logout button. Do not place the dialog above a still-interactive bottom bar; the backdrop covers and disables that bar along with the page.
- On desktop, retain trigger-anchored popovers for settings and notification preview, with viewport collision handling. Keep click-outside behavior distinct from modal backdrop behavior.
- Route selection closes the overlay before showing the destination. Dismissal restores focus to its surviving trigger; navigation moves focus appropriately to the destination heading instead. If crossing 1024px removes the trigger, close the old presentation and release scroll/focus locks; never leave a hidden modal trapping focus.
- The shared overlay mechanism owns scroll locking and stacking. Opening the existing payment dialog must close a shell preview first. Preserve form values if the viewport changes while a payment dialog remains open.

Why this improves design: a stable surface feels predictable during real navigation, rotation, keyboard use, and theme changes. Merely setting `max-width` fixes the screenshot but leaves those interactions unresolved.

Dependency/risk: resolve this in the shared-primitives package before page-level overlays proliferate. The existing conditional Base UI recommendation can remain; this review does not require a new library choice or dependency. Verify rapid open/close, route changes, breakpoint changes, Escape, outside dismissal, and focus return with the chosen primitive.

### M4. Gate the student's prominent next lesson on truthful schedule data

Affected: student `/`; dependency shared with Group 06.

Evidence: both desktop student originals show a next lesson of `10/12/2026` beside a course dated `06/01/2026–08/31/2026`. The exact date formatting is locale-dependent, but either October or December is after August. Source confirms `user_repository.py:218` calls `compute_next_lesson_at` using weekly schedules alone; `schedule_utils.py` does not receive course date bounds and uses a naive current datetime. This is stronger evidence than a suspicious course title alone.

The roadmap already identifies date-bounded lessons as contract-dependent. Add an explicit dependency to Group 01: do not promote this datum to the primary dashboard feature until the calculation honors course/enrollment eligibility, course start/end boundaries, and an agreed school timezone.

Target hierarchy: small “Next lesson” label; a prominent localized weekday/date and start time; course title; mentor metadata; one course link. When the successful response contains no eligible future lesson, use a compact translated “No upcoming lesson scheduled” state with a course/schedule destination. Request failure gets its own retry. Neither case fabricates a time or implies attendance is required after a course ends.

Required scenarios: before course start, after course end, same-day lesson already passed, no schedules, timezone/date-boundary behavior, and multiple eligible courses. Keep this as a separate tested domain correction, not an incidental cosmetic rewrite.

The latest-period source already receives journals ordered by descending period start and filters to graded records. Preserve and test that existing interpretation; do not claim the screenshot proves an ordering defect or silently redefine “latest” as most recently edited.

### M5. Define the semantic migration for dark links and selection

Affected: sidebar, bottom navigation, auth actions, dashboard section links and shared icon controls.

Evidence: `mentor-dashboard-desktop-dark.png` and `student-dashboard-mobile-dark.png` use orange for ordinary navigation and links. Source repeatedly uses `text-maroon dark:text-accent`. Changing the `maroon` variable alone leaves those dark overrides orange.

Concrete addition: during shared-shell migration, ordinary action/link/selected-navigation foreground resolves to the theme-aware primary role in both themes. Remove explicit dark orange overrides from those roles. Reserve orange for intentional brand illustration details or a narrowly defined accent. Selected navigation uses one quiet selected surface, primary text/icon, weight, and `aria-current`; do not add a separate colored pill behind every icon. Semantic success/danger badges retain their own roles.

Dependency/risk: legacy classes are already semantic names, so a raw-color search will not detect this drift. Include a role-based review of `dark:text-accent`, `dark:bg-accent`, and foreground pairs in each touched Group 01 component. This refines the planned palette migration; it does not request a global unscoped rename.

## Useful additions after the must-fix items

### U1. Turn “compact dashboard” into measurable page hierarchy

Affected: all four `/` variants.

Evidence: on staff phone originals, the first debtor row begins around 760px, the first mentor course/journal row around 730px, and the first payment row around 800px. Student course imagery starts around 700px after identity, metrics, and next lesson. These approximate positions explain the scrolling burden; they are not measurements of a redesigned screen.

| Before | After | Why |
| --- | --- | --- |
| Separate large metric cards compete with the task section | One quiet summary group with internal spacing/dividers | Keeps context without repeating outlines, shadows, and icon tiles |
| Mentor's unavailable student count consumes a full phone metric card | Two primary metrics for courses/grading, followed by a compact explained unavailable student-count line until identity/data support resolves | Avoids promoting missing information while remaining honest |
| Student course photo dominates a small dashboard | A 64×64 thumbnail next to title and schedule, score/status below, one clear course link | Identifies the course while leaving room for the latest result |
| Phone ledger narrows amount and currency into stacked fragments | Identity and nonwrapping amount on the first row; course/method and date on subsequent full-width rows | Money stays scannable as titles grow |

Proposed geometry: retain 16px page gutters, 16px group padding, 12px internal metric gaps and 24px section gaps. Use 14/20 sentence-case metric labels and 28/36 values. Keep the baseline admin balance-full-width/counts-paired arrangement. Accountant receivable and collected amounts may use two columns only when the full decimal string and currency fit; large amounts get full-width rows without smaller text. Put debtor count in a compact supporting line if necessary.

Acceptance target at 390×844, default text size and normal seeded English content: admin shows the first attention row before approximately 520px; mentor exposes a usable journal action above the bottom navigation, including the successful-empty-queue case; accountant shows its payment action immediately and a first recent-payment row without scrolling; student shows the next-lesson action and useful course text before decorative media consumes the viewport. These are design checks, not fixed-height clipping rules. At 320px, enlarged text or longer ru/tg copy, allow natural growth and scrolling. Reuse the same skeleton geometry.

For desktop student content, settle the baseline's optional split: a larger course/lesson column plus a minimum 300px latest-result column when the **content area** has room. At the 1024px shell breakpoint, stack these sections if the 240px sidebar leaves them too narrow. Do not use viewport width alone to force two columns.

Dependency/risk: resolving mentor identity may restore the missing metric; do not permanently delete a legitimate metric to conceal an auth failure. Share the compact course-row variant with Group 06 without changing course calculations.

### U2. Remove duplicate phone notification entry points

Affected: student and accountant phone headers.

Evidence: `student-dashboard-mobile-light.png` visibly has a top notification bell and a bottom Notifications destination. The proposed role matrix would reproduce this for accountant.

Proposal: when Notifications is a primary bottom destination, place its unread badge there and omit the header bell below 1024px. Keep a single 44px theme/language trigger in the header. Retain the header bell for mentor/superadmin, where Notifications lives under More, and for desktop. This creates more space for brand/back context without making daily destinations less accessible.

Dependency/risk: use the same unread query/state across surfaces and translate capped counts/accessible names. An unread-query error must not be announced as zero unread messages. Preserve the role navigation map and its authorization tests.

### U3. Specify settings choices as readable controls and keep loaded content stable

Affected: quick settings, login utilities, all dashboard query panes.

Evidence: settings contact sheets show small sun/moon/system icons and terse language codes. The baseline already requires titled choice groups and accessible selected state. Add full language names in their own languages through locale keys, and icon-plus-text theme choices; each choice has a 44px target. At narrow widths, use stacked rows instead of compressing three translated labels into tiny segments. A language/theme change keeps the overlay open and the selected control focused.

For dashboard background refresh, retain successfully loaded rows and values while refreshing. If refresh fails, show a small section-local translated stale/update-failed message with retry; do not replace the entire pane with initial-loading skeletons or silently present stale figures as newly fetched. Initial requests still use the baseline's four states. This is especially valuable after accepting a payment: show success only from the mutation result, then make any subsequent summary-refresh failure explicit.

Dependency/risk: reuse React Query's existing state distinctions. No new state library is needed. Keep money static and decimal-based; do not animate updates.

## Baseline recommendations to remove or narrow

These are explicit proposed deletions from the baseline, subject to approval. They have not been applied to its files.

| Exact baseline recommendation | Remove or narrow | Evidence and reason | Replacement |
| --- | --- | --- | --- |
| Login: “maximum ±6px pointer translation over 200ms ease-out”; MOTION pattern 5 treats session entry as rare | Remove pointer tracking from the required first implementation; retain it only as an optional later comparison | The supplied emblem already has dimensional gradients, and the brief asks for depth, not tracking behavior. Login can recur every day. No screenshot demonstrates that pointer movement improves the form or brand. Its stated purpose of explaining the brand metaphor is weaker than the static poster itself. | Keep the 50/50 composition, layered static background, emblem and editorial text. This preserves the requested depth and removes listeners, capability branching and an extra motion test burden. |
| Shared phone header: “44px notification/settings controls on the right” for every role | Remove the header notification control for roles with a primary bottom Notifications destination | `student-dashboard-mobile-light.png` already shows two notification destinations; the role matrix would extend this duplication to accountant. | Keep the unread badge and accessible count on the bottom destination; retain header preview for mentor/superadmin and desktop. See U2. |
| Mentor dashboard: a “course/student/grading summary” including an explained unavailable student count | Remove the requirement that an unavailable student count occupies an equal metric cell | `mentor-dashboard-mobile-light.png` spends a full card on a dash. Identity/data dependencies may eventually restore the value, but an explanatory sentence still does not justify equal visual weight. | Two primary cells for courses and grading plus an explained metadata line until the actual count is supported. Restore a third value only when truthful and useful. |
| Superadmin: “Default five rows” for both attention and recent activity | Narrow the phone recent-activity preview to three rows; keep five attention rows and the desktop activity limit | `superadmin-dashboard-mobile-light.png` is dominated by two long stacked lists. The attention list leads to work, while activity is secondary context. Human-readable text will shorten it but five rows still need not be the universal minimum. | Three latest activity rows on phones with an explicit “View all activity” destination; do not change API audit retention or collapse distinct events. |

Do not remove the baseline's explicit unavailable/error states, clear-space requirement, locale work, reduced-motion behavior, safe-area reservation or hardware verification as “unnecessary.” Those prevent concrete failures. Likewise, a large blank desktop area is not a reason to add charts or additional dashboard panels.

## Worthwhile additions, separated by scope

| Addition | Scope and useful behavior | Dependency / acceptance |
| --- | --- | --- |
| A visible keyboard skip-to-content link and deliberate page-heading focus | Design/accessibility behavior within the existing shell. Let a keyboard user bypass the 240px sidebar and repeated header on every route. Give the student dashboard a real H1 without inserting a large extra banner above its identity row. | No backend work. Source currently renders the student's name as H2 and has no skip link in `AppLayout.tsx`. Verify the link is visible on focus, targets main content, and route changes do not steal focus from an open form. |
| A useful route context after removing the dead desktop search | Interface structure: use a quiet current-section label or breadcrumb at the header's left and utilities at right. On dashboards, show the localized Home section rather than repeating the full role H1. On detail routes, keep the parent destination available. | No global-search capability or endpoint. Reuse the existing route/access map and translated names; coordinate detail-route labels with the other groups. Do not populate it with additional KPI chips. |
| Context-preserving attention-to-finance navigation | Frontend capability, beyond a visual row change. Activating a debtor attention item should carry its permitted student/course filter to Finance so the user sees the relevant balance immediately. | First inspect the existing Finance route/filter and API contracts. Use supported filters; if the API cannot represent the context, make that a separate backend task. Acceptance: selected context remains visible and clearable, refresh/back preserve it, and no accountant-only or superadmin-only data leaks across role boundaries. Do not add this silently to the cosmetic shell task. |
| Optional “Add lesson to calendar” from the student's validated next-lesson card | New user-facing capability worth considering after schedule correctness. A single secondary action could export that lesson's course, actual start/end and timezone to a calendar file. Keep it out of the primary sign-in or dashboard action hierarchy. | Requires M4, a reliable lesson duration/end time and timezone contract, translated event text and file-generation tests. No connected calendar account or message sending is implied. If duration or eligibility is unavailable, defer the feature instead of guessing. This is an optional separately authorized feature, not a prerequisite for the redesign. |

M1–M3, M5 and U1–U3 primarily change presentation or existing interaction behavior. M4 is a domain/backend correctness dependency already foreshadowed by the roadmap. The last two additions above extend navigation or product capability and require separately scoped acceptance; they must not be bundled invisibly into the visual change.

## Motion audit: retain the small budget and tighten its behavior

The baseline already contains the right opportunities. No sixth effect is justified. Static screenshots cannot establish animation quality; the following are specifications for later interaction verification.

| Location | Today / baseline gap | Purpose | Frequency | Proposed exact behavior and gate |
| --- | --- | --- | --- | --- |
| More, settings, notification surfaces | Geometry fixes are planned; modality-specific origins and interruption need definition | Spatial consistency; avoid a jarring appearance | Occasional | Pointer/touch opening: opacity 0→1 and scale .96→1, 200ms ease-out. Desktop popover originates at trigger; bottom-positioned phone dialog originates bottom-center. Exit reverses the same path. CSS transition or existing entry keyframe only. Budget and function pass because underlying data stays still. |
| Shared buttons and icon controls | Several current controls have inconsistent small targets and active scales | Feedback | Tens/day | Transform 1→.96 on press, 150ms ease-out; no click delay; disabled remains 1. Only the small control scales, never a table row or whole dashboard panel. Frequency passes for minimal immediate feedback. |
| Auth illustration background | Requested depth has no implemented evidence | Brand expression, not instructional explanation | Occasional session entry | Static layered composition first. Optional pointer displacement capped at ±6px over 200ms ease-out on fine hover pointers; reset on pointer leave. The mark and text remain still. Keep only if a later rendered comparison materially benefits; returning users are not a first-time audience. |

All nonessential transforms/opacity use `motion-safe:`. Reduced-motion presents the same surfaces immediately. Keyboard activation, Escape, focus jumps and route selection remain immediate; do not delay focus until an entrance finishes. Close/reopen during the 200ms interval must not create an invisible blocker, duplicate surface, or stale focus trap. No fixed dismissal timeout that retains modality after the user has left.

Rejected candidates:

- KPI hover lift/count-up: rejected by function; money and grades are information to read.
- Whole-dashboard card stagger: rejected by frequency; repeat visits should expose tasks immediately.
- Sliding active bottom-tab indicator or route fade: rejected by frequency and keyboard use.
- Continuously floating/rotating logo: rejected by brand protection, distraction, and function.
- Theme crossfade over the entire page: rejected because it adds movement while users inspect changed contrast; selection feedback is sufficient.

The largest motion benefit remains predictable overlay appearance and immediate press feedback. The login's static art direction matters more than parallax.

## Implementation handoff and verification additions

Suggested approval order: M1–M2 during brand/shared controls; M3 and M5 during shell; M4 as an explicit domain dependency before student dashboard emphasis; U1 during dashboard composition; U2–U3 where approved. Preserve the existing auth-identity prerequisite for self-profile navigation.

No new library is required by this review. `package.json` already contains React Query, Zustand, React Hook Form, Zod and Lucide; keep those. The baseline's conditional accessible-primitives recommendation can be evaluated once in shared controls. Do not add Motion, NumberFlow, a gesture engine, a WebGL renderer, or a chart package for these pages.

Beyond the baseline checks, add direct regression cases for essential field contrast pairs, logo clear-space geometry, overflow with long labels/amounts, one active overlay, overlay close on navigation/breakpoint change, focus return, keyboard-immediate surface use, background refresh failure, schedule bounds/timezone, and role-specific notification entry points. Capture the missing desktop-open surfaces and legitimate set-password/nonempty notification/grading states when appropriate fixtures exist. Physical-phone verification remains a separate unmet gate.

This review performed document/source inspection, image viewing, and arithmetic contrast checks only. It did not run application tests, claim implementation completion, edit brand assets, capture the live application, or commit changes.
