# Motion opportunities and limits

Status: reviewed shared planning contract, revised from approved independent feedback. No animation implementation changes. Four operational patterns and one bounded authentication expression are the app-wide motion budget; later pages reuse them rather than introduce an effect for each page.

The invoked `find-animation-opportunities` gates are recorded below. Project rules override the skill's illustrative timings/curves: 150ms ease-out interactive feedback, 200ms ease-out surfaces, `active:scale-[0.96]`, CSS-only implementation, and Tailwind `motion-safe:`. No motion library or custom parallel timing vocabulary.

| # | Location | Today | Purpose | Frequency | Suggested motion | Gate decision |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `frontend/src/components/ui/Modal.tsx:40` and planned mobile More menu | The custom modal disappears immediately; staff phone navigation has no labeled menu surface | Spatial consistency; prevent a jarring change | Occasional | Enter/exit opacity 0→1 and scale .96→1, 200ms ease-out; use existing `card-scale-in` for entry or an interruptible CSS transition; return exit to the same position | Occasional frequency, clear spatial purpose, 200ms budget, no movement of readable underlying data |
| 2 | `frontend/src/components/notifications/NotificationPopover.tsx:41` | Uses `animate-in/fade-in/zoom-in-95` classes without an installed animation utility; fixed width also conflicts with phone geometry | Prevent a jarring change | Occasional | Trigger-aligned transform origin, opacity 0→1 and scale .96→1 over 200ms ease-out; same exit path | Occasional surface, explicit appearance change, 200ms, content settles before reading |
| 3 | `frontend/src/components/ui/QuickSettingsChanger.tsx:65` | Expanding controls change header width and displace neighboring controls | Spatial consistency | Occasional | A separately positioned settings surface, opacity 0→1 and scale .96→1, 200ms ease-out, origin at trigger; header itself stays fixed | Occasional change, clear trigger connection, 200ms, no header reflow |
| 4 | `frontend/src/components/ui/Modal.tsx:43`, shared icon buttons and retry controls | Several icon controls have no consistent active feedback or target size | Feedback | Tens per day | On pointer press scale 1→.96; transform transition 150ms ease-out; disabled controls stay scale 1 | High frequency permits only subtle immediate feedback; 150ms; no delayed click or focus action |
| 5 | `frontend/src/pages/Login.tsx:91`, planned separate illustration panel | No brand illustration or depth treatment | User-requested identity/depth | Occasional entry; returning users may enter daily | Static layered art first; optional one-time background-stage opacity 0→1 at 200ms ease-out, no delay before form use, mark/text stay still. Pointer tracking is deferred pending a rendered comparison; if justified, background displacement only, max ±6px at 200ms | Small, isolated brand expression; no autonomous loop, repeated scroll effect or logo distortion; touch/reduced motion preserve composition |

All movement is gated with `motion-safe:`. Reduced-motion mode keeps surfaces immediately available with no scale/translation; functional color/focus feedback remains. Hover-driven depth also requires `(hover: hover) and (pointer: fine)`. Keep keyboard shortcuts, navigation and focus jumps immediate. Exit rendering must retain the accessible surface only as long as needed for its controlled close lifecycle; do not add a fixed timeout that traps focus after dismissal.

One shared shell-overlay owner controls modality, stacking, scroll locking and focus. Opening More/settings/notifications closes the previous surface; route selection and breakpoint changes release obsolete locks. Desktop popovers originate at their trigger; phone modal surfaces use bottom-center origin, collision-safe width and safe-area bounds. Focus enters immediately and returns correctly on dismissal; navigation instead focuses the destination. Reopening during 200ms must not leave stale blockers.

The score picker is a high-frequency editor, not an occasional modal: opening/closing and focus restoration are immediate, without the 200ms scale recipe. Grade, lesson, period, route and tab changes never wait for animation. Occasional comments/period settings may reuse a surface recipe only when their use remains occasional. Disabled controls stay still, and press scale affects only the control, not rows/panels.

## Rejected candidates

- `frontend/src/components/dashboard/StatsRow.tsx:24` — decorative hover lift on static KPI cards. Rejected by function: the user is reading data and the cards do not need movement to communicate an action. Remove the lift during the shared redesign.
- `frontend/src/components/dashboard/StudentDashboard.tsx:112` — counting up score/attendance values. Rejected by function and frequency: recurring data should remain directly readable and stable on refetch. Use tabular numerals.
- `frontend/src/components/Sidebar.tsx:51` — 300ms width expansion during frequent navigation. Rejected by frequency and property cost: core navigation must respond immediately and should not animate page layout width.
- `frontend/src/components/ui/Toast.tsx:23` — a new elaborate toast entrance. Rejected because transform/opacity appearance feedback already exists; the redesign needs consistent placement/lifecycle and safe-area handling, not more motion.
- `frontend/src/App.tsx` — staggered/faded route entrances. Rejected by frequency: repeatedly entering course/journal/finance pages should not delay reading or keyboard use.
- Journal score-picker scale/fade — rejected by frequency; repeated grading must not wait for a surface animation.
- Course/profile tab slides, traveling underline and animated chart/score fills — rejected by repeated navigation and data-reading function.
- Swipe-to-delete/read/withdraw, celebratory payments and empty-inbox motion — rejected as hidden gestures or decoration without useful information.

## Verdict and implementation handoff

This CRM needs clearer surface transitions and consistent press feedback, with very little decorative motion. The highest-leverage opportunity is a properly bounded mobile navigation/dialog surface, because it recovers content width and communicates where navigation lives. The login illustration is the single expressive visual treatment; its static composition comes first, pointer tracking is deferred, and grades, balances, charts and operational tables stay still.

Implementation handoff: use these recipes in each group's component task, with the project's tests and motion constraints. The skill's optional `improve-animations plan <suggestion>` workflow can further refine a component plan if needed; it is not required to finish this audit and does not authorize source edits during planning.

## User-authorized SVG artwork and brand motion (2026-10-10)

The user supplied and authorized editable full-logo/emblem SVGs and animated book/full-logo SVGs, saved under `frontend/src/assets/kitob-svg/`. These supersede PNGs for active logo placements; preserve the original PNG and SVG files as source evidence. SVGs contain vector paths, not live text. Preserve proportions and measured protected margins. Theme-specific color adjustments are authorized where needed; inspect both themes rather than automatically adding a large white backing.

The animated book is the shared activity indicator for page loading and meaningful pending processes. It supplements matching skeleton geometry and a translated loading status; it must not imply progress percentages, replace retained data during refetch, or block keyboard use. Use restrained size and stable layout.

The full supplied logo animation loops in the desktop 50/50 login brand composition and the existing invitation/account-activation experience at `/verify-email`; there is no new public registration route. On phones prioritize the form and use compact static branding rather than adding a large animated panel. Keep both original animations unchanged as source assets and author a deliberate derivative if needed: their supplied CSS currently plays once, so looping must preserve the coordinated sequence rather than independently repeating every part with mismatched durations.

This explicit user request supersedes the earlier prohibition of repeating brand/loading animation ONLY for these supplied assets and placements. Asset-internal CSS sequence timings are a bounded exception to the 150/200ms control/surface vocabulary. Other UI motion remains CSS-only150ms interactive/200ms occasional surfaces, motion-safe and immediate keyboard operation. No motion/WebGL library, pointer tracking, animated numbers or unrelated decorative effects. Reduced motion receives a static readable logo/emblem with no shine, stagger or looping. Stop activity motion when the process ends; never persist passwords or replay via timers that remount forms. Verify real renders and reduced-motion behavior; do not claim a static screenshot proves the loop.
