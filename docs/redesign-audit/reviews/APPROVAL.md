# Selected design recommendations for approval

Status: historical selection, now authorized for planning revision. The user subsequently requested that the same six original reviewers incorporate all their recommendations into their own group plans. This authorization supersedes the earlier request to await approval and the narrower root selection below. All six original reviewers have revised their plans; shared contracts are synchronized and application implementation has not started. Deferred recommendations remain explicitly deferred.

The selection favors a calmer interface, faster access to existing work and specifications another AI can implement precisely. It excludes redundant baseline requirements and speculative feature expansion. Approval here authorizes revision of the planning documents; it does not declare implementation or tests complete.

## Shared direction to retain

Keep KITOB navy `#083D91`, blue `#0E6BB8`, orange `#F58220`, white and the proposed semantic light/dark surfaces. Primary actions and navigation use theme-aware primary tokens; orange is a limited brand accent. Replace legacy `dark:text-accent` overrides where they turn ordinary links orange. Keep actual artwork upright, proportional and unmodified, with measured visible-art sizing and poster-required clear space. Asset edge defects must be checked at actual rendered sizes; no glow/filter workaround.

Keep desktop authentication 50/50, form left and emblem/editorial composition right. Retain the user's requested restrained WebGL-like motion: static layered composition first, optional motion-safe background displacement up to ±6px over 200ms on a fine pointer; emblem/text stay still, touch/reduced-motion get the static composition. The Group 01 suggestion to remove required pointer tracking is useful restraint, but removing all login motion would conflict with the requested direction. No actual WebGL or motion dependency is justified yet.

Keep CSS-only 150ms interactive feedback, 200ms occasional surfaces, press .96 and scoped motion-safe. Grade editing, route changes, counts, money, charts and tab content update immediately. Keep translations, four data states, privacy/role rules, shared formatters, decimal-string money and physical-device verification.

## Recommended additions to each group plan

### 01 — Authentication, dashboards and navigation

Source: [independent review](GROUP-01.md).

**01-A — Explicit authentication/brand geometry.** At 1024px+ use equal flexible columns; left form max 400px with 32px minimum side padding, aligned logo/form edges and separate utility row. Right text max 440px; visible emblem art approximately 240–320px according to available width; 32px artwork-to-heading and 12px heading-to-copy. Two broad background shapes at most. Short screens scroll naturally. Measure visible artwork rather than transparent image canvas; reserve poster-defined K-height clear space. Phone uses compact brand/utilities followed by the form.

**01-B — Strong field boundaries, quiet panel dividers.** Add a distinct semantic control-border role rather than darkening every card border. Candidate light `#7C8EA7` and dark `#748CA9` give calculated 3.34:1/4.64:1 against proposed card surfaces; recheck all actual adjacent surfaces. Existing structural borders give only 1.30:1/1.62:1 there. The boundary requirement applies where it identifies the control, as explained by [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). This is a proposed token change, not a completed accessibility claim.

**01-C — One coordinated overlay lifecycle.** Only one shell surface open at once. Explicit activation, focus containment where modal, Escape/outside dismissal, focus return, close-on-navigation and breakpoint cleanup. Phone shell dialogs: width no more than 360px, 16px side clearance, safe-area-aware bottom positioning, separate title/close and scrollable content. Desktop uses collision-aware trigger popovers. Shared owner controls scroll locks and stacking; hidden triggers cannot retain a focus trap. Add skip-to-content and route-heading focus behavior.

**01-D — Measurable dashboard hierarchy.** One quiet summary group rather than independent metric cards. At ordinary 390×844 seeded content, a useful row/action should appear before bottom navigation; allow long translations and text enlargement to grow naturally. Use smaller course thumbnails, static amounts and preserved content on background refetch. Show refresh failure locally instead of erasing loaded figures. A mentor's unavailable student count becomes supporting text, not an equal metric tile.

### 02 — Staff courses and course detail

Source: [independent review](GROUP-02.md).

**02-A — Settle the detail composition and content ownership.** Phone: Back, title/admin menu, status, mentor/date metadata, price, Open journal, Overview/Students/Progress. Omit phone hero/thumbnail. Overview owns schedule/description; Students owns enrollment/price/status; Progress owns course-scoped grades. No repeated description/grade blocks. Neutral desktop progress table: identity 220–260px, period columns at least 104px, summary at least 112px, rows at least 52px; local scroll rather than clipped columns. Phone initially uses one period selector and readable student-score rows.

**02-B — Enrollment is an explicit two-step commitment.** Candidate tap selects one student; only Enroll submits. Selected identity and read-only terms remain visible, with Change student, Cancel and inline recovery. Phone form has header / one scrolling body / footer; safe-area/keyboard behavior is verified on hardware. Page-one excluded results cannot establish no eligible students. After success expose the new roster row without silently jumping or losing search context.

**02-C — Create and edit have different fields.** Create includes price/exam/schedule. Edit presents immutable course terms as read-only text with explanation, exposing only fields supported by PATCH. Form errors focus/reveal the invalid field; pending state prevents duplicate submission; dirty dismissal has a consistent decision. Move optional image after required fields.

**02-D — Preserve work context and provide a direct journal shortcut.** Keep course list query/scroll, detail tab, selected progress period and roster position across authorized destinations. Assigned-course rows can offer a separate secondary Open journal link for mentors. Lazy-load secondary progress/history where possible; do not hide existing per-student profile fan-out merely by moving markup into tabs.

### 03 — People, profiles, forms and documents

Source: [independent review](GROUP-03.md).

**03-A — Exact phone/tablet identity structure.** Directories below 1024px use divided rows: 40px avatar, flexible identity, 44px menu, 12px gaps; wrapping 16px/24px name, one secondary contact and role-appropriate metadata. Teachers do not inherit student Payment day. Profiles use compact identity/contact, one summary strip and shared Courses/Performance/Documents tabs. At ordinary 390×844, selected tab and first course title should appear before bottom navigation; no fixed-height clipping. Secondary birth date/account details leave the above-tab header.

**03-B — Put admin Edit in context and restore navigation.** Secondary Edit on admin profile opens the same authorized form; phone uses the profile menu. Preserve directory page/query/scroll and selected profile tab. Names, phone and email remain independent real links, with role-aware Back destinations. Self-profile guard correction remains a separate prerequisite already identified by the baseline.

**03-C — Clarify persistence and dismissal.** Phone names use one column. Header/footer surround one scroll body. Parent footer observes actual mutation pending state. Dirty fields get explicit discard/keep behavior and stable inline errors. Photo upload is independently saved today: explain that immediately, show local status, and make Cancel discard only unsaved identity fields. A transactional photo+profile workflow is additional scope, not implied.

**03-D — Contract-aligned document upload.** Current client guidance/20 MiB cap disagrees with backend support/50 MiB cap. Resolve allowed types/size through the actual contract, then give translated pre-selection help, filename, genuine pending/progress and persistent retry. Do not advertise unsupported DOC/ZIP. Loaded phone file rows preserve filename/extension and separate 44px Download/menu controls. Keep document byte-access review separate from appearance work.

### 04 — Journals and grading

Source: [independent review](GROUP-04.md).

**04-A — One clear phone grading path.** Back/course → period/date/settings → Gradebook/Progress → Lesson/Summary → previous/date/next → reserved save state → divided student rows. Name first, then labeled attendance, score and comment actions; wrap at 320px. Only useful lesson/save context may be sticky. Deterministic lesson selection, valid URL state and preserved focus prevent wrong-lesson edits. At normal 390×844 at least one complete editable row should be reachable in the initial screen.

**04-B — Consistent edits and one autosave owner.** Keyboard, checkbox and phone use one established attendance/score command. Modes share the journal's draft queue rather than remounting it. Navigation drain reports success/failure/conflict reliably; Saved never appears while work/conflicts remain. Preserve sent/local/server snapshots so Keep mine uses actual local values. Handle confirmed successes independently from failed summary operations. These are separate reliability changes with regression tests, not cosmetic shortcuts.

**04-C — Deliberate exam/bonus editing and useful explanation.** One student-period editor owns both fields with Apply/Cancel, valid ranges and actual version; no paired-field overwrite on blur. Period settings drain pending work first. Summary has a short calculation disclosure. Add search scoped to the selected roster; filtered-out rows retain pending edits. Student breakdown opens in place, with a separate authorized profile link.

### 05 — Finance and audit

Source: [independent review](GROUP-05.md).

**05-A — Explain the actual accounting context.** Debtor previews represent course balances, showing student and course; do not imply unique student totals when a student has two enrollments. Due unpaid leads. Replace misleading Amount paid with settlement terminology in details because allocations can include discounts/credit. Current balance metrics are separate from date-scoped net cash collection; latest transactions state their own range.

**05-B — Clear allocation and successful-payment handoff.** Explain that the selected course is allocation priority and surplus may settle other charges. Phone amount/date are full-width rows. One compact footer summary replaces a repeated large total box. After submission show the returned reference and View payment with actual allocation/status detail; a receipt fetch failure retries the fetch, never the payment. Preserve originating debtor filters.

**05-C — Human-readable, honest audit records.** One field-change record stays one record; no invented business-event grouping by timestamp. Field/value leads, actor/time/entity supports. Two readable phone lines and full detail values; Before/After stacked on phone, null/empty/zero distinct, technical data collapsed. Use one shared roughly 560px desktop inspector/full-height phone surface, not competing drawer/dialog alternatives.

### 06 — Student learning, settings and notifications

Source: [independent review](GROUP-06.md).

**06-A — Learning destination first, comparisons second.** Compact course rows and one destination. Course detail puts Periods immediately after identity/schedule context, latest eligible period emphasized within that list; metrics/trend secondary. Period result leads with points/max, then four aligned contributions and labeled homework/attendance rows. Add a concise calculation disclosure. Rank/class averages stay secondary until their population/tie semantics are confirmed. Charts cannot clip valid bonus above 100%.

**06-B — Separate account persistence boundaries.** Profile fields → Save profile/local status → Appearance. Photo upload and language/theme show independent immediate-application feedback. One-column phone fields, readable language names and Light/Dark/System choices. Dirty profile gets Discard changes; preserved draft/refetch behavior is explicit. Clearing optional phone must deliberately use the contract's accepted representation.

**06-C — Personal inbox, not a delivery console.** Event meaning, event date, unread state and row-local Mark read/retry. Distinguish date-only event from sent timestamp. Do not expose raw error strings: source overloads `error_message` with successful score markers and exception text. Empty inbox omits technical table/filter toolbar. Preserve chronological paging; restore global search only with a supported server capability. No auto-mark or bulk read feature.

## Recommended removals or deferrals

| Group | Remove/narrow from baseline | What remains |
| --- | --- | --- |
| 01 | Duplicate phone bell when Notifications is already a bottom destination; equal unavailable mentor-count tile; five-row phone secondary activity requirement | One notification destination; truthful count context; three phone activity rows plus View all; five attention rows if useful |
| 02 | Mandatory three-metric course-list strip; optional heatmap; phone grid toggle and initial Compare periods mode; speculative dated-next-lesson display | Count/status controls, compact rows, neutral desktop comparison, selected-period phone scores, actual weekly schedule |
| 03 | Optional contact row expansion; paired phone names; mandatory full-width desktop search; directory-only admin Edit detour; unconditional Cancel-undoes-all claim | Stable rows/profile details; one-column forms; bounded desktop search; contextual Edit; explicit independently saved photo |
| 04 | Optional phone Table mode; analytics strip before grading; repeated score-picker animation; ambiguous profile-or-breakdown click; row/grid hub alternatives | Lesson/Summary, secondary Progress, immediate score picker, in-place breakdown, one journal-row system |
| 05 | Optional aging-summary block without a defined task; debtor avatars lacking data; repeated total box/discount advice in payment-only flow; hard one-line audit clamp | Due/course identity, overdue filter, compact payment summary, readable audit values/details |
| 06 | Required sparse course grid; duplicate latest-period link; score tracks by default; equal-priority rank; permanent unverified integration card; page-local personal-inbox search/filters; raw technical errors | Compact courses, clear period destination, numeric result explanation, secondary comparison, honest rules help, paginated personal events |

These cuts are proposals for approval, not deletions already performed. Physical-device checks, reduced motion, locale parity, permissions, error/retry states and proper metric definitions are required quality work and remain.

## Valuable feature improvements worth including

All are bounded existing-capability improvements with explicit behavior above: contextual admin Edit; direct mentor Open journal; preserved list/tab/lesson return context; selected-roster student search; understandable score calculation; document-selection/retry feedback; View payment after success; profile Discard changes; row-local mark-read recovery; skip-to-content. They add usefulness without requiring a new dashboard, activity feed or integration.

## Separate correctness/contract tasks

Retain already identified identity and course-date/timezone fixes. In addition, explicitly track: course versus profile average/denominator differences; true zero versus missing versus ungraded domain signal; rank ties/population; journal canonical edit and autosave/conflict/summary reliability; document-upload contract mismatch and authorized file-byte delivery; finance settlement/allocation/precision semantics; sanitized notification fields if any technical detail is exposed. Source inspection identifies dependencies, not verified runtime failures or permission to redefine business policy. Implement them as separate tested work packages/commits where necessary.

Global directory/inbox/audit search, joined roster/payment identities or server-side eligible candidates can be separately approved where incomplete results otherwise mislead. No N+1 enrichment, guessed rank, invented dates, modified scoring policy or timestamp-based audit grouping.

## Suggestions not selected for the first redesign

Defer calendar export, favorites, bulk enrollment/attendance/messaging, contact export, swipe actions, offline drafts, document previews, new webhook controls, exact allocation preview, historical ledger snapshots and audit-event grouping. Each adds data/workflow obligations not justified by the captured interface problems. Do not add charts, extra metrics, brand illustrations or a new UI package to fill sparse screens. Removing all requested auth motion is also not selected; retain the restrained brief with static fallback.

## How approved recommendations will enter the plans

For each approved group, rewrite the affected page sections coherently: exact desktop/phone content order, component dimensions and breakpoints, token/style roles, action placement, query/loading/error/empty ownership, navigation state, persistence/dismissal rules, motion, authorization, backend dependencies and regression acceptance. Remove conflicting alternatives rather than append reviewer notes to the end. Update shared tokens/motion/roadmap only for approved cross-group decisions. Keep original evidence and uncaptured-state limits intact.

The user authorized all six reviewers to update their group plans with all their recommendations, including named removals and explicit feature/dependency boundaries. The coherent revised group plans and synchronized shared contracts are the implementation handoff; this document preserves the earlier selection rationale. This is authorization to revise plans, not evidence that any application feature is implemented.
