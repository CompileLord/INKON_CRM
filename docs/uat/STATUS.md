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
| U05 journal grid and charts | FE | audit: changes requested | uat/u05 | 2026-10-23 | tsc clean; targeted vitest 431 passed; full vitest pending | grid accepted; chart shots stale (pre-19fe1e0), legend misses a student, mobile names truncated; BE gap: staff-progress has no graded flag |
| U06 course and people lifecycle guards | BE | cancelled | uat/u06 (unmerged) | 2026-10-23 | — | owner: admin can archive/delete a course any time |
| U07 audit coverage | BE | audit: changes requested | uat/u07 | 2026-10-23 | targeted 74 passed; full suite on branch: only known wp11/wp13 | lost old/new values for mentor and email; timestamp override |
| U08 server-side search and ordering | BE | merged, retest pending | uat/u08 | 2026-10-23 | targeted 144 + 118 passed; full suite: known wp11/wp13 + one wp55 flake (passes isolated on both) | newest-first default (050c85f); FE switch in U09 |
| U09 lists, search, people admin | FE | todo | — | — | — | ready; also preferred_language selects (U12), audit field labels (U07) |
| U10 money input validation | BE | merged, retest pending | uat/u10 | 2026-10-23 | finance/enrollment/wp69a 220 passed; full suite on branch: only known wp11/wp13 | date window moved behind repository (audit fix 71a5c8a) |
| U11 finance screens | FE | audit: merge master | uat/u11 | 2026-10-23 | tsc clean; vitest 1952/7 before test fixes | accepted pending master merge and perMonth removal |
| U12 notifications and message language | BE | merged, retest pending | uat/u12 | 2026-10-23 | targeted 127 passed; full suite on branch: only known wp11/wp13 after 5 fixed cases | en/ru/tg messages; preferred_language needs FE (U09); inbox shows delivered only |
| U13 notifications UI | FE | merged, retest pending | uat/u13 | 2026-10-23 | tsc clean; vitest targeted pass | screenshots reviewed |
| U14 uploads and documents | BE+FE | in progress (BE) | uat/u14 | 2026-10-23 | — | Codex BE first, FE after |
| U15 student cabinet | FE | todo | — | — | — | D2: no student finance |
| U16 SMS fallback for debt reminders | BE | in progress | uat/u16 | 2026-10-23 | — | Codex |
| U17 editable weekly lesson times | BE+FE | todo | — | — | — | owner request; after U07 |
| U18 withdrawal cancels future charges | BE+FE | todo | — | — | — | D4 = A (2026-10-23) |
