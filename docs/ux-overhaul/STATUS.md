# KITOB UX Overhaul Status

Plan: `PLAN.md`. One row per task; updated by the orchestrator only.

| ID | Title | Branch | Status | Evidence / notes |
|---|---|---|---|---|
| UX-0 | Graphite dark theme | cherry-picked onto master | accepted | 211a2e2, fbf3b8e; AA contrast test |
| UX-1 | Single page header and back link | kitob/ux-1-header | accepted | merged bde1827 |
| BE-1 | Russian code-first emails | kitob/be-1-email | accepted | merged 26e85ca |
| UX-2 | Single-screen journal | kitob/ux-2-journal | accepted | merged; follow-ups 165f66c, 326f2b3, 498bc2c |
| UX-3 | Course schedules, 24h dates, Today block | kitob/ux-3-courses | accepted | merged; follow-up 9ac337e |
| BE-2 | Telegram one-time parent link codes | kitob/be-2-telegram | accepted | merged; migration be2a1b2c3d4e; bot polling runner |
| BE-3 | Exam results to parents | kitob/be-3-exam-results | accepted | 0c550c4; migration be3a1b2c3d4e; 988 backend passed (isolated pod); live send pending a linked chat; exam 0 treated as cleared |
| SC-1 | Score-first backend | kitob/sc-1-score-backend | accepted | merged 0efe09f; migration 5c1b0a7e9d21 after rwp30; backend 1088 passed (Codex, disposable pod); master build 0, vitest 1666 passed; dev DB migrated; exam 0 still means not graded |
| UX-5a | Design system primitives | kitob/ux-5a-design-system | accepted | 76d3395, d1adb2b; merged 7e0157f; master build 0, vitest 1653 passed; guard allowlist 31 entries to burn down in UX-5b/c/d |
| UX-5b | Admin list pages | kitob/ux-5b | accepted | merged 24113de; master build 0, vitest 181 files / 1715 tests passed; design guard allowlist now empty; audit fixes: mobile payments cards, activity time, search placeholders; 36 screenshots reviewed by executor, orchestrator viewed payments mobile |
| UX-5c | Detail pages | kitob/ux-5c | accepted | merged 3c70ac7; build 0; screenshots desktop light/dark + mobile reviewed; full master vitest later green (1715 passed); student Progress/Documents tabs and parent-link popover not screenshotted |
| UX-5d | Mentor and student experience | kitob/ux-5d | accepted | merged 6a256c0 after audit fix ba71c11; master build 0, vitest 1656 passed; follow-up: use BE-4 class averages in student chart |
| FIN-1a | Debt reminders backend | kitob/fin-1a-debt-reminders | accepted | merged 4fd209f (incl. 9d785dd bulk-query fix); backend 1124 passed + 2 env failures; migration rechained after rwp37 (812f4ba), single head, local DB upgraded |
| BE-4 | Student endpoints scoped to the caller (privacy) | kitob/be-4-student-privacy | accepted | merged into master; targeted backend 26+9 passed on disposable pod, contract regenerated (87 endpoints); full backend suite and frontend gates not rerun; student my_rank is 0 when ungraded (master rule) |
| FIN-1b | Debt reminders UI | kitob/fin-1b-debt-reminders | accepted | merged; master build 0, vitest 182 files / 1724 passed; screenshots desktop light/dark + mobile (mock data); live Telegram walk-through left to QA-1; bulk button applies to visible page only |
| FE-R34 | Course chart contract synchronization | kitob/fe-r34-chart-contract | accepted | merged; master build 0, vitest 182 files / 1730 passed; types/tests only, endpoint has no production caller; deferred: show BE-4 class averages in student chart (needs new visible design and copy) |
| FE-R35 | Autosave batching and comment limits | kitob/fe-r35-autosave-bounds | accepted | merged; master build 0, vitest 183 files / 1744 passed; <=250 cells/request, 1000 code-point comment limit (editor only); JournalQueueOwner split into 5 files <20KB; retry test uses flush not retryManual; 413/422 path untested |
| FE-R40 | Bounded student history consumers | — | blocked | Audited candidate49487ba; full backend gate pending. Migrate actual detail/dashboard/progress consumers to bounded paging; PLAN.md has exact contract. No frontend checks. |
| FE-R41 | Student-visible mentor card | — | blocked | Await audited WP41 role-specific contract; public identity and enrolled course projection only. Frontend owner; scope/tests in PLAN.md. |
| FE-R49 | Canonical phones and strict settings | — | blocked | Await integrated WP49 contract; legacy prefills and request validation need frontend owner changes. Scope/tests in PLAN.md; no frontend checks. |
| QA-1 | Full regression | — | pending | needs all |
