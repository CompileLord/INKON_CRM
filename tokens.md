# KITOB CRM design tokens

Status: reviewed redesign planning contract, revised from the approved independent recommendations. Documentation only; the application palette has not been changed. This replaces the older warm maroon design direction for the planned KITOB redesign.

## Purpose

Make learning and daily administration feel clear, dependable, and encouraging. The supplied KITOB poster establishes knowledge through the open book, growth through rising pages, and opportunity through upward movement. Express this through hierarchy, space, and a few purposeful accents. Keep grades, money, names, and operational tables visually still and precise.

The supplied complete logo and book emblem are the brand artwork. Preserve their proportions, color, orientation, and clear space. Do not reconstruct the wordmark with a font or apply shadows, filters, recoloring, or rotations to the logo. A separate background may provide depth on authentication pages. The supplied raster edges must be inspected at intended sizes on both themes before asset integration.

Measure logo size by visible artwork rather than transparent canvas. The poster requires surrounding clear space equal to the rendered height of its K. Keep the supplied originals; any production transparency-bound optimization must preserve legitimate artwork and restore the protected margin in its wrapper. Inspect visible edge pixels at actual 1×/2× sizes in both themes before shipping. No recoloring, glow or blur to hide defects.

Source assets supplied by the user:

- Complete logo: `/home/compilelord/Downloads/ChatGPT Image Oct 8, 2026, 05_14_59 PM-1.png`.
- Standalone book emblem: `/home/compilelord/Downloads/ChatGPT Image Oct 8, 2026, 05_14_59 PM-2.png`.
- Brand poster: `/home/compilelord/Downloads/KITOB Brand Guidelines Poster.png`.

These are local source references; copy the approved assets into the application's asset directory during implementation rather than serving Downloads paths.

## Brand primitives

| Primitive | Value | Use |
| --- | --- | --- |
| KITOB navy | `#083D91` | Brand identity, light-theme primary action, key links |
| KITOB blue | `#0E6BB8` | Supporting identity, information, focus accents |
| KITOB orange | `#F58220` | Sparing emphasis, illustration details, progress accents |
| KITOB white | `#FFFFFF` | Light surfaces and approved light logo backing |

Orange is not an error color. Success, danger, and warning retain their own semantic meaning. Never encode status by color alone.

## Semantic palette

These are proposed values for the existing semantic utilities. Hex values belong in the centralized token declarations, never in page/component class strings or inline colors. Existing `--imkon-*` variables may remain internally during migration; their product identity is KITOB. The legacy `maroon` class names are compatibility aliases to the primary color and must no longer imply a red brand.

| Utility/token role | Light | Dark | Intended use |
| --- | --- | --- | --- |
| `cream` / background | `#F5F8FD` | `#0A1528` | Page canvas |
| `card` / popover | `#FFFFFF` | `#142139` | Cards, panels, dialogs |
| `strip` | `#F0F5FC` | `#192A45` | Quiet summaries and inset groups |
| `beige` / secondary | `#EAF1FA` | `#203451` | Selected neutral tabs, secondary controls |
| `beige-dark` / surface-strong | `#DDE8F7` | `#294260` | Stronger inset surface |
| `row-hover` | `#F1F6FD` | `#1C304D` | Hovered interactive rows |
| `nav-hover` | `#EAF1FA` | `#203451` | Navigation hover |
| `border` | `#D9E3F0` | `#31445F` | Quiet structural separators; not essential input boundaries |
| `border-warm` | `#C4D3E7` | `#405673` | Emphasized separators; legacy name |
| `control-border` / input | `#7C8EA7` | `#748CA9` | Resting boundary that identifies a field/control |
| `brand-plate` | `#FFFFFF` | `#FFFFFF` | Protected backing for supplied full-color artwork when needed |
| `ink` / foreground | `#14233B` | `#EDF3FC` | Main text |
| `muted` / muted-foreground | `#52647B` | `#A9B8CE` | Secondary text |
| `nav` | `#354E70` | `#B6C8E0` | Unselected navigation |
| `label` | `#52647B` | `#A9B8CE` | Labels and timestamps; no faint text |
| `maroon` / primary | `#083D91` | `#8AB9FA` | Primary controls and links |
| `maroon-dark` / primary-hover | `#063273` | `#A6CAFC` | Primary hover |
| `on-primary` / primary-foreground | `#FFFFFF` | `#0A1528` | Text on primary controls |
| `accent` | `#F58220` | `#FFAB60` | Supporting brand emphasis |
| `accent-dark` / accent-hover | `#DE6B0A` | `#FFBF88` | Accent hover |
| `on-accent` / accent-foreground | `#14233B` | `#0A1528` | Text on orange surfaces |
| `banner-from` | `#EAF1FA` | `#192A45` | Authentication/empty-state background start |
| `banner-to` | `#F5F8FD` | `#142139` | Authentication/empty-state background end |
| `event-border` | `#D9E3F0` | `#31445F` | Activity separators |
| `dot-gray` | `#52647B` | `#A9B8CE` | Secondary chart markers |
| `destructive` | `#B42332` | `#FF99A3` | Errors and destructive actions |
| `on-destructive` | `#FFFFFF` | `#0A1528` | Foreground on destructive controls |
| `success` | `#176647` | `#79D9AE` | Positive result text/icon |
| `success-surface` | `#E8F5EE` | `#163B31` | Positive badge background |
| `warning` | `#885008` | `#FFD089` | Warning text/icon |
| `warning-surface` | `#FFF3DA` | `#42331D` | Warning badge background |
| `info` | `#0E6BB8` | `#8FC8FF` | Information text/icon |
| `info-surface` | `#EAF3FD` | `#183656` | Information badge background |
| `danger-surface` | `#FDEDF0` | `#442431` | Error message background |
| `ring` | `#0E6BB8` | `#8FC8FF` | Keyboard focus |
| `scrim` | `#0A1528` at 40% | `#030814` at 65% | Modal backdrop only |

`background`, `foreground`, `card-foreground`, `popover-foreground`, `secondary-foreground`, and `muted-foreground` must resolve to these semantic values. Do not leave an alias with a separate literal color, such as the existing white `accent-foreground`. Charts need centralized series tokens, with labels/patterns when adjacent colors cannot be distinguished.

Dark theme changes surfaces and readable interface accents; it does not recolor the supplied artwork. Where the full-color logo is insufficiently readable, place it on a quiet white brand plate with its required clear space. Do not synthesize an inverse logo from the supplied image.

Ordinary links, primary actions and selected navigation use the theme-aware primary role. Remove legacy `dark:text-accent`/`dark:bg-accent` overrides from those roles during their component migration; changing the old maroon variable alone leaves orange overrides in place. Selection uses one quiet surface, primary icon/text, weight and accessible current/selected state. Orange does not replace every dark-theme primary action.

## Contrast contract

Computed sRGB contrast for the reference combinations: navy on white 10.06:1; blue on white 5.51:1; orange with white 2.59:1; light ink on white 15.75:1; light muted on white 6.06:1; dark ink on dark card 14.41:1; dark muted on dark card 7.99:1; dark primary against its dark foreground 9.04:1. Orange/white must not be used for ordinary button text. Use the semantic foregrounds above.

Before implementation completion, check all text/surface pairs actually used, including disabled states, placeholder text, focus outlines, semantic badges, and charts. Text targets 4.5:1 for ordinary text and 3:1 for large text; focus/control boundaries target 3:1 against adjoining colors. The table is a starting contract, not a claim that every unimplemented component already passes.

Proposed control-border/card pairs calculate to 3.34:1 light and 4.64:1 dark; structural border/card pairs are only 1.30:1 and 1.62:1. Use the dedicated boundary where it identifies the control, keeping unrelated separators quiet. Recalculate against actual adjacent surfaces and error states. [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) distinguishes necessary control/state cues from optional boundaries and decoration.

## Typography

| Role | Specification | Use |
| --- | --- | --- |
| Interface | Existing Inter/system stack, 400/500/600/700 | Forms, navigation, cards, tables |
| Brand editorial display | Georgia/approved Cyrillic-capable serif fallback, 500/600 | Authentication supporting headline only; never imitate the logo |
| Small metadata | 12px / 18px | Secondary timestamps and compact badges |
| Dense desktop data | 14px / 20px | Tables and journal cells |
| Body and mobile inputs | 16px / 24px | Reading text, phone inputs; avoid iOS input zoom |
| Section heading | 18px / 26px, 600 | Card/section titles |
| Page heading | 28px / 36px desktop; 24px / 32px mobile, 600 | One main page heading |
| Authentication editorial headline | 40px / 48px desktop | Right illustration panel |
| Metric | 28px / 36px, 600 | Use sparingly; prioritize the value over decoration |
| Compact profile metric | 24px / 32px, 600 | Shared shallow student/mentor summary strip |

All changing numbers use `tabular-nums`. Money remains a decimal string throughout display and arithmetic. Dates/times/numbers use the shared locale formatters. Long names, Cyrillic/Tajik text, and validation copy must wrap without clipped controls. Avoid uppercase microcopy for essential instructions.

## Space, shape, and layout

Use a 4px spacing base: 4, 8, 12, 16, 20, 24, 32, 40, 48. Phone page gutters 16px; desktop gutters 28–32px. Cards have 16px phone padding and 20–24px desktop padding. Use 16px between related groups, 24–32px between distinct sections.

Control radius 10px; card/dialog radius 16px; small badge radius 8px; pills are reserved for small statuses and compact navigation selectors. Default control height 44px, form input height 48px. All touch targets are at least 44 × 44px, including icon-only controls and row menus.

Desktop shell: 240px labeled sidebar at 1024px and wider. Below 1024px, return that width to content and use a labeled role-aware mobile navigation pattern with a More menu. Desktop page content uses a centered maximum width of 1440px; authentication remains an equal full-width 50/50 split at 1024px and wider. Below 1024px the authentication form owns the page; a compact brand header replaces the illustration pane.

Borders separate regions that need separation; do not wrap every statistic, icon, label, and subsection in another outlined card. Cards use a quiet shadow only when elevation is meaningful; dialogs/popovers may use a stronger shadow. Do not add hover lift to static data cards.

Default operational collections use divided rows on phones, with a flexible identity column and separate 44px actions. Use tables only where the sidebar-adjusted content width supports readable columns; table overflow stays local and labeled. Do not shrink translated labels or names to meet an artificial first-screen height. First useful row/action visibility at normal seeded 390×844 is an acceptance target, not a clipping rule. Secondary comparisons, technical detail and rare account fields belong in deliberate disclosures or their own tabs.

Forms use header / one `minmax(0, 1fr)` scroll body / footer; header/footer are layout rows, not input-covering overlays. Phone fields, including first/last names, use one column. The mutation owner drives pending/error/submit state. Define pristine/dirty/pending dismissal and focus restoration. Independently saved photo uploads and immediate appearance choices never inherit a promise that form Cancel undoes them. Native keyboard/safe-area behavior requires hardware verification.

Shared tabs have readable intrinsic label widths, at least 44px target height, selected/focused state and local scrolling when needed. Keep the focused/selected label in view immediately; asynchronous panels may use manual Enter/Space activation after arrow-key focus. No type shrinking, page overflow or animated underline travel. Tab/query state and authorized return context belong to the page contract.

Surface geometry is configurable while lifecycle remains shared. Person forms use a preferred 480px end drawer from 640px viewport width; course forms use a preferred 560px end drawer from 768px. Below each variant's threshold use its full-height modal. Finance/read-only inspector dialogs can use 560px centered width from 640px with a full-height variant below. Bound every width by visible viewport clearance; widths never force a small input body. These form thresholds are separate from the 1024px shell/navigation breakpoint and do not justify separate focus/scroll-lock implementations. Shared shell menus remain the compact safe-area phone surfaces defined by Group 01.

## Mobile platform

Use `viewport-fit=cover`, `interactive-widget=resizes-content`, theme-aware browser chrome, and a viewport meta tag that retains user zoom. App shells and dialog bounds use dynamic viewport units; authentication first screens use small viewport units and remain vertically scrollable with the keyboard open. Reserve bottom navigation height plus safe-area inset in the content padding.

Gate hover by capability. Controls use `touch-action: manipulation`, local text-selection suppression, and immediate active feedback; content text remains selectable. Remove native tap highlights only when controls provide feedback. Nested dialog/menu content contains overscroll. Do not disable ordinary scrolling or gesture axes without a concrete interaction reason. Physical-device testing remains required for keyboard, touch, safe area, browser chrome, landscape, and reduced-motion feel.

## Motion contract

No motion library. Reuse CSS transitions and the established `card-scale-in` keyframe. The project's two timings take precedence over skill examples: 150ms `ease-out` for interactive feedback; 200ms `ease-out` for surfaces. Press scale is `active:scale-[0.96]`. Scope all nonessential transform/opacity motion through Tailwind `motion-safe:`; do not create a global reduced-motion rule.

Only properties that actually change receive a transition. Transform and opacity are the preferred animated properties. No `transition-all`, animated layout widths/heights, page-wide stagger, number counting, animated financial charts, route fades, or animated journal keyboard navigation.

Authentication uses a composed layered illustration background that succeeds while static. Preserve the requested WebGL-like depth and occasional 200ms motion-safe surface/auth-stage entry; the book artwork and text stay upright, undistorted and still. Pointer tracking is not required for the first implementation. A later rendered comparison may justify optional background-only translation capped at ±6px over 200ms, only for hover-capable fine pointers and motion-safe conditions. Touch/reduced motion receive the identical static composition. CSS layers suffice; an actual WebGL renderer is outside the initial implementation plan.

Repeated score-picker opening, grade keyboard navigation, lesson changes and tab-panel changes are immediate; they do not inherit the occasional 200ms surface recipe. Background data refresh does not animate numbers or replace loaded content with entrance effects. Surface close/reopen, route/breakpoint change and focus cleanup must be interruptible without invisible blockers or delayed interaction.

## Data and copy

Every collection has geometry-matched loading, translated error with functional retry, explained empty state, and loaded state. Partial section failures must not masquerade as zero balances or missing grades. All user-facing copy, tooltips, placeholders, aria labels, and pluralized counts pass through `t()` and exist in English, Russian, and Tajik. Add bidirectional parity checks for touched namespaces. Brand names still need a localized text key when rendered as text rather than embedded artwork.

Keep loaded content during background refetch and report refresh failure locally. A stored zero, missing entry and explicitly ungraded result are different states; do not infer domain state from score positivity. Valid bonus percentages above 100 remain visible and within chart range. Rank, class average and finance aggregates need their actual population/denominator/date/allocation definitions. Technical exceptions are not user-facing copy. Planned simplification cannot change scoring, ledger or permission policy silently.

## Migration and verification

First add or map the semantic variables/aliases in `frontend/src/index.css`; then integrate optimized logo assets without changing originals; then migrate shared controls and shell; then implement page groups in the audit's dependency order. Keep `DESIGN (1).md` identified as historical once implementation adopts this contract. Do not install visual libraries or globally rename utilities before the corresponding page/component task is ready.

Verify both themes at 390px and 1440px, then check 320px, 768px, 1024px, long names, three locales, keyboard navigation, and reduced motion. The audit has not yet performed those implementation checks. Follow project Taskmaster status, behavioral tests, all required suites, and the commit protocol during implementation. Documentation planning does not mark implementation completed.

## User-authorized SVG asset exception (2026-10-10)

Active KITOB branding uses the supplied editable SVG full logo/emblem; retain original assets. Theme-specific artwork color adjustments and the supplied book-loading/full-logo authentication animation are authorized per `docs/redesign-audit/MOTION.md` section “User-authorized SVG artwork and brand motion (2026-10-10)”. Preserve artwork geometry/clear space, static reduced-motion fallbacks and semantic UI tokens. Asset-internal CSS sequence timing is the bounded exception; all controls/surfaces retain150/200ms CSS-only interaction rules.
