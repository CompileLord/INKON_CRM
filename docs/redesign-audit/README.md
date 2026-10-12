# KITOB CRM redesign audit

This folder contains the approved design specifications, independent review rationale and original baseline galleries. All six group plans incorporate the authorized reviewer recommendations. Shared tokens, motion and dependencies are synchronized.

The capture history below describes the application at the original audit stage. For current implementation status and redesigned screenshots, use [Implementation evidence](../redesign-execution/README.md).

This audit follows the requested sequence: agy captures one group using real seeded data, Codex inspects its desktop/mobile and light/dark screenshots, Codex writes that group's page specifications and verification criteria, then agy starts the next group. A code inspection is not a substitute for screenshot evidence. Unreachable states are recorded explicitly.

| Order | Group | Capture | Screenshot review | Page plan | At baseline |
| --- | --- | --- | --- | --- | --- |
| 01 | Authentication, role dashboards, shared navigation | 40 captures; forced-password gap | Reviewed | Reviewed and revised; documented gap | Not started |
| 02 | Staff courses and course detail | 28 page/surface captures | Reviewed | Reviewed and revised | Not started |
| 03 | Students, mentors, and staff profile views | 44 accepted; self-profile redirects documented | Reviewed | Reviewed and revised; documented gaps | Not started |
| 04 | Staff journals and grading workspace | 20 captures; phone exam-button blocked | Reviewed | Reviewed and revised; documented gap | Not started |
| 05 | Finance and audit | 40 page/surface captures | Reviewed | Reviewed and revised | Not started |
| 06 | Student learning pages, settings, notifications | 56 captures; empty archive/inboxes | Reviewed | Reviewed and revised; populated-state evidence limits | Not started |

The six plans cover all 19 page modules in the current route inventory. There are 228 accepted real captures, plus 16 separately identified self-profile redirect diagnostics. The dashboard is reviewed once in Group 01, with its role-specific content included.

## Page coverage checklist

Every entry below requires its own target layout specification. Role variants share a component plan only when their visible content and authorized actions are also specified.

| Group | Routes and rendered variants | Plan status |
| --- | --- | --- |
| 01 | `/login`, `/verify-email`, `/set-password`; `/` for superadmin, mentor, student, accountant; shared desktop sidebar, mobile navigation, header, quick settings, notification preview | [Specified, forced-password capture gap](group-01-auth-shell/PLAN.md) |
| 02 | `/courses`, `/courses/:id` for superadmin and mentor; course create/edit, enrollment, schedule and lifecycle surfaces reachable from those pages | [Specified](group-02-courses/PLAN.md) |
| 03 | `/students`, `/students/:id` for authorized staff and student self-view; `/mentors`, `/mentors/:id` for superadmin and mentor self-view; create/edit and document surfaces | [Specified, self-profile guard gaps](group-03-people/PLAN.md) |
| 04 | `/journals`, `/journals/:id` for superadmin and mentor; periods, editable grading grid, score breakdowns, autosave and exam-weight surfaces | [Specified, phone dialog gap](group-04-journals/PLAN.md) |
| 05 | `/finance` for superadmin and accountant; payment/receivable/debtor views and payment surfaces; `/audit` for superadmin | [Specified](group-05-finance-audit/PLAN.md) |
| 06 | `/my/courses`, `/my/courses/:courseId`, `/my/journal/:journalId` for students; `/settings` and `/notifications` for all authorized roles | [Specified, empty-state evidence limits](group-06-learning-settings/PLAN.md) |

The route guards and each endpoint's authorization guard must be checked before a plan proposes data or actions for a role. A hidden navigation item does not establish an API privacy boundary.

## Capture requirements

- Desktop: 1440 × 1000; mobile: 390 × 844. Capture both application themes at each size, with full-page images and relevant opened surfaces.
- Use the running local application and verified demo seed data. Do not mock API responses, invent populated screenshots, or reset an existing database.
- Record route, role, viewport, theme, loaded/error/empty state, console/network issues, overflow, and exact artifact path in a sanitized manifest. No passwords or session tokens in artifacts.
- Browser mobile captures demonstrate responsive layout. Safe areas, keyboard behavior, sticky hover, browser chrome, and touch feel require physical-device verification before implementation is declared complete.

## Design inputs

The supplied KITOB brand poster and two supplied PNG logos are the visual references. The complete logo is for visible brand identification; the standalone book emblem is for the login illustration and compact navigation. Preserve their proportions, colors, and clear space. Inspect the supplied raster edges on light and dark surfaces before shipping.

The poster's palette is navy `#083D91`, blue `#0E6BB8`, orange `#F58220`, and white `#FFFFFF`. Its concepts are an open book, rising pages, and upward movement: knowledge, development, and opportunity. Each group plan now specifies page structure, responsive behavior, both-theme treatment, authorized actions, data states and verification requirements.

No tracked `tokens.md` exists at audit start. The current implementation defines its tokens in `frontend/src/index.css`; `DESIGN (1).md` contains an older design specification. The requested `tokens.md` is the proposed documented token contract, mapped to the existing semantic class names, with explicit light/dark values and accessible foregrounds.

## Applied skills

- [delegate-to-agy](/home/compilelord/.codex/skills/delegate-to-agy/SKILL.md): bounded local screenshot and route reconnaissance; Codex independently reviews artifacts.
- [mobile-native](/home/compilelord/.agents/skills/mobile-native/SKILL.md): viewport, safe area, touch, input, and hardware verification requirements.
- [find-animation-opportunities](/home/compilelord/.agents/skills/find-animation-opportunities/SKILL.md): read-only motion recommendations with frequency, purpose, speed, and function gates.
- [pick-ui-library](/home/compilelord/.agents/skills/pick-ui-library/SKILL.md): check installed dependencies before recommending accessible primitives or feedback libraries.
- [emil-design-eng](/home/compilelord/.agents/skills/emil-design-eng/SKILL.md): hierarchy, restraint, predictable interaction, and before/after review tables.

Project rules control implementation: token classes, three locales, four data states, decimal-string money, CSS-only motion, `motion-safe:`, 150ms interactive feedback, 200ms surfaces, and `active:scale-[0.96]`. Library recommendations cannot override those rules.

## Existing work and environment

At audit start, seven old planning documents were deleted in the user's working tree and `frontend/package-lock.json` was modified. Those changes must remain untouched and must not be included in an audit commit.

Current AGENTS.md controls the environment: use the available system environment; Conda is not required. Existing local services or isolated test fixtures may be used as authorized.

## Capture environment and resolved blocker

The original local frontend is listening on IPv6 loopback at port 5173; the backend is listening on IPv4 loopback at port 8000. A temporary frontend was also started on `127.0.0.1:5174` for diagnosis. The workspace receives HTTP 200 from the latter login route, but agy's sandboxed Chrome reports `ERR_CONNECTION_REFUSED` at that address. Its sandboxed curl reports HTTP 400. The failed trial PNG was blank and was rejected as visual evidence.

Temporary Playwright tooling was prepared under `/tmp/inkon-audit-browser/`, without adding application dependencies. The prepared login capture probe (`/tmp/inkon-login-probe.cjs`, temporary tooling rather than a retained artifact) checks a real rendered login form, loaded fonts, the effective app theme, and overflow before saving four screenshots. It contains no credentials. Agy ran it, but no usable screenshots or capture manifest were produced.

The user explicitly authorized bounded local agy screenshot capture outside its terminal sandbox. A temporary copy of the delegation wrapper was prepared under `/tmp`, changing only the CLI sandbox argument; the installed skill wrapper remains untouched. Group 01 now has four login images plus 36 verification/dashboard/open-surface images captured by agy and inspected by Codex. No seed session requires password setup, so that page is source-specified with an explicit capture gap.

The temporary Vite uses an absolute same-origin API URL and forwards `/api` and `/storage` to the existing local backend. Its config and separate cache are under `/tmp`; the application config is unchanged. Early diagnostic blank/media-failure trials are not accepted page evidence; final captures use the working runtime and actual seed media.

The proposed root [tokens.md](../../tokens.md) now documents the KITOB token contract, brand rationale, responsive/motion rules, and migration requirements. It is a planning document; the application's token values and logo integration remain unimplemented.

## Review entry points

- [Screenshot galleries](GALLERY.md): contact sheets grouped by page/role, each linking original desktop/mobile and light/dark captures.
- [Implementation roadmap](IMPLEMENTATION.md): ordered dependencies, contract fixes and verification gates.
- [Motion recommendations](MOTION.md): exact permitted values and rejected decorative animation.
- [Proposed token contract](../../tokens.md): KITOB palette, typography, surfaces and mobile conventions.

The user authorized all six original reviewers to incorporate all their recommendations into their own plans. Each plan now resolves additions/removals into one implementation specification, preserving deferred features and separate correctness/contract work. The six [independent reviews and revision status](reviews/README.md) retain screenshot-backed rationale; the [earlier selection](reviews/APPROVAL.md) is historical, superseded by that broader authorization. No application source was changed.

## Completion conditions

The audit is complete only when every group has real capture evidence or an explicit reachability blocker, its screenshots have been inspected, and every routed page has a target layout, responsive behavior, theme treatment, data states, interaction rules, dependencies, and regression checks. Planning completion does not mark implementation tasks completed.

Implementation later requires the repository's backend tests, frontend tests, TypeScript checks, touched i18n parity checks, appropriate behavior tests, and contract regeneration if API schemas change. Commit only the relevant verified change; never push or open a PR without an explicit request.

## Current implementation execution policy (2026-10-12)

The user authorized fresh **Gemini 3.8 Flash high** conversations per coherent subgroup, with the same conversation reused for that subgroup’s tasks and corrections. See [the persistent subgroup map and recovery instructions](../redesign-execution/SUBGROUPS.md). This supersedes one-conversation-per-group execution, preserves sequential task dependencies and every design/verification requirement, and does not reopen completed work. Live implementation status and session IDs are in [the execution ledger](../redesign-execution/ledger.json); historical audit status above describes the original planning stage.
