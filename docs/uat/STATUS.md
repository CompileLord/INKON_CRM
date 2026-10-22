# UAT fix status

This is the only record of progress on [PLAN.md](PLAN.md). The orchestrator updates it after auditing each task. A task is `done` only when all of these hold:
- the diff has been reviewed;
- the tests named in the row passed;
- screenshots or a UAT retest confirm the fix;
- the branch is merged into `master`.

| Task | Owner | Status | Branch | Date (UTC) | Checks | Notes |
|---|---|---|---|---|---|---|
| U01 seed graded flags | BE | in progress | uat/u04 | 2026-10-23 | — | bundled with U04 |
| U02 auth correctness and sessions | BE | in progress | uat/u02 | — | — | — |
| U03 auth and session UX | FE | in progress | uat/u03 | — | — | — |
| U04 journals and attendance truth | BE | in progress | uat/u04 | — | — | D1 pending |
| U05 journal grid and charts | FE | todo | — | — | — | after U04 |
| U06 course and people lifecycle guards | BE | in progress | uat/u06 | — | — | — |
| U07 audit coverage | BE | todo | — | — | — | — |
| U08 server-side search and ordering | BE | todo | — | — | — | — |
| U09 lists, search, people admin | FE | todo | — | — | — | after U08 |
| U10 money input validation | BE | in progress | uat/u10 | — | — | — |
| U11 finance screens | FE | todo | — | — | — | after U10; D3 pending |
| U12 notifications and message language | BE | todo | — | — | — | — |
| U13 notifications UI | FE | in progress | uat/u13 | — | — | — |
| U14 uploads and documents | BE+FE | todo | — | — | — | — |
| U15 student cabinet | FE | todo | — | — | — | D2 pending |
| D1–D4 decision follow-ups | — | waiting | — | — | — | owner decision |
