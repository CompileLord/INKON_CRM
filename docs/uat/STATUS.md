# UAT fix status

This is the only record of progress on [PLAN.md](PLAN.md). The orchestrator updates it after auditing each task. A task is `done` only when all of these hold:
- the diff has been reviewed;
- the tests named in the row passed;
- screenshots or a UAT retest confirm the fix;
- the branch is merged into `master`.

| Task | Owner | Status | Branch | Date (UTC) | Checks | Notes |
|---|---|---|---|---|---|---|
| U01 seed graded flags | BE | merged, reseed pending | uat/u04 | 2026-10-23 | in U04 tests | bundled with U04 |
| U02 auth correctness and sessions | BE | merged, retest pending | uat/u02 | 2026-10-23 | test_uat_u02 + auth files 113 passed; full suite on branch: only known wp11/wp13 | deny-list fails open (audit fix c473641) |
| U03 auth and session UX | FE | merged, retest pending | uat/u03 | 2026-10-23 | tsc clean; targeted vitest 790/791 then fixed file 23/23 | follows U02 contract (8e58897) |
| U04 journals and attendance truth | BE | merged, retest pending | uat/u04 | 2026-10-23 | U04+journal+wp21/39/55 113 passed; full suite on branch: only known wp11/wp13 | audit fixes 405c5a2, 2c4cbe6 |
| U05 journal grid and charts | FE | in progress | uat/u05 | 2026-10-23 | — | charts after WP-58 |
| U06 course and people lifecycle guards | BE | in progress | uat/u06 | 2026-10-23 | — | splitting finance_service.py for the 20 KB hook |
| U07 audit coverage | BE | in progress | uat/u07 | 2026-10-23 | — | Codex |
| U08 server-side search and ordering | BE | todo | — | — | — | — |
| U09 lists, search, people admin | FE | todo | — | — | — | after U08 |
| U10 money input validation | BE | merged, retest pending | uat/u10 | 2026-10-23 | finance/enrollment/wp69a 220 passed; full suite on branch: only known wp11/wp13 | date window moved behind repository (audit fix 71a5c8a) |
| U11 finance screens | FE | in progress | uat/u11 | 2026-10-23 | — | — |
| U12 notifications and message language | BE | in progress | uat/u12 | 2026-10-23 | — | Codex |
| U13 notifications UI | FE | merged, retest pending | uat/u13 | 2026-10-23 | tsc clean; vitest targeted pass | screenshots reviewed |
| U14 uploads and documents | BE+FE | todo | — | — | — | — |
| U15 student cabinet | FE | todo | — | — | — | D2: no student finance |
| U16 SMS fallback for debt reminders | BE | todo | — | — | — | D3; after U12 |
| U17 editable weekly lesson times | BE+FE | todo | — | — | — | owner request; after U06/U07 |
| D4 withdrawal and charges | — | waiting | — | — | — | owner decision pending |
