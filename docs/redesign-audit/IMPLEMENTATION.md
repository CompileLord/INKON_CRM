# KITOB redesign implementation roadmap

Status: reviewed planning roadmap; the user authorized all six original reviewers to incorporate their recommendations into their group plans. No application redesign task is marked completed. This file orders implementation and separates visual changes, behavior repairs, conditional capabilities and deferred expansion.

## Direction

Use the supplied full KITOB logo for brand identification and the supplied book emblem for compact navigation and the login illustration. The poster's open-book/rising-pages idea informs a calm learning workspace: navy and blue hierarchy, white/light-blue surfaces, orange attention accents, generous readable spacing. Preserve original logo proportions/colors and inspect transparent edges in both themes. [tokens.md](../../tokens.md) is the proposed source of truth for semantic colors, typography, spacing, breakpoints and motion.

Desktop login is a 50/50 form/editorial split with explicit visible-art sizing and K-height clear space. The right side contains the emblem, a concise translated headline and supporting text, with composed layered background depth. Static composition comes first; occasional 200ms motion-safe background-stage entry can express the requested motion, while required pointer tracking is removed. Optional fine-pointer displacement is deferred pending a rendered comparison. The logo/text stay upright and still. CSS layers supply the WebGL-like appearance; touch/reduced motion receive the static composition. Phone login prioritizes the form and compact brand. Actual asset integration and motion remain unimplemented.

Staff phone pages replace the persistent icon rail with labeled role-specific bottom navigation and a More surface. Desktop retains the labeled sidebar. Page identity, primary action and useful content come before decorative metrics. Course detail is a compact overview with Students and Progress tabs; grading has a dedicated phone lesson view rather than a compressed desktop spreadsheet.

## Ordered work packages

| Order | Package | Depends on | Principal files | Deliverable and acceptance |
| --- | --- | --- | --- | --- |
| 1 | Brand assets, semantic tokens, shared controls | None | `frontend/src/index.css`, shared UI components, `tokens.md` | Measured real logo assets/clear space, both themes, dedicated input boundaries, ordinary theme-aware primary links, 44px targets, 16px phone inputs, CSS motion only |
| 2 | Auth identity alignment | Current backend/auth contract | auth JWT/store/bootstrap, role guards and tests | Resolve `sub` versus `user_id` consistently; correct self navigation without weakening permission checks; tests for restored/refreshed session identity |
| 3 | Shell and authentication | 1; identity-dependent links need 2 | AppLayout, Sidebar, Header, MobileBottomNav, Login, VerifyEmail, SetPassword | Group 01 exact layouts, 50/50 login, one overlay owner with route/breakpoint cleanup, skip link/heading focus, role navigation, one phone notifications destination and password guard unchanged |
| 4 | Role dashboards | 1, 3 | Dashboard and role dashboard components | Short phone hierarchy, independent pane states, honest missing metrics, next-action-first layout |
| 5 | Courses and enrollment surfaces | 1, 3 | Courses, CourseProfile, course components and forms | Group 02 owned tabs/rows, neutral comparison, direct mentor journal access, explicit enrollment select/confirm/result, immutable edit terms, state restoration and admin-only mutations |
| 6 | People and profiles | 1, 2, 3, shared course rows | Students, Mentors, profiles, documents, person forms | Group 03 compact profile/768–1024 geometry, contextual Edit, preserved return context, immediate-avatar distinction, contract-aligned upload and separately authorized file delivery |
| 7 | Journals and mobile grading | 1, 3, course navigation; grading-state decision where needed | Journals, JournalDetail, journal components/autosave | First canonical edit commands, draft ownership, reliable drain/conflict snapshots and paired summary edits; then desktop grid, phone Lesson/Summary, roster search, reachable period settings and secondary Progress |
| 8 | Finance and audit | 1, 3, shared dialog/person rows | Finance, finance components, Audit | Group 05 course-balance identity, settled versus cash/date semantics, allocation-priority guidance, View payment handoff, readable phone rows and field-level audit inspector |
| 9 | Student learning | 1, 3, course/journal contract checks | `pages/student/*`, student components | Group 06 periods-first layouts, labeled result/components, unclipped bonus scores, conditional rank/comparison, calculation help and own-row privacy |
| 10 | Settings and notifications | 1, 3 | Settings, Notifications, header notification preview | Group 06 local profile Save/discard, independent photo/appearance status, optional-field clearing, no placeholder integration panel, event-date versus sent-time and personal read/retry inbox without raw exceptions |
| 11 | Final verification and handoff | 1–10 | All touched components/contracts/locales | Both themes, three locales, behavior suites, physical phone checks, final captures, logical commits |

Every package uses a correctly identified Taskmaster task before coding. Read `.taskmaster/tasks/tasks_index.json`, inspect dependency order and the referenced task file, mark only the relevant task `in_progress`, and mark `completed` only after its defined tests pass. Existing completed tasks are not reopened or supplemented silently by this planning audit; map new work explicitly before implementation. Do not combine unrelated auth/backend fixes into a cosmetic commit.

## Contract-dependent work must stay explicit

- Self-profile reachability needs an auth identity fix before those variants can be screenshot-verified. Backend token identity and authenticated `/users/me` are the evidence; arbitrary route-guard exceptions are not a solution.
- True zero grades, ungraded values, graded-period chart eligibility, denominators and date-bounded next lessons require actual domain state. Where frontend data already supplies it, fix presentation; where it does not, specify a minimal tested backend/schema task. Do not infer grading from `score > 0`.
- Directory/course/journal/audit/debtor searches must honestly reflect their server capabilities. The audit lists missing global text/sort support. Server filtering/enrichment goes through service/repository boundaries, SQL aggregates/eager loading and tests; never an N+1 profile fetch for a prettier row.
- Payment identity, allocations, receipt and receivable definitions follow the ledger contract. Additional refund/discount/period-close tools are not included merely because API hooks exist.
- Telegram webhook health is currently hardcoded in the settings UI. Omit the Integration card in the initial organization layout rather than replacing it with a permanent unverified placeholder. Truthful channel guidance can live beside notification rules. Reintroduce health UI only with a separately scoped real health capability; never invent an Active badge.

- Course/period/profile averages may have different populations or denominators. Preserve valid zero and bonus percentages above 100%; chart domains must not clamp those values. Rank ties and enrolled-versus-ranked population need an explicit domain decision before prominent comparison. Scoring policy is not redefined by a visual task.
- Journal Space/checkbox/phone edits need one canonical command. A drain operation must actually settle queued and in-flight requests before successful navigation. Preserve local/server conflict snapshots; partial operation success and paired exam/bonus drafts need independent state. These repairs precede responsive editor mounting and require behavioral regression tests.
- Documents picker guidance/current client limit disagree with backend types and 50 MiB ceiling. Align supported types, byte limit, persistent retry and same-file reselection. Direct public `/storage` paths require a separate authorized file-byte delivery review; guarded listing alone does not establish byte privacy. No runtime exploit is claimed by this planning audit.
- Debt settlement includes allocation sources beyond cash; selected course is allocation priority, not necessarily an exclusive destination. Current receivable versus date-scoped collection, refund/void status and active allocations must retain their exact ledger meaning. Any Decimal-to-float cache correction stays in a tested precision task.
- Notification `error_message` currently mixes successful score markers and raw failure exceptions. Omit raw technical details from personal inbox; sanitized public reason/message content is separate schema work. Date-only event date and actual sent timestamp are not interchangeable.

## Capability scope after review

| Classification | Included specification | Boundary |
| --- | --- | --- |
| Existing-capability workflow gains | Skip-to-content, quiet route context, direct mentor Open journal, contextual admin Edit, contact links, preserved query/page/tab/lesson/scroll, observable enrollment success, scoped roster search, scoring explanation, document-selection/retry, View payment result, profile Discard changes, row-local read recovery | Implement with current authorized data/routes where supported; no new role rights, messages, invented counts or business policy |
| Conditional contract/navigation improvements | Attention-to-finance context, eligible-student pagination, bounded course roster, joined payment names, global audit/inbox/directory filtering | Specify supported params and server scope first; use current honest paging as interim; service/repository authorization, query-count/filter tests and synchronized contract/types |
| Deferred product capabilities explicitly considered | Add lesson to calendar, real webhook health, actual notification messages, dated occurrences, cell-specific journal links, editable enrollment/course terms, grouping audit operations | Require confirmed demand and domain contract; calendar needs valid eligibility/end/timezone, audit grouping needs correlation ID before pagination. No incidental controls in first redesign |
| Not part of the first redesign | Favorites, bulk attendance/enrollment/messaging, contact export, swipe gestures, offline or multi-session drafts, document preview, exact allocation preview, historical balance snapshots, immutable issued receipts, extra analytics/brand illustrations | Keep deferred as the reviewers recommend; approval to include a recommendation in a plan does not imply building a capability the recommendation says to defer |

All six reviewer documents are retained as evidence. Their recommendations are resolved into the page specifications rather than appended as contradictory alternatives. Changes to shared tokens/motion inherit the same two timings and semantic-role rules. The application remains unmodified.

Schema changes require `python backend/scripts/generate_contract.py`, regenerated `CONTRACT.md` and synchronized TypeScript types. All Python/testing work must use the mandated Conda base environment; no custom environment. Conda was not exposed during the screenshot audit. Files under `frontend/src/lib/` are gitignored by the existing pattern: explicitly read/verify them, report untracked status and intentionally stage only necessary deliverables during implementation.

## Library and motion decisions

Keep React Router, React Query, Zustand, React Hook Form, Zod, existing decimal helpers, native tables/SVG and the current toast system. The [pick-ui-library skill](/home/compilelord/.agents/skills/pick-ui-library/SKILL.md) informed a narrow recommendation: use Base UI for dialog/menu/popover focus and dismissal behavior, if chosen during the shared-primitives package. No package was installed. Its [Dialog documentation](https://base-ui.com/react/components/dialog) supports the intended accessible surface primitive.

No motion library, animated-number library, spreadsheet, gesture or WebGL package is required for the proposed first implementation. Reuse [MOTION.md](MOTION.md): 150ms ease-out feedback, 200ms surfaces, press 0.96, nonessential motion scoped through `motion-safe:`. High-frequency grade edits and data refreshes stay immediate. No decorative stagger or metric count-up. Existing nonconforming animations are removed as their components are touched.

## Verification gates

Every data pane has loading geometry, error/retry, translated explanatory empty state and loaded content. Every new visible key exists in en/ru/tg with bidirectional namespace parity. Use shared date/time formatters, decimal-string money and tabular numerals. Preserve authorization boundaries and existing scoring/concurrency behavior. No `as any`, skipped/stub tests, placeholders or new code comments.

For implementation, run the mandated commands in Conda base:

```text
cd backend && python -m pytest app/tests -q
cd frontend && npx vitest run
cd frontend && npx tsc --noEmit
```

Run parity for each touched namespace, behavior tests specified by each group and contract regeneration whenever required. Browser geometry checks cover 320/390/768/1024/1440 widths, light/dark, long localized strings, missing photos, true zero/ungraded metrics, empty/error/loading states and keyboard interaction. Physical phones verify safe areas, dynamic browser chrome, input zoom, keyboard/scroll, tap/hover behavior and reduced motion before calling the mobile implementation complete.

Repeat real seeded before/after captures per group and audit them independently. The existing screenshots are baseline evidence, not redesigned mockups. Completed implementation packages get logical Conventional Commits with honest validation; no push or PR without an explicit request. The user's existing deletions and package-lock changes remain outside this audit.

## User-authorized SVG artwork and brand motion (2026-10-10)

The user supplied and authorized editable full-logo/emblem SVGs and animated book/full-logo SVGs, saved under `frontend/src/assets/kitob-svg/`. These supersede PNGs for active logo placements; preserve the original PNG and SVG files as source evidence. SVGs contain vector paths, not live text. Preserve proportions and measured protected margins. Theme-specific color adjustments are authorized where needed; inspect both themes rather than automatically adding a large white backing.

The animated book is the shared activity indicator for page loading and meaningful pending processes. It supplements matching skeleton geometry and a translated loading status; it must not imply progress percentages, replace retained data during refetch, or block keyboard use. Use restrained size and stable layout.

The full supplied logo animation loops in the desktop 50/50 login brand composition and the existing invitation/account-activation experience at `/verify-email`; there is no new public registration route. On phones prioritize the form and use compact static branding rather than adding a large animated panel. Keep both original animations unchanged as source assets and author a deliberate derivative if needed: their supplied CSS currently plays once, so looping must preserve the coordinated sequence rather than independently repeating every part with mismatched durations.

This explicit user request supersedes the earlier prohibition of repeating brand/loading animation ONLY for these supplied assets and placements. Asset-internal CSS sequence timings are a bounded exception to the 150/200ms control/surface vocabulary. Other UI motion remains CSS-only150ms interactive/200ms occasional surfaces, motion-safe and immediate keyboard operation. No motion/WebGL library, pointer tracking, animated numbers or unrelated decorative effects. Reduced motion receives a static readable logo/emblem with no shine, stagger or looping. Stop activity motion when the process ends; never persist passwords or replay via timers that remount forms. Verify real renders and reduced-motion behavior; do not claim a static screenshot proves the loop.

## Current implementation execution policy (2026-10-12)

The user authorized fresh **Gemini 3.8 Flash high** conversations per coherent subgroup, with the same conversation reused for that subgroup’s tasks and corrections. See [the persistent subgroup map and recovery instructions](../redesign-execution/SUBGROUPS.md). This supersedes one-conversation-per-group execution, preserves sequential task dependencies and every design/verification requirement, and does not reopen completed work. Live implementation status and session IDs are in [the execution ledger](../redesign-execution/ledger.json); historical audit status above describes the original planning stage.
