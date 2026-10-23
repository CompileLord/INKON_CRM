# UAT fix status

This is the only record of progress on [PLAN.md](PLAN.md). The orchestrator updates it after auditing each task. A task is `done` only when all of these hold:
- the diff has been reviewed;
- the tests named in the row passed;
- screenshots or a UAT retest confirm the fix;
- the branch is merged into `master`.

| Task | Owner | Status | Branch | Date (UTC) | Checks | Notes |
|---|---|---|---|---|---|---|
| U01 seed graded flags | BE | in progress | uat/u04 | 2026-10-23 | — | bundled with U04 |
| U02 auth correctness and sessions | BE | merged, retest pending | uat/u02 | 2026-10-23 | test_uat_u02 + auth files 113 passed; full suite on branch: only known wp11/wp13 | deny-list fails open (audit fix c473641) |
| U03 auth and session UX | FE | audit: follow U02 contract | uat/u03 | 2026-10-23 | — | logout bearer, SMS-code route, password policy |
| U04 journals and attendance truth | BE | audit: changes requested | uat/u04 | 2026-10-23 | — | future-lesson subtraction bug; SQL in service |
| U05 journal grid and charts | FE | todo | — | — | — | after U04 |
| U06 course and people lifecycle guards | BE | in progress | uat/u06 | 2026-10-23 | — | splitting finance_service.py for the 20 KB hook |
| U07 audit coverage | BE | in progress | uat/u07 | 2026-10-23 | — | Codex |
| U08 server-side search and ordering | BE | todo | — | — | — | — |
| U09 lists, search, people admin | FE | todo | — | — | — | after U08 |
| U10 money input validation | BE | merged, retest pending | uat/u10 | 2026-10-23 | finance/enrollment/wp69a 220 passed; full suite on branch: only known wp11/wp13 | date window moved behind repository (audit fix 71a5c8a) |
| U11 finance screens | FE | todo | — | — | — | after U10 |
| U12 notifications and message language | BE | in progress | uat/u12 | 2026-10-23 | — | Codex |
| U13 notifications UI | FE | merged, retest pending | uat/u13 | 2026-10-23 | tsc clean; vitest targeted pass | screenshots reviewed |
| U14 uploads and documents | BE+FE | todo | — | — | — | — |
| U15 student cabinet | FE | todo | — | — | — | D2: no student finance |
| U16 SMS fallback for debt reminders | BE | todo | — | — | — | D3; after U12 |
| D4 withdrawal and charges | — | waiting | — | — | — | owner decision pending |
