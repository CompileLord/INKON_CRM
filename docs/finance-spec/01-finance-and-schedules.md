# IMKON Master Spec — Finance, Payment Allocation & Course Schedules

Part of [`docs/finance-spec/`](README.md). Revision 2, 2026-10-27.

# SECTION 1: Finance & Multi-Course Payment Allocation

### Files Involved
* Backend: `backend/app/services/finance_service.py`, `backend/app/services/enrollment_service.py`, `backend/app/schemas/payment.py`, `backend/app/schemas/common.py`, `backend/app/schemas/course.py`, `backend/app/models/ledger.py`, `backend/app/models/allocation.py`, `backend/app/models/charge.py`, `backend/app/models/enrollment.py`
* Frontend: `frontend/src/pages/Finance.tsx`, `frontend/src/components/finance/OverviewSummary.tsx`, `PaymentEntryDialog.tsx`, `PaymentModal.tsx`, `PaymentCourseField.tsx`, `PreviewPanel.tsx`, `DebtorsTab.tsx`, `DebtorRow.tsx`, `DebtorDetails.tsx`, `PaymentDetailDialog.tsx`, `CourseBalanceRow.tsx` (all under `frontend/src/components/finance/`)
* Locales: `frontend/src/i18n/locales/{en,ru,tg}/finance.json`

### Reference Screenshots
* `25_finance_dashboard.png`, `26_finance_payment_modal.png`, `27_finance_debtors_tab.png`

### 1.0 Monthly Price Semantics (Phase 0)
1. `generate_schedule_for_enrollment` creates one tuition charge per billed month, each equal to `price_at_enrollment`. Remove the cent-splitting logic and its docstring.
2. `InstallmentPriceInput` / `validate_installment_price`: the rule "at least one cent per monthly installment" becomes "price is positive money". Update the error text.
3. Billing months and due dates follow §1.0a.

### 1.0a Billing Rule (Q2, Q3, Q10)
* **Course month k** starts at `start_date + k months` (computed from the original start date each time, clamped to the month length, so a 31st start gives 30.04, 31.05 …). Course months that start on or after `end_date` are not billed.
* **Billed months:** from the course month that contains the enrollment date (or the course start, if enrolled before it) to the last course month. Each gets one charge equal to `price_at_enrollment`.
* **Due date:** the first date on or after the course month's start whose day equals the student's `payment_day_of_month` (clamped to the month length). For the first billed month of a late enrollment: if that date is before the enrollment date, it is due on the enrollment date.
* No course month ever gets two due dates, and no course month is skipped.

| Course | Payment day | Due dates |
|---|---|---|
| 19.10–19.01 | 26 | 26.10, 26.11, 26.12 |
| 19.10–19.01 | 5 | 05.11, 05.12, 05.01 |
| 21.10–21.11 | 26 | 26.10 |
| 01.06–31.08 | 26 | 26.06, 26.07, 26.08 |
| 19.10–19.01, enrolled 05.11 | 26 | 05.11, 26.11, 26.12 |

These rows are the backend test table for Phase 0.
4. Every UI place that shows `price_at_enrollment` as a contract total must say "в месяц" or show `price × months`. Known place: `DebtorDetails.tsx` labels it `debtorsTab.contracted`.
5. Course form price label: "Цена в месяц, TJS".
6. No data repair tool (L6). Before deploying, re-run the read-only prod count; if any active enrollment with charges exists, stop and ask the owner.

**Before starting Phase 0:**
1. Q1–Q3, Q10 and L6 are decided (§0.1): course months from the start date, billing from the course month of enrollment, no repair tool.
2. **Production (read-only check 2026-10-27):** 3 live courses, 7 students, 2 enrollments (both withdrawn), 0 payments. The open 112.50 TJS charge was deleted on owner instruction; the other 5 charges are cancelled.
3. **Expect many existing tests to change.** About 18 backend integration test files reference schedule generation or cent splitting (`test_finance_precision.py`, `test_finance.py`, `test_finance_redesign.py`, several `test_remediation_wp*.py`). Each test that asserts a divided amount is updated to the monthly rule, not deleted. The cent-remainder tests go away with the remainder logic.
4. **Other readers of `price_at_enrollment`:** `debt_reminder_repository.py:119` (reminder payload) and the debtor "contracted" field. Any text that presents it as a total must say "в месяц".
5. Invalidate the analytics cache through the existing `_invalidate_cache()` path (already called by schedule generation).

**Acceptance:** a 3-month course at 500 TJS produces three 500.00 charges; a backend test fails if any charge differs from the monthly price; the §1.0a table passes as written.

### 1.0b Removed Students Still in the Course Roster (B-1, Phase 0)
Reported by the owner on production. Cause, from the code:
* `EnrollmentRepository._build_roster_filter_criteria` filters only `Enrollment.is_deleted`. It does not exclude soft-deleted users (`User.is_deleted`), and with no status filter it returns withdrawn enrollments too. The roster's default status filter is "Все".
* `UserService.delete_user` only soft-deletes the user. Their active enrollments stay `active`, so a deleted student keeps appearing in rosters and journals, keeps open charges and still counts in debt totals and reminders.

Fix:
1. Deleting a student withdraws every active enrollment in the same transaction, using the existing withdrawal path (D4/U18: future charges cancelled, audit event).
2. Roster query always excludes soft-deleted users. Default roster status is **active**; withdrawn students are visible only via the "Отчисленные" filter, with an "Отчислен" badge.
3. Course student counts (course cards, roster header, mentor "Активных студентов") count active enrollments of non-deleted users only.
4. Journals hide soft-deleted students; withdrawn students keep their past rows read-only (history is preserved).

Tests: delete a student with an active enrollment → enrollment withdrawn, future charges cancelled, not in default roster, not in counts, no reminder; withdraw a student → not in default roster, visible with the "Отчисленные" filter.

### 1.1 How Allocation Works Today
1. Admin picks a student and one course (`PaymentCreate.course_id`).
2. `create_payment` writes a `LedgerEntry` with only `student_id`, then calls `auto_allocate_student_credit(student_id, prefer_enrollment_id=…)`.
3. Pass 1 pays **every** open charge of the preferred enrollment, oldest due date first, including future months.
4. Pass 2 pays open charges of the student's other enrollments.
5. The remainder stays as unallocated wallet credit.
6. The same function also runs:
   - when a new enrollment's schedule is generated: the new course consumes existing wallet credit;
   - after `create_adjustment`, with no preference.
7. `void_payment` reverses the payment's allocations and does not re-allocate.

### 1.2 Problems
* **Problem 1 (Implicit cross-course allocation):** money paid for course A can end up on course B through Pass 2, through a later enrollment consuming wallet credit, or through an adjustment. The admin never confirms it. Voiding then reopens charges on a course the admin never chose.
* **Problem 2 (No multi-course split):** one receipt cannot record 500 TJS for English and 500 TJS for Math.
* **Problem 6 (Payment modal shows no debt):** no per-course debt, installment state or remaining balance. When opened from a debtor row the amount is empty.
* **Problem 7 (Tall debtor rows):** 5–6 lines per student with repeated sentences ("Напоминаний ещё не было", "Родитель не привязан в Telegram").
* **Problem 8 (Misleading names):**
  - Title "Финансы и Оплаты" → **«Финансы»**.
  - Tile "Чистые поступления наличными" counts every method (`collected_in_period`) → **«Собрано за период»**.
  - Header "Принять платеж", modal "Принять оплату", row "Оплата" → one verb, **«Принять оплату»** / row **«Оплатить»**.
  - Debtors tab repeats "Список должников" inside the "Должники" tab.
* **Problem 9 (No receipt action):** `PaymentDetailDialog.tsx` shows the receipt number but has no print/download action. `get_payment_receipt` already exists in the service.

### 1.3 Target Design

**Data model (expand/contract):**
* New table `payment_targets`: `id`, `ledger_entry_id` (FK, payment), `enrollment_id` (FK), `amount` (Numeric(10,2), check `> 0`), unique `(ledger_entry_id, enrollment_id)`, index on `enrollment_id`.
* Sum of a payment's targets equals the payment amount (validated in the service; tested).
* Legacy payments have no targets and keep working.

**Allocation rules:**
* A targeted payment allocates only to charges of its target enrollments, oldest due date first. No Pass 2.
* Per Q4, each target amount must not exceed that enrollment's remaining contract balance (`sum(open charge balances)`). Otherwise `422` with the maximum allowed amount.
* Enrollment creation and `create_adjustment` stop calling auto-allocation with no preference. Existing wallet credit is spent only by an explicit `allocate_credit` (Q5).
* Void reverses exactly the allocations of that payment (unchanged behaviour, now limited to the targets).

**API and contract:**
* `PaymentCreate` gets `targets: list[PaymentTargetInput]` (`enrollment_id`, `amount` as decimal string), `min_length=1`, `extra="forbid"`. During expand, `course_id` stays accepted and maps to one target.
* `PaymentIdempotency.fingerprint` includes the sorted targets instead of a single `course_id`.
* Payment read schema and receipt list the targets. Audit event payload lists the targets.
* Regenerate `CONTRACT.md` and update `frontend/src/lib/finance/types.ts` in the same change.

**UI:**
* Payment modal: one row per active enrollment with debt, overdue days and an amount input; quick fill "Погасить долг (750 TJS)"; total at the bottom; legacy wallet credit shown separately (Q5). No "50%" chip: it adds a control for a rare case.
* Debtor row, one line: avatar, name, course, overdue pill (`75 дн.`), **reminder channel icon** (Telegram, SMS fallback per D3/U16, or none) with tooltip, debt in `tabular-nums`, actions `[Напомнить] [Оплатить]` and row click for details.
* Receipt: `[Печать квитанции]` in `PaymentDetailDialog.tsx` using the existing receipt endpoint.

### 1.4 Wireframes

#### 1.4.1 Payment Modal
```
┌────────────────────────────────────────────────────────────────────────┐
│  Принять оплату                                                    [✕] │
├────────────────────────────────────────────────────────────────────────┤
│  Зарина Бобоева                                                        │
│                                                                        │
│  Web Frontend (Aug 2026)   Долг 750.00 · 75 дн.   [  750.00 ] TJS      │
│                                         [ Погасить долг ]              │
│  English Elementary        Долг 500.00            [    0.00 ] TJS      │
│                                                                        │
│  Нераспределённый остаток: 120.00 TJS   [ Зачесть в курс… ]            │
│                                                                        │
│  Итого: 750.00 TJS                                                     │
│  Способ: (•) Наличные  ( ) Перевод    Дата: [ 27.10.2026 ]             │
│  Комментарий: [                                                     ]  │
├────────────────────────────────────────────────────────────────────────┤
│  [ Отмена ]                                         [ Принять оплату ] │
└────────────────────────────────────────────────────────────────────────┘
```

#### 1.4.2 Debtor Row
```
[ZB] Zarrina Boboyeva  Web Frontend (Aug 2026)  [75 дн.]  [✈︎|SMS]  750.00 TJS  [Напомнить] [Оплатить]
```

---

# SECTION 2: Course Dates, Schedules & Time Management

**Owner:** this section is UAT task **U17** (editable lesson times only, branch `uat/u17`). Do not implement it a second time here. This section only records the constraints U17 must meet.

### Files Involved
* Backend: `backend/app/schemas/course.py`, `backend/app/services/course_service.py`, `backend/app/core/schedule_utils.py`
* Frontend: `frontend/src/components/courses/CourseFormPanel.tsx`, `frontend/src/components/courses/ScheduleEditor.tsx`

### 2.1 Facts
* Journals are generated when the course is created (`course_service.py:85`). Date edits are rejected when journals exist (`course_service.py:113-120`). So in practice dates can never be changed after creation.
* `LessonDateCalculator` uses only `day_of_week`. `JournalEntry` stores only `lesson_date`. Changing `time_start`/`time_end` does not affect journals, grades or finance.
* `time_start` is read for display and ordering by `student_performance_repository.py:208`, `schedule_service.py:67`, and frontend `TodayLessons`, `NextLessonCalculator`, `ScheduleSummary`. These must show the new time after an edit; no stored copies exist.

### 2.2 Requirements
1. **Dates read-only in edit mode** (screenshot 20 shows them editable). Show them as text, not as disabled inputs.
2. **Times editable:** `CourseUpdate` accepts schedule time changes for existing schedule rows.
3. **Days of week locked in the backend:** a request that adds, removes or changes `day_of_week` on an existing course returns `400`. Backend test required.
4. Audit event for a time change lists old and new times.
