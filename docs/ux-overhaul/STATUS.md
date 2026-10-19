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
| SC-1 | Score-first backend | kitob/sc-1-score-backend | in progress | |
| UX-5a | Design system primitives | kitob/ux-5a-design-system | accepted | 76d3395, d1adb2b; merged 7e0157f; master build 0, vitest 1653 passed; guard allowlist 31 entries to burn down in UX-5b/c/d |
| UX-5b | Admin list pages | — | pending | needs UX-5a, SC-1 |
| UX-5c | Detail pages | — | pending | needs UX-5a, SC-1 |
| UX-5d | Mentor and student experience | — | pending | needs UX-5a, SC-1 |
| FIN-1a | Debt reminders backend (Codex gpt-6.1-sol) | kitob/fin-1a-debt-reminders | pending | needs SC-1 merged (migration chain) |
| FIN-1b | Debt reminders UI | — | pending | needs FIN-1a, UX-5b |
| QA-1 | Full regression | — | pending | needs all |
