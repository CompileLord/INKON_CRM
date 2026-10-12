# Group 03 independent design review

Status: recommendations for curation and user approval. The baseline plan, application, captures, tokens and task statuses are unchanged. No implementation or runtime security verification was performed.

## Evidence and limits

Reviewed the Group 03 plan, audit README, root token contract, motion contract and implementation roadmap; all 13 group contact PNGs and both self-profile recheck contact PNGs; and original-size captures listed below. Applied the requested mobile-native, emil-design-eng, find-animation-opportunities and pick-ui-library skills, with project timing, token and dependency rules taking precedence. Read the installed dependency list and relevant profile, directory, form, drawer, avatar and document code.

The evidence remains **44 accepted captures and 16 rejected self-profile redirect diagnostics**. Both sets of mentor-self/student-self contact sheets display dashboards at `/`; they provide no evidence about the intended self-profile layout. Read-only source findings are identified separately below. Loaded document rows, form errors, edit/avatar surfaces and hardware keyboard behavior remain uncaptured. A full-page capture showing content below a fixed drawer is not proof that the background can be scrolled interactively.

Brand references inspected: `/home/compilelord/Downloads/KITOB Brand Guidelines Poster.png`, full logo `ChatGPT Image Oct 8, 2026, 05_14_59 PM-1.png`, and emblem `ChatGPT Image Oct 8, 2026, 05_14_59 PM-2.png`. The poster supports navy/blue structure, white space and restrained orange accents. The colorful artwork supplies enough personality; person pages need no additional logo illustrations. Raster edge cleanup and small-size rendering belong to Group 01 asset verification, not this group.

All screenshot paths below are relative to `docs/redesign-audit/group-03-people/`. Original files opened independently of contact sheets:

- `screenshots/superadmin-students-desktop-light.png`
- `screenshots/superadmin-mentors-mobile-dark.png`
- `screenshots/superadmin-student-profile-mobile-light.png`
- `screenshots/superadmin-student-performance-desktop-dark.png`
- `screenshots/superadmin-mentor-profile-mobile-light.png`
- `screenshots/superadmin-mentor-documents-mobile-dark.png`
- `screenshots/superadmin-create-student-desktop-light.png`
- `screenshots/superadmin-create-mentor-desktop-dark.png`
- `screenshots/superadmin-create-mentor-mobile-light.png`
- `screenshots/mentor-student-profile-desktop-light.png`
- `self-profiles/screenshots/mentor-mentor-profile-desktop-light.png` — rejected diagnostic.
- `self-profiles/screenshots/student-student-profile-mobile-dark.png` — rejected diagnostic.

## Keep the baseline decisions

The plan already correctly specifies divided phone rows, a single action menu, compact profile metrics, merged mentor Performance/Analytics, role-aware navigation, honest absent grades, scoped aggregates, independent tab states, both themes, shared formatters, three locales, dirty-field PATCH, document permissions and CSS-only restrained motion. These should not be presented as new review discoveries. The useful additions are concrete geometry, state continuity, persistence boundaries and contract details that stop different implementers from interpreting those intentions differently.

| Before: observed baseline | After: recommended refinement | Why |
| --- | --- | --- |
| Student first course begins around y=855 in the 390px original; three standalone metrics precede the tabs | One compact identity region and a shared summary strip, with an explicit first-content acceptance target | “Compact” alone does not guarantee that the actual learning content reaches the first screen |
| Mentor Documents tab extends beyond the phone page edge; student and mentor tabs use different visual treatments | One shared locally scrollable tab pattern with readable labels and bounded width | Merging tabs alone will not guarantee that Russian and Tajik fit |
| Mentor directory spends a column on empty Payment day, while a person's name truncates | Role-specific row schema, predictable phone metadata and a defined tablet breakpoint | Prevents generic person components from retaining student-only data |
| Create form is visually open and simple, but its footer is detached from mutation state in source | Explicit save, dismissal, error and independent-photo persistence behavior | A calm form must also make its commitment boundary clear |
| Empty Documents panels show upload entry but no visible accepted formats or size | Contract-aligned upload help and persistent per-file result | Avoids asking staff to discover permitted files through failed attempts |

## Must fix in the implementation specification

### M1 — Give the compact profile an exact responsive structure

**Surfaces/evidence:** student and mentor profiles; `superadmin-student-profile-contact.png`, `superadmin-mentor-profile-contact.png`, `mentor-student-profile-contact.png`; original mobile student and mentor files above. The phone avatar occupies its own line, then three 100px-plus metric cards push Courses below the initial viewport. Mentor tab overflow is visible in the original Documents image.

**Addition:** after Group 01 removes the phone rail, use the full content width with 16px gutters. Place a 48px avatar beside the wrapping name in a `48px / minmax(0,1fr)` grid; place contact rows underneath across the full width. Use a single `bg-strip` summary container with three equal `minmax(0,1fr)` cells, 12px inset, 8px gaps, 24px/32px values and sentence-case wrapping labels. No separate card around each statistic. At 320px or enlarged text, allow label/row growth rather than truncation or a fixed height.

Use one shared three-tab component: 44px minimum target height, intrinsic readable label widths, local horizontal scrolling only when necessary, and no horizontal page overflow. Keep active/focused tabs in view immediately; arrow keys change focus and Enter/Space activates if panel loading is asynchronous. Do not shrink type to fit. Use the same selected treatment for students and mentors.

For seeded 390×844 profiles at default text size, require the selected tab and at least the first course title to appear above the bottom navigation without scrolling. At 320px and 200% text size, prioritize intact content and controls over this vertical target. On desktop, retain the horizontal identity and shallow summary; do not enlarge isolated metrics merely to fill available width.

**Dependency/risk:** Group 01 shell and tabs; Group 02 course rows. Long translations may increase height legitimately. This is an acceptance target for the seeded baseline, not a fixed-height constraint on personal data.

### M2 — Resolve directory density at tablet width and choose the phone metadata

**Surfaces/evidence:** `/students`, `/mentors`; `superadmin-students-contact.png`, `superadmin-mentors-contact.png`, original desktop Students and dark mobile Teachers. Names lose space to two independent icons; Teachers exposes an irrelevant empty Payment day field.

**Addition:** use divided phone/tablet rows below 1024px; reserve the full table for 1024px and above, matching the shared shell breakpoint. At 1024px, make registration date secondary metadata under identity if the full column set cannot fit; do not force a six-column table into the remaining sidebar-adjusted width. At 1440px retain the baseline columns. Confirm no page-wide scroll at 768px and 1024px.

Phone row layout: 40px avatar, flexible identity, 44px menu, 12px column gaps; 16px/24px wrapping name; one 14px secondary contact; a full-width metadata line below. Students show account status plus labeled monthly payment day; Teachers show account status and omit payment day entirely. Registration date and parent contact are available on the profile, not repeated by default on every phone row. Keep the person name as a real link and phone as a separate `tel:` link; their activation must not open the row menu or each other. Use an accessible name such as translated “Actions for {{name}}” for the menu.

**Dependency/risk:** shared menu, role-specific row definitions, existing list contract only. Preserve a genuinely different account-status meaning from active enrollment/course status. Avoid adding profile queries for counters or secondary row data.

### M3 — Specify form dismissal and actual persistence, especially avatars

**Surfaces/evidence:** creation drawers; both create contact sheets and original form files. Source: `StudentFormPanel.tsx`, `MentorFormPanel.tsx`, `SlideOver.tsx`, `AvatarUploadField.tsx`. The student footer's Submit is outside the mutation-owning child and is not disabled by its pending state. Avatar selection starts a separate upload immediately in edit mode. These are source observations, not captured interaction results.

**Addition:** all fields use one column on phones, including first/last names; names and phone/date may pair only at wider drawer widths. Use semantic sections Identity, Contacts and student Payment details, separated by spacing rather than nested cards. Put optional notification identifiers after ordinary contact fields, with translated purpose and optionality; do not call a Telegram identifier a connection confirmation. Keep the footer and header outside one scrolling body, using shared dynamic-viewport and safe-area behavior.

Connect footer state to the actual mutation: prevent duplicate submission, reserve the button width, show Saving, set `aria-busy`, and keep server errors in the form. Associate labels/help/errors with inputs; on failure reveal and focus the first invalid field without smooth scrolling. On phone open, focus the dialog heading so the keyboard does not immediately hide context; keyboard users can tab into fields.

Define close behavior once for X, backdrop, Escape and footer: pristine forms close; dirty identity fields ask Discard changes or Keep editing; an in-flight save must not be described as cancelled by dismissing the surface. Reuse one shared discard confirmation and restore focus to the original trigger.

**Critical avatar distinction:** preserve the current independent upload only with explicit copy adjacent to the control: photo changes save immediately, separately from the form. Show its own Uploading/Saved/Error state. Once a photo succeeds, Cancel discards unsaved identity fields only; it cannot promise to undo that photo. Create mode has no upload until an account ID exists. If the desired product behavior is instead “Cancel undoes everything,” that is a changed staged-upload workflow and needs its own implementation scope. The baseline's “cancel with no write” acceptance must be limited accordingly.

**Dependency/risk:** shared dialog lifecycle and existing React Hook Form state. Pending dismissal and upload abort are asynchronous behaviors; test double submit, dirty close, rejected save, photo success followed by Cancel, and profile switching. Keyboard, footer reachability and safe areas require physical-phone verification.

### M4 — Align document upload guidance with the actual contract

**Surfaces/evidence:** Documents in both profiles; `superadmin-student-documents-contact.png`, `superadmin-mentor-documents-contact.png`. Only empty states are visually observed. Source: `DocumentsTab.tsx` advertises `.pdf,.doc,.docx,.jpg,.jpeg,.png,.zip` and rejects files over 20 MiB; `backend/app/services/document_service.py` limits to 50 MiB and accepts audio/images/PDF/DOCX/text MIME families. Legacy DOC and ZIP are not accepted by that service.

**Addition:** resolve the frontend/backend mismatch before writing final help text. With the current backend as source of truth, make the picker, client checks and translated help agree on supported types and the 50×1024×1024 byte limit; do not advertise DOC or ZIP. Confirm the exact supported subtypes through contract tests rather than promising every extension within a MIME family. A stricter client limit would need an explicit product rule, not accidental inherited copy.

Place concise format/size help below Upload, visible before selection. After selection show the filename, operation state and a persistent inline failure with Retry/reselect; a three-second toast alone is insufficient. Keep the owner name visible in the upload context. Clear the file input after client rejection as well as after a request so the same file can be selected again. Use real measured progress only when available; otherwise label Uploading without a fabricated percentage.

For future loaded-state verification, use one phone row per file: type icon, wrapping basename with visible extension, metadata below, and a separate action line when 44px Download/menu targets would squeeze the filename. Keep Download explicit rather than making the whole file row imply a preview. Distinguish fetching failures from an empty attachment list; if the last item of a document page is deleted, return to the last valid page.

**Dependency/risk:** upload-contract agreement and real loaded-row captures remain required. File support is a behavior change with tests, not merely improved empty-state copy.

## Useful refinements

**U1 — Preserve the person's place in the workflow.** Source in `Students.tsx` stores search/page/page-size only in component state; profile navigation unmounts that directory. The baseline already fixes permitted Back destinations, but does not specify state restoration. Preserve filters and page in route/search state and restore the prior row/scroll on Back; maintain one search history entry while typing. For mentor return context, carry only validated internal course/journal routes. Preserve the selected profile tab across an authorized return from a course. Do not place contact values, credentials or sensitive search text into a new durable store by default. Test page 2 → profile → Back, including browser Back and a deleted row fallback.

**U2 — Make the brand hierarchy calmer at the component level.** Evidence: orange Add buttons compete with phone content; the dark profile shows pale blue parent-contact and pale colored performance-icon tiles. Specify primary-token Add/Save/Upload buttons, ordinary `text-ink` monetary values, primary-token navigational links, and semantic status pairs. Parent contact is labeled contact information, not an info-alert chip. Initials can use a consistent quiet `bg-beige`/`text-ink` pair instead of a rainbow that may suggest categories. Keep orange for a limited brand accent, not all important numbers or every dark-theme link. The baseline already requires token migration; this addition assigns concrete meaning to each surface.

**U3 — Keep metric definitions visible rather than hidden in hover help.** Evidence: Performance repeats 98.0/0/40, and mentor Analytics repeats 2/71.2/17 under changed labels. The baseline correctly removes redundancy. Add one short translated basis line beside/below each distinct aggregate in Performance: measured population and counted period/lesson basis as supplied by the contract. Use a text explanation instead of inventing a chart when the only available data is a scalar. Do not invent a time filter for endpoints that do not support it. Seeded figures alone do not prove aggregate correctness.

## Separate privacy/contract dependency

**P1 — Document file-byte access needs its own review.** Listing permissions are covered in the baseline, but source shows `DocumentsTab.tsx` opening `file_path` directly, `LocalStorageService.save` producing `/storage/...` paths, and `backend/app/main.py:70` mounting that directory through `StaticFiles`. This is an observed source architecture risk: guarded list access alone does not establish authorization for downloading the bytes. No unauthenticated request was attempted, no private attachment was fetched, and no deployed exploit is claimed.

Track a separate backend/storage task to define authorized document delivery and verify anonymous/cross-user download behavior. The UI should use the resulting authorized download contract and preserve existing role rules; do not quietly change mentor-wide document policy in a visual component. Do not present a privacy guarantee merely because Upload/Delete controls are hidden. Keep this dependency separate from layout approval and from the auth identity fix required to capture self-profiles.

The existing credential disclosure also needs its own containment details: masked by default, 44px explicit reveal control, reset to masked when closed or when the profile changes, and no copy/export expansion in this redesign. Backend credential storage or invitation replacement remains outside the visual task.

## Motion and dependency recommendation

No new motion pattern or library is justified for people pages. Installed React Hook Form, Zod, React Query and the existing toast cover this work. Reuse the Group 01 dialog/menu primitive decision; Base UI remains that shared decision, not an additional Group 03 package request. Static screenshots cannot establish timing quality.

| Location | Today | Purpose/frequency | Exact permitted treatment |
| --- | --- | --- | --- |
| New row menu; existing form/confirmation surfaces | Tiny inline actions or existing drawer transition without the planned shared lifecycle | Spatial consistency; occasional | Reuse shared surface opacity 0→1 and scale .96→1, 200ms ease-out, trigger origin for menus and shared dialog origin for forms; symmetric close, `motion-safe:` only |
| Menu, download, upload and dismiss controls | Inconsistent press feedback in inspected source | Feedback; tens per day | `motion-safe:active:scale-[0.96]`, transform transition 150ms ease-out; disabled controls do not scale; focus/navigation takes effect immediately |

Reject metric count-ups and animated progress charts: frequent reading, no explanatory value. Reject tab-panel slides and animated underline travel: repeated navigation should remain immediate. Reject row stagger, hover lift and swipe-to-delete: they add movement or hidden gestures to ordinary directory work. Reject upload-progress `transition-all`/animated width: use direct progress updates, or a motion-safe transform-only fill if needed within the 150ms budget. No springs, carousel or separate gesture system.

The highest-value motion work remains the shared surface lifecycle and small press feedback, after the layout and persistence rules are correct. These recipes can be handed to the implementing agent with the existing MOTION.md contract.

## Baseline recommendations to remove or narrow

These are proposed changes to the baseline specification, not changes already applied. Most of the baseline is useful; removing its privacy, four-state, locale or verification requirements would not simplify the product responsibly.

| Exact baseline recommendation | Remove/narrow and why | Replacement | Scope |
| --- | --- | --- | --- |
| Students desktop: “A full-width search bar and compact page-size selector sit above a table.” | Remove the full-width requirement on desktop. It gives one query a very long empty field and separates related controls without improving search capability. | Search fills available phone width; desktop search is approximately 360–480px, flexible at smaller widths, with page size nearby and Add aligned right. Keep the full table width. | Design only; existing server search |
| Phone directory: “Reveal additional contact metadata on profile or expansion” | Remove the optional row expansion branch. Every identity already links to a profile, and an unspecified expansion creates another state, focus order and scroll-height change for low-priority metadata. | One stable row with primary contact/status/payment day; complete authorized contact details on the profile. Add expansion later only for a demonstrated task that must stay in the list. | Design simplification |
| Forms: “Phone uses one column except short paired names where 320px still works” | Remove the paired-name exception. Names are not reliably short, and two fields create little horizontal room for Tajik/Russian labels and validation. | One phone column for all personal-name fields; pair only in wider drawers. | Design only |
| Shared student header: “labeled parent contact and birth date where available” | Narrow automatic above-tab birth-date display. It is lower-priority personal information for a learning overview and consumes first-screen space even when not needed for the current task. | Keep student/parent contact directly readable; place an available birth date in secondary Details, expanded during an admin edit and reachable for roles already permitted to see it. Do not change backend permissions. | Information hierarchy; requires role review, not new data |
| Acceptance: “cancel with no write” alongside “Avatar upload status is independent of saving identity” | Remove the unconditional claim: it conflicts with the source's immediate, independently persisted avatar upload. | Test that Cancel causes no identity write and that a previously saved photo is clearly reported as retained. Stage photos only if a separately approved workflow makes all changes transactional. | Existing-workflow clarification; staging would be additional scope |
| Mentor profile: “Superadmin … sees allowed management actions through the directory” | Remove the directory detour as the only management entry point. Staff inspecting a contact error should not need to find the same person again in a list to fix it. | Provide a secondary Edit action on the admin profile that opens the same authorized form for this person; keep Delete in the menu and preserve its impact confirmation. | Existing capability surfaced in context |

The metric strip, merged Performance tab, independent retry states, real links and permission-aware Back links should remain. They directly address observed defects and are not unnecessary polish.

## Valuable features and structure updates

| Addition/improvement | Concrete behavior and interface | Evidence and value | Dependency boundary |
| --- | --- | --- | --- |
| Contextual admin Edit | Secondary 44px Edit beside the desktop identity; inside a 44px profile menu on phone. Reuse the directory form, refetch profile after success, retain the selected tab. Show no edit control or mutation query for student/mentor views. | Both profile originals show identity/contact information but require a directory detour for corrections. Reduces repeated searching during a common admin task. | Existing endpoint/UI workflow; no new account permission |
| Reliable contact actions | Make student and parent telephone rows separate labeled `tel:` links; email uses a separate `mailto:` link. Preserve text selection and give each contact action adequate target height. No whole-profile click handler. | Phone profile originals show contact text packed into small decorative chips. Direct contact is a useful action tied to the data already visible. | Design/interaction using existing authorized fields; opening a contact link is a deliberate user action |
| Return to the same work | Persist directory query/page/page size during profile visits; restore the row and selected profile tab after course navigation. Validate mentor return routes. | Source local state resets on unmount; role-aware Back alone does not recover the user's search context. | Frontend state/routing; no new backend capability |
| Understandable attachment selection | Before opening the picker show accepted file categories/limit; after selection show filename, real operation state and persistent retry. On success make the new attachment visible even if the prior page was not page 1. | Both document captures are empty, while source permits a picker/backend mismatch. Prevents failed attempts and gives the user a concrete success result. | UI plus tested upload-contract alignment; populated-state evidence required |
| Clear profile section structure | Identity and contacts → one summary strip → shared Courses/Performance/Documents tabs. Secondary personal details and account disclosure follow an explicit user action. Keep scalar definitions in Performance, not another row of duplicate boxes. | Accepted profile/performance/analytics contact sheets repeatedly spend vertical space on the same values. | Design and content structure; precise aggregate semantics depend on existing contracts |

Do not add bulk messaging, automated reminders, contact export, invitations, document previews, a new activity timeline or arbitrary profile analytics filters as incidental redesign features. They need actual demand, role authorization and supported contracts. Authorized file-byte delivery and self-profile identity repair are already identified dependencies; they should be separate work packages, not hidden inside a UI improvement.

## Acceptance additions for curation

Approve M1–M4 first; U1 is the strongest follow-up. Validate seeded first-course visibility, 768/1024 directory transitions, long en/ru/tg tabs and filenames, keyboard menu focus, preserved list context, double-submit prevention, photo-save/Cancel semantics and upload contract agreement. Recapture self-profiles only after the separately tested identity fix. Add populated Documents and edit/error evidence before claiming those surfaces visually verified. All implementation suites, i18n parity, contract synchronization and physical-device checks remain required by the baseline; none were run for this read-only design review.
