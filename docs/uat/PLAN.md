# UAT fix plan

Source: eight real-user test passes on 2026-10-22/23 against a disposable stack built from master `86c9c5f`.

| Pass | Area |
|---|---|
| T1 | auth and account |
| T2 | superadmin people |
| T3 | courses |
| T4 | mentor journals |
| T5 | finance |
| T6 | student cabinet |
| T7 | notifications and documents |
| T8 | security, mobile and i18n sweep |

Raw reports live in `~/.local/state/imkon-remediation/uat/findings/T<n>.md`, outside Git, with screenshots next to them. Finding ids below (e.g. `T6-01`) refer to those reports.

Progress is tracked only in [STATUS.md](STATUS.md). Each task:
- gets one executor in its own worktree off `master`;
- is audited by the orchestrator (diff, tests, screenshots, then a retest on the UAT stack);
- is merged into `master` once approved.

AGENTS.md applies in full.

## Severity summary

| Severity | Count |
|---|---|
| BLOCKER | 1 |
| MAJOR | about 40 |
| MINOR and POLISH | about 75 |

What held up, with no finding:
- Authorization across roles and IDOR.
- Payments, idempotency, void and refund.
- Lockout and double-submit guards.
- Lesson dates and totals.
- Autosave and concurrency.
- Dark mode, and most of mobile and i18n.

Data note: every seeded journal entry has `is_graded = false` (T3-16). That one seed defect explains every "—" average and "0 of N graded" seen on seed courses.

## Tasks

Owners: **BE** is backend (Codex gpt-6.1-sol medium, or Sonnet if its quota runs out). **FE** is frontend (Sonnet 5.5 medium).

### U01 BE: seed marks graded data as graded
- Findings: T3-16, T4-08.
- Change: `scripts/demo_data_populator.py` sets `is_graded` on entries and summaries that hold scores.
- Test: seeded metrics are non-empty.

### U02 BE: auth correctness and sessions
- **Email normalisation** (T1-01, T2-01):
  - Emails are stored and looked up lowercased and trimmed.
  - An expand migration backfills lowercase emails and adds a unique index on `lower(email)`.
  - It reports duplicates instead of merging them.
- **Wrong current password** (T1-03, T2-10): returns 400 with a stable code, not 401.
- **Refresh rotation** (T1-02, T3-17, T8-09):
  - A short grace window lets parallel tabs use the just-rotated token.
  - Reuse after the grace window revokes the whole token family.
- **Logout** (T1-09, T8-09): revokes the current access token through a jti deny-list in Redis.
- **Reset of a never-onboarded user** (T1-04): clears `must_set_password`.
- **Reset-verify responses** (T1-06): identical for known and unknown accounts.
- **Password policy** (T1-07, T8-08):
  - A new password needs at least 8 characters and must not be on the common-password list.
  - A 6-character SMS code becomes a one-time credential that forces a password change.

### U03 FE: auth and session UX
- **Change password**: a 400 from change-password shows an inline "current password is wrong"; it never logs the user out.
- **Cross-tab refresh** (T1-02): one refresh at a time across tabs, using `navigator.locks` or BroadcastChannel.
- **Backend outage on refresh** (T1-08): shows a retryable message instead of silently going to `/login`.
- **SMS code input** (T1-05): normalised to uppercase with spaces removed.
- **Set-password screen** (T1-11): gets a sign-out exit.
- **Small fixes:**
  - `<html lang>` follows the UI language (T6-13, T1-14).
  - The raw key `errorTryAgain` is fixed (T8-02).
  - Profile save errors are mapped (T1-13).
  - Landing and home redirects are consistent (T1-12).

### U04 BE: journals and attendance truth
- **Future lessons** (T4-01): cannot be graded or marked present; the API returns 422.
- **Invalid cells** (T4-14): a non-lesson date, an unknown student or a student from another course returns 422, not 409.
- **Future lessons in counts** (T6-02, T6-03, T4-07): attendance %, absences, the grading queue and "marked" counts all exclude them.
- **Graded vs. zero** (T4-02): `is_graded` is exposed per entry so the grid can tell "not graded" from "graded 0".
- **Class journal for students** (T6-01): closed as intended by decision D1; students keep seeing classmates' names and scores.

### U05 FE: journal grid and charts
- **Grid cells** (T4-02): shows "not graded" and "0" differently, and the picker offers 0.
- **Exam/Bonus inputs** (T4-03): show their maximum in the column header, show inline validation messages and keep the draft.
- **Other grid fixes:**
  - The conflict dialog loads the server value itself (T4-04).
  - Tajik month names (T4-05).
  - The period settings dialog is shortened and enforces the same limits as the server (T4-06).
- **Charts:**
  - Ungraded periods are gaps, not 0 (T3-14, T3-01).
  - The Performance tab defaults to the current graded period (T3-01).
  - The student class-average line uses `class_avg_score` (T6-04).
- **Polish:** archived-course handling, mobile, the denied page and chart tooltips (T4-10, T4-12, T4-13, T4-15, T8-13).

### U06 BE: course and people lifecycle guards
- **Course delete** (T8-07, T3-05):
  - Blocked while there are active enrollments or open charges; the API returns 409 with counts.
  - When allowed, it withdraws enrollments and cancels unpaid future charges in one transaction.
- **Mentor delete** (T2-03): blocked while the mentor owns active courses.
- **Deleted students' debt** (T2-03): excluded from debtors and dashboard totals.
- **Re-enrolment** (T2-04): a withdrawn student can be re-enrolled; the enrollment is reactivated with a new schedule.
- **Course mentor** (T3-04): must be an active user with the mentor role.
- **Blank or tag-only names and titles** (T3-04, T8-06): rejected.
- **Duplicate course** (T3-09): by default copies without students; new dates are optional.
- **Course date edits** (T3-06): return a translated, specific error when journals already exist.
- **Organisation name** (T2-14): gets a length limit.

### U07 BE: audit coverage
- **Coverage** (T2-02): user create/edit/delete, enroll and withdraw, course create/edit/delete, and settings changes write audit entries with the target id and label.
- **Search** (T2-07): audit search matches target labels as well as actors.

### U08 BE: server-side search and ordering
- **Full-name search** (T2-05, T3-10, T5-15): first + last name, case-insensitive, for students, mentors, roster, enroll candidates and debtors.
- **Courses list** (T3-02): server-side search, sort and a deterministic `ORDER BY`.
- **Debtors** (T5-05): server-side search.

### U09 FE: lists, search and people admin
- **Search wiring**: uses the server search and sort from U08 for courses, debtors and people (T3-02, T5-05).
- **Save errors** (T2-06): field errors are mapped and translated.
- **Resend password** (T2-11): double-click guard.
- **Repeated UI** (T2-18, T8-11, T5-11, T8-10): removed per the minimal-UI rule.
- **Audit page** (T2-12, T2-13): translated, with no raw tokens.
- **Profile tabs** (T2-08): mentor and student numbers agree.
- **Account access dialog** (T2-15): mentors get a resend-credentials action.
- **Courses list** (T3-03): status filter "upcoming" and consistent labels.
- **Course form and profile** (T3-12, T3-13, T3-11, T6-14): polish.

### U10 BE: money input validation
- **Amounts** (T5-02, T5-04, T5-06): `NaN`, `Infinity` and exponent notation are rejected with 422, as are amounts with more than 2 decimals.
- **Payment dates** (T5-03): must be timezone-aware; no future dates beyond today; no dates before the enrollment start minus a configured tolerance.
- **Comments** (T5-07): limited to 500 characters.
- **Errors** (T8-05): out-of-range integer ids and NUL characters return 422 JSON, not a plain-text 500, handled centrally for all routers.

### U11 FE: finance screens
- **Accountant actions** (T5-01): void, refund, discount, credit allocation and a student ledger drawer, using the existing endpoints.
- **Payment modal** (T5-06): validates 2 decimals.
- **Accountant redirect** (T5-08): an accountant on `/my/courses` is redirected.
- **Money format** (T5-13, T3-15, T8-12): localized through `formatters.ts`.
- **Mobile** (T5-14, T8-01): fix the overflow.
- **Filters** (T5-12): fix them.
- **Price label** (T3-08, T2-19): "TJS / mo" becomes the course total, with the instalment count shown separately.
- **Reminders** (T5-09): the Remind button is enabled when the debtor has a parent or student phone, and its tooltip says whether the reminder goes by Telegram or SMS (U16).

### U12 BE: notifications and message language
- **Message language** (T7-10, T2-16, T1-10): email and SMS templates render in the recipient's language (`en`/`ru`/`tg`, defaulting to the organisation language), and so does the email footer.
- **Credential email link** (T7-11): includes a set-password link built from the configured frontend URL.
- **Delivery log** (T2-17, T7-08): covers email and SMS deliveries as well as Telegram, or is labelled Telegram-only. Unsent outbox items are not shown in the inbox.

### U13 FE: notifications UI
- **Delivery status chips** (T7-07): queued, in-flight, sent and failed each get their own colour and translated label.
- **Inbox times** (T7-08): rows without `sent_at` show their queued time.
- **App shell** (T7-12): shows the current user's avatar and name.

### U14 BE+FE: uploads and documents
- **Document owners** (T7-04): must be an existing user of an allowed role.
- **Document types** (T7-05): SVG and HTML-as-text are rejected.
- **Avatars**:
  - WEBP accepted (T7-01).
  - A clear message for oversized dimensions (T7-02).
  - A remove action (T7-03).
- **Course images** (T7-06): validated and resized like avatars.
- **Documents empty state** (T7-09): copy trimmed.

### U15 FE: student cabinet
- **Home page** (T6-06, T1-12): one home page.
- **Repeated title** (T6-07): the course title is shown once.
- **Labels** (T6-09, T8-03): numbers are labelled.
- **Rank** (T6-10): shown with a tooltip.
- **Phone-only students** (T6-11): they see the right sign-in field and copy.
- **Empty-state flash** (T6-12): no flash on redirect.
- **Mobile** (T6-08): fixed.
- **Authorization edge cases** (T8-04):
  - Wrong-role pages redirect instead of firing repeated 400s.
  - A 403 is not retried.

### U16 BE: SMS fallback for debt reminders (decision D3)
- **Fallback** (T5-09): when no parent Telegram is linked, a debt reminder goes by SMS through the outbox to the parent phone, or the student phone if there is no parent phone.
- **Rate limit**: at most one reminder per enrollment per configured interval, whatever the channel; a repeat inside the interval returns 429 with a stable code.
- **Message**: rendered in the recipient's language (after U12), with the amount formatted as money.
- **No phone and no Telegram**: 422 with a stable code, so the UI can explain it.
- Tests never call a real SMS gateway.

## Owner decisions

| Id | Question | Decision (2026-10-23) |
|---|---|---|
| D1 | T6-01: may a student see classmates' names and scores in the class journal? | Keep as is. T6-01 is closed as intended. |
| D2 | T6-05: should students see their own balance, due dates and payment history? | No student finance. T6-05 is closed. |
| D3 | T5-09: debt reminders when no parent Telegram is linked? | SMS fallback through the outbox, rate-limited (U16). |
| D4 | T5-10: what happens to charges when a student withdraws? | Pending: question re-asked in plain words. |

Deferred, not planned without a request:
- Late/excused attendance (T4-09).
- Editing price and schedule after creation (T3-07, which affects issued charges).
- Restoring deleted users (T2-09).
- Private static avatars (T6-15; the known WP-26 gap).
- Autosave latency of 0.6–2.3 s (T4-11; measure again after U04).

## Order and ownership

Executors that run at the same time must have disjoint files. Migrations run one at a time; U02 owns the only planned migration.

**Wave 1:**
- U01 runs alone (seed).
- The other Wave 1 tasks can run together: U02 (auth BE), U04 (journals BE), U06 (lifecycle BE), U10 (money BE), U03 (auth FE) and U13 (notifications FE).

**Wave 2**, once its backend contracts are merged:
- U05 (after U04).
- U07 and U08 (BE).
- U09 (after U08).
- U11 (after U10).
- U12, then U14.
- U16 (after U12 and U10).

**Wave 3:** U15, then the D4 follow-up once decided.

When the plan is done:
1. Run the full backend suite once on master.
2. Run `vitest` and `tsc -p tsconfig.app.json`.
3. Reseed the UAT stack and run a short re-test pass on every closed MAJOR.
