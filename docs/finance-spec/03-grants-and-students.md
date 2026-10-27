# IMKON Master Spec — Grants & Students

Part of [`docs/finance-spec/`](README.md). Revision 2, 2026-10-27.

# SECTION 4: Free Study & Grant Enrollments

### Files Involved
* Backend: `backend/app/models/enrollment.py`, `backend/app/models/charge.py`, `backend/app/services/finance_service.py`, `backend/app/services/enrollment_service.py`, `backend/app/repositories/sqlalchemy/charge_balance_query.py`, analytics queries in `finance_service.py`
* Frontend: `frontend/src/components/courses/EnrollStudentModal.tsx`, `frontend/src/components/student/StudentProfileHeader.tsx`, `frontend/src/components/finance/DebtorsTab.tsx`, `frontend/src/components/courses/CourseRosterRow.tsx`

### 4.1 Facts
* `InstallmentPriceInput` requires positive money; `charges.amount > 0` is a DB check.
* Reminders come from `ChargeBalanceQuery`, which needs an open charge with a positive balance.
* `create_discount` already exists and reduces a single charge.

### 4.2 Problems
* **Problem 23:** no free enrollment.
* **Problem 24:** reduced-fee workarounds show students as debtors.
* **Problem 25:** such students get reminders.

### 4.3 Model
* `enrollments.billing_mode`: `paid` (default) or `grant`. Nullable on expand, backfilled to `paid`, then non-null.
* A grant applies to **one enrollment**, never to the student. There is no grant toggle in the student form.
* Grant enrollment: no charges are generated. With no charges there is no debt and no reminder, so `ChargeBalanceQuery` needs **no** extra filter. Add a test that proves a grant enrollment produces no reminder.
* Analytics: expected revenue and collection rate exclude grant enrollments; the student count includes them. Test both.

### 4.4 Transitions (Q6)
* **Paid → grant:** future open charges become `CANCELLED` (same mechanism as D4/U18). Already allocated money stays on the charges it paid; it is not refunded automatically. Audit event with actor and reason.
* **Grant → paid:** generate charges from the next billed month only. Audit event.
* Both actions are admin-only and need a reason text.

### 4.5 Custom Fee vs Discount
* **Custom fee** at enrollment: `price_at_enrollment` is set to the custom monthly amount. All months use it.
* **Discount** (existing `create_discount`): one-off reduction on a single charge.
* The UI names them differently ("Стоимость в месяц" vs "Скидка") so they are not confused.

### 4.6 UI and Privacy
* Badge `Грант` in the course roster, student profile and finance views.
* **Not** in the journal grid: per D1 students see classmates in the journal, and a grant badge there would expose another student's financial status.

---

# SECTION 5: Students Directory, Profile & Onboarding

### Files Involved
* Frontend: `frontend/src/components/students/StudentsTable.tsx`, `StudentFormPanel.tsx`, `StudentContactFields.tsx`, `StudentEmailField.tsx`; `frontend/src/components/student/StudentCoursesTab.tsx`, `StudentProgressPanel.tsx`, `StudentProfileHeader.tsx`; `frontend/src/components/documents/DocumentsTab.tsx`; `frontend/src/pages/Students.tsx`, `StudentProfile.tsx`
* Backend: `backend/app/schemas/user.py`, `backend/app/services/user_service.py`, `backend/app/api/v1/students.py`, `backend/app/models/enrollment.py`, `backend/app/models/user.py`

### Reference Screenshots
* `04_students_list.png`, `05_student_add_drawer.png`, `06_student_profile_courses.png`, `07_student_profile_performance.png`, `08_student_profile_documents.png`, `09_student_edit_drawer.png`

### 5.1 Registration Drawer
* **Problems:** phone format shown as hint and placeholder; password-delivery explanation repeated; payment day hidden below the fold; dead end after creation.
* **Changes:**
  - 2-column grid: `Имя | Фамилия`, `Телефон | Дата рождения`, `Телефон родителя | —`; **Email full width**, because its helper line ("Если указана, пароль придёт по почте") needs the space.
  - Format hint shown once.
  - **Payment day stays on the student** (Q9). Keep the field in the "Оплата" group, but move that group up so it is not below the fold (UX-S5). Show it in the student profile header, not as a students-table column.
  - After creating a student, open `EnrollStudentModal` for that student instead of putting enrollment inside the student form. One form, one job.
  - No grant toggle here (§4.3).

### 5.2 Students Table
* **Problem 36:** phone shown twice when there is no email.
* **Problem 37:** "День оплаты" column instead of courses and balance.
* **Problem 38:** a "Не привязан" badge on every row.
* **Problem 39:** no course or payment-status filter.
* **Changes:**
  - Columns: Студент (name + email if any), Телефон, Курсы (pills), Баланс (`0 TJS`, `Долг 250 TJS`, `Грант`), actions.
  - Courses and balance come from the list endpoint in aggregate SQL (one query per page). No per-row request.
  - Telegram link state as a small icon with tooltip.
  - Filters: course, payment status. Backend-side filtering with pagination.

### 5.3 Profile Tabs
* **Courses tab:** `[+ Записать на курс]` in header and empty state (Problem 40); card shows mentor, schedule, course balance, `[В журнал]` (Problem 41).
* **Performance tab:** Problems 42/43 are **not visible in screenshot 07**. Check the component; change only what the code confirms.
* **Documents tab (Problem 44):** keep the formats line once (under the button); the empty state says only "Документов нет" plus what to do next.
* **Currency:** debt card uses `TJS` via the shared formatter (Q7).
