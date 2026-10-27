# IMKON Master Spec — Owner Decisions, Screenshot Check & Corrections

Part of [`docs/finance-spec/`](README.md). Revision 2, 2026-10-27.

# SECTION 0: Owner Decisions, Screenshot Check & Corrections

## 0.1 Decided

| ID | Decision | Date |
|----|----------|------|
| OD-1 | **A course price is the price for one month.** `Course.price` and `Enrollment.price_at_enrollment` are monthly amounts. Each monthly tuition charge equals the full monthly price. The contract total is `price × number of billed months`. | 2026-10-27 |
| D1 (UAT) | Students see classmates in the journal. | earlier |
| D2 (UAT) | Students see no finance data. | earlier |
| D3 (UAT, U16) | Debt reminders fall back to SMS when no parent Telegram is linked. | earlier |
| D4 (UAT, U18) | Withdrawal cancels future-month charges. | earlier |
| Q1 | Existing divided charges: superseded by L6. Prod has no payments and no active enrollments, so no repair tool is built. The single open 112.50 TJS charge (id 3, withdrawn enrollment 2) is deleted by owner instruction. | 2026-10-27 |
| Q2 | Partial month: full monthly price for every started calendar month, no proration. | 2026-10-27 |
| Q3 | Late enrollment: billing starts from the enrollment month, not the course start month. | 2026-10-27 |
| Q4 | Targeted payment above the enrollment's remaining contract balance is rejected (`422` with the maximum). No silent wallet credit. | 2026-10-27 |
| Q5 | Legacy wallet credit is shown in the payment modal and spent only by explicit "Зачесть в курс…". | 2026-10-27 |
| Q6 | Grant transitions affect future months only (§4.4); current debt stays; reason and audit required. | 2026-10-27 |
| Q7 | Currency label is `TJS` everywhere. | 2026-10-27 |
| Q8 | Dashboard attention block: see §6 (lessons in progress, attendance not marked 10 min after start, absent students). Grades are not checked. No "remind mentor" button in v1. | 2026-10-27 |
| Q9 | Payment day **stays on the student** (one day for all their courses). No enrollment-level column. | 2026-10-27 |
| R-1 | No reminder pause needed (L6): there are no active enrollments on prod. | 2026-10-27 |
| L6 | Phase 0 is the simple variant: fix charge generation only, no repair tool. | 2026-10-27 |
| B-1 | Removed and deleted students must disappear from the course roster (bug reported by owner, §1.0b). | 2026-10-27 |
| R-2 | Seed data cleanup (rename seeded admin, drop Curl/Test records) is allowed on local/UAT only, never prod. | 2026-10-27 |
| R-3 | Read-only production counts (enrollments, charges, payments) are allowed before Phase 0. | 2026-10-27 |

**Consequence of OD-1:** the backend breaks OD-1 today. `FinanceService.generate_schedule_for_enrollment` (`backend/app/services/finance_service.py:478`) treats the price as the whole contract and **divides** it across the months (`base_cents = price_cents // total_months`). A 3-month course priced 500 TJS bills 166.66 + 166.67 + 166.67 instead of 3 × 500. The labels `500.00 TJS / мес` in the UI are already correct. The charges behind them are wrong. This is fixed in Phase 0 (§11) before any other finance work.

## 0.2 Owner questions (all closed 2026-10-27, kept for the reasoning; answers in §0.1)

| ID | Question | Recommendation | Blocks |
|----|----------|----------------|--------|
| Q1 | **Existing undercharged data.** Enrollments created before the Phase 0 fix have divided charges. What happens to them? | Run a dry-run report first: per enrollment, list current charges, correct charges and the difference. Then, for each open or future charge, raise the amount to the monthly price. For past, already paid months, issue a separate audited adjustment charge for the difference. Do not rewrite paid charges. The owner approves the report before the write runs. | Phase 0 data step |
| Q2 | **Partial months.** A course from 15 June to 31 August spans 3 calendar months. Is June a full month's price or prorated? | Full price per started calendar month (current month-count logic, no proration). This is the simplest rule to explain to parents. | Phase 0 |
| Q3 | **Late enrollment.** Today a student who joins in month 2 is billed from the **course** start month, including months already over. | Bill from the enrollment month onward. | Phase 0 |
| Q4 | **Overpayment on a targeted payment.** An admin targets 2 000 TJS at a course whose remaining contract is 1 500 TJS. | Reject amounts above the target enrollment's remaining contract balance, as U18 already does for its flow. The admin splits the rest to another course explicitly. No silent wallet credit for new payments. | Phase 7 |
| Q5 | **Legacy unallocated wallet credit** created before targeting existed. | Leave it in the wallet. Show it in the payment modal as "Нераспределённый остаток" with an explicit "Зачесть в курс…" action that uses the existing `allocate_credit`. Never auto-spend it. | Phase 7 |
| Q6 | **Paid ↔ grant transitions** (§4.4). | As written in §4.4. | Phase 4 |
| Q7 | **Currency label.** Screens mix `TJS` (courses, finance) and `сомони` (student and mentor profiles). | `TJS` everywhere, from one formatter. | Phase 2 |
| Q8 | **Dashboard "attention" items** (§6). Absences and ungraded lessons need definitions (how many absences, which lessons count as ungraded). | Ship debt items only first. Define the other two in a later spec. | Phase 6 |
| Q9 | **Payment day per enrollment** (§5.1). | Move to `enrollments.payment_day_of_month` via expand/contract. Keep the student value as the default during transition. | Phase 5 |

## 0.3 Screenshot check

All files in `docs/audit_screenshots/` were checked against this document. `24_*` is referenced in the numbering but **does not exist**.

| # | File | Matches the spec? | Notes |
|---|------|-------------------|-------|
| 01 | `01_login_page.png` | n/a | Not referenced by any section. No issue found. |
| 02 | `02_forgot_password_page.png` | n/a | Not referenced. The right-hand brand illustration differs between login (cropped wordmark) and reset (full logo). Minor; not scoped here. |
| 03 | `03_dashboard.png` | Yes | §6 claims confirmed: queue jargon, "Автор недоступен", 5 oldest debtors. |
| 04 | `04_students_list.png` | Yes | Problems 36 and 38 confirmed. Every row has a "Не привязан" badge. |
| 05 | `05_student_add_drawer.png` | Yes | §5.1. |
| 06 | `06_student_profile_courses.png` | Partly | Problems 40/41 confirmed. **New:** debt shown as "250.00 сомони" while the rest of the app uses TJS (Q7). Debt amount reflects the divided-price bug (OD-1). |
| 07 | `07_student_profile_performance.png` | **No** | Problem 42 is wrong: the course name appears twice (legend and row), not three times. Problem 43's arrow-key tutorial text is not visible. Both problems are downgraded to "verify in code before fixing". **New bug UX-B1:** this tab shows 3 graded months, while screenshot 06 says 0 of 3 graded. |
| 08 | `08_student_profile_documents.png` | Yes | Problem 44 confirmed: the formats line appears under the title and again in the empty state. |
| 09 | `09_student_edit_drawer.png` | Yes | Same phone format duplication as 05. Email label is "Электронная почта" here and "Email" in the mentor drawer (15): inconsistent labels. |
| 10 | `10_mentors_list.png` | Yes | Problem 11a. |
| 11 | `11_mentor_add_drawer.png` | Yes | Problem 11b: "Формат: +992901234567" hint plus the same value as placeholder. |
| 12 | `12_mentor_profile_courses.png` | Yes | Problem 11c. **New:** price shown as "700.00 сомони" without "/ мес", inconsistent with course cards (Q7). |
| 13 | `13_mentor_profile_performance.png` | **Bug** | Shows "80 graded periods" but 0 points and an average of "—". This is a data or query bug, not a layout problem. Added as Problem 11d. |
| 14 | `14_mentor_profile_documents.png` | Yes | Same duplication as 08. |
| 15 | `15_mentor_edit_drawer.png` | Yes | Label "Email" vs "Электронная почта" in student drawer. |
| 16 | `16_courses_grid.png` | Yes | §3.2. |
| 17 | `17_course_add_drawer.png` | Partly | The price field is labelled "Цена, TJS" without "/ мес". After OD-1 it must say it is monthly. |
| 18 | `18_course_profile_roster.png` | Partly | This is the **Обзор** tab, not a roster. Group average and attendance show "—" for an active course with 8 students. |
| 18b | `18b_course_students_tab.png` | Yes | Problem 15a. Also breaks the Minimal UI rule: "500.00 TJS / мес" is repeated on every row although it is the same for everyone. Show the price once in the header and only show per-row price when it differs (grant or custom fee). |
| 19 | `19_course_enroll_student_modal.png` | Yes | Problem 15b. |
| 20 | `20_course_edit_drawer.png` | **Contradicts §2** | Start and end dates are editable inputs. The price, exam type and schedule are already shown read-only. So Section 2's "time editing is blocked" is true, and dates look editable but fail on save. |
| 21 | `21_journals_list.png` | Yes | No problem described; list is clean. |
| 22 | `22_journal_detail_table.png` | Yes | §3.3. |
| 23 | `23_journal_period_settings_modal.png` | **No** | Shows only the menu item that opens the dialog, not the dialog. Problems 20–22 are based on code and tests, not on this screenshot. A real capture of the dialog is required before Phase 1. |
| 24 | — | Missing | Referenced by numbering only. |
| 25 | `25_finance_dashboard.png` | Yes | Problem 8 confirmed: "Финансы и Оплаты", "Чистые поступления наличными 0.00", row action "Оплата". Totals reflect the divided-price bug. |
| 26 | `26_finance_payment_modal.png` | Yes | Problem 6. |
| 27 | `27_finance_debtors_tab.png` | Yes | Problem 7. |
| 28 | `28_audit_logs.png` | Partly | Likely predates master's U07/U12 audit wording changes. Re-capture on master before Phase 8. |
| 29 | `29_settings_general.png` | Partly | Shows Profile only. "О приложении" and "Неизвестно" (Problem 50) are not in any screenshot. |
| 30 | `30_settings_quick_drawer.png` | **No** | File name says quick-settings drawer, but it shows the **notifications bell popover**. Problem 48 is confirmed in code (`QuickSettingsChanger.tsx` has no link to `/settings`), not by this screenshot. |
| 31 | `31_notifications_page.png` | Yes | §9. |

## 0.4 Corrections to revision 1

| Rev. 1 claim | What the code does | Correction |
|---|---|---|
| Problem 1/3: "surplus silently pays all other courses". | `auto_allocate_student_credit` first pays **all** open charges of the preferred enrollment (no due-date filter, so future months too), then spills to other courses. Spillover only happens beyond the whole remaining contract. It also runs without a preference after `create_adjustment`, and on enrollment creation, where a new course consumes existing wallet credit. | Rewritten in §1.1. |
| Problem 4: teacher commissions. | No commission model exists. | Removed. |
| Problem 5: void reopens other courses' charges. | `void_payment` reverses that payment's allocations. It does not re-allocate. Charges it had paid on another course (through spillover) reopen, which is the expected effect of spillover, not a separate bug. | Folded into Problem 1. |
| Risk 4: add `target_enrollment_id` to `ledger_entries`. | One payment can target several courses. | Child table, §1.3. |
| §2: dates editable but crash. | `CourseService` blocks date edits only when journals exist, and journals are generated at course creation, so dates are always locked in practice. | Dates read-only in edit mode. |
| §4.3 "enrollment (or student)" vs §5.1 grant toggle in the student form. | A grant applies to one enrollment. | Enrollment only. |
| §5.1 "anachronistic Payment Day". | `payment_day_of_month` drives charge due dates and appears in `_debt_query` output. | Kept on the student (Q9). |
| File paths `components/enrollments/EnrollmentModal.tsx`, `components/students/StudentProfileHeader.tsx`. | Do not exist. | `components/courses/EnrollStudentModal.tsx`, `components/student/StudentProfileHeader.tsx`. |
| Risk 1 mixes chart and dialog test ids. | `data-testid="chart-tooltip"` belongs to the chart, not the dialog. | §10 R1. |
| §3.3 "aggressive 150 ms snap"; proposed 250 ms custom curve. | AGENTS.md §5 requires 150 ms `ease-out` for interactions. | Keep 150 ms `ease-out`. |
| §8 Problem 48 evidenced by screenshot 30. | Screenshot 30 is the notifications popover. | Evidence is code only. |

## 0.5 Logic review of the decisions (2026-10-27)

| ID | Issue | Resolution in this spec |
|----|-------|-------------------------|
| L1 | **"Not marked" and "absent" look the same in the data.** `JournalEntry` rows are pre-created at enrollment with `attendance=false`, `is_graded=false` (`enrollment_service.py:138`). A naive "attendance = false" query reports every student as absent before the mentor opens the journal. | Defined in §6: a row is *marked* when `is_graded IS TRUE` (set on any save). *Not marked* = all rows of that lesson still `is_graded = false`. *Absent* = `is_graded = true AND attendance = false`. Consecutive absences count only marked lessons. |
| L2 | **First due date ignores late enrollment.** Code uses `course.start_date` for both the first month and `max(due_date, start_date)`. With Q3 the schedule must start at the enrollment month. | Phase 0: month count starts at the enrollment month; first due date = `max(payment day in that month, enrollment date)`. Payment day comes from the student (Q9). |
| L3 | **Q2 + Q3 edge case.** Enrolling on 28 August into a course that ends 31 August costs a full month. This follows the decisions but will surprise admins. | Enroll modal shows the first charge and the number of billed months before confirming. No proration. |
| L4 | **Grant enrollment and price validation.** `price_at_enrollment` must be positive, but a grant has no charges. | Grant keeps `price_at_enrollment` = course price (reference only, shown as "Грант" in UI); `billing_mode=grant` skips charges. Custom fee and grant are mutually exclusive in the modal. |
| L5 | **Withdrawn student's current month.** With D4 + Q2, withdrawal cancels future months but the current month stays at full price. Prod already has this case: one open 112.50 TJS charge on a withdrawn enrollment. `ChargeBalanceQuery` needs an active enrollment, so no reminder goes out, but the debt still counts in finance totals. | Intended. Debtors list marks such rows "Отчислен". The 112.50 charge goes to the owner in the Phase 0 report. |
| L6 | **Phase 0 safeguards may be heavier than the data needs.** Prod has 0 payments and 0 active enrollments. A reusable repair tool and a reminder pause protect against a situation that does not exist today. | Decided: (b). Generation fix only; the 112.50 charge was deleted on owner instruction. If real enrollments with payments appear before Phase 0 deploys, stop and revisit. |
| L7 | **Holidays and cancelled lessons.** There is no lesson-cancellation concept, so on a holiday every scheduled lesson shows "attendance not marked". | Accepted for v1. Each attention row has "Скрыть на сегодня" (per admin, client-side). A lesson-cancellation feature is a separate spec. |
| L8 | **"Now" and lesson times.** Lesson times are stored without zone. | Compare against `datetime.now(ZoneInfo(settings.TIMEZONE))` (Asia/Dushanbe), the same helper as `school_calendar.py`. |
| L9 | **Q5 has no prod data.** Legacy wallet credit only exists in local/UAT data. | Keep the cheap UI (show + manual allocate); no migration work. |
| L10 | **Attention block depends on correct lesson times.** It reads `time_start`/`time_end`, which only become editable with U17. | Phase 6 starts after U17 is merged. |
