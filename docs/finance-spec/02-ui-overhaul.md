# IMKON Master Spec — Mentors, Courses, Journal Chart & Period Dialog

Part of [`docs/finance-spec/`](README.md). Revision 2, 2026-10-27.

# SECTION 3: Minimalist SaaS UI/UX Overhaul

## 3.1 Mentors Directory, Profile & Performance

### Files Involved
* `frontend/src/pages/Mentors.tsx`, `frontend/src/pages/MentorProfile.tsx`, `frontend/src/components/mentors/MentorFormPanel.tsx`, `MentorContactFields.tsx`, `MentorPerformance.tsx`, `StudentMentorCard.tsx`

### Reference Screenshots
* `10_mentors_list.png`, `11_mentor_add_drawer.png`, `12_mentor_profile_courses.png`, `13_mentor_profile_performance.png`, `14_mentor_profile_documents.png`, `15_mentor_edit_drawer.png`

### Problems
* **Problem 9 (Sentences under numbers):** every metric has a full sentence below it.
* **Problem 10 (Duplicated metrics):** the top strip and the card below both show student count and average.
* **Problem 11 (Empty space):** a wide card with three small text blocks.
* **Problem 11a (No courses in mentors table):** only name, phone, registration date.
* **Problem 11b (Drawer):** phone hint "Формат: +992901234567" plus the same text as placeholder.
* **Problem 11c (Mentor course cards):** no schedule, no journal link, price in "сомони" without "/ мес".
* **Problem 11d (Performance data bug, screenshot 13):** "80 graded periods" with 0 points and average "—". Find the cause in the mentor performance query before any UI work; add a backend test with graded periods that asserts a non-empty average.

### Recommendations
1. `MentorPerformance.tsx`: move explanations into `(i)` tooltips; remove the duplicated count; one progress bar for the average.
2. `Mentors.tsx`: **«Активные курсы»** column with course name pills. The list endpoint must return them in the same query (`selectinload`), not per row.
3. `MentorFormPanel.tsx`: 2-column grid; keep the format hint once (placeholder only). Use the same email label as the student form.
4. Mentor course cards: schedule chip and `[В журнал]`; price via the shared money formatter (Q7).

## 3.2 Courses Grid, Roster & Enrollment

### Files Involved
* `frontend/src/components/courses/CourseCard.tsx`, `CourseThumb.tsx`, `CourseStudentsPane.tsx`, `CourseRosterRow.tsx`, `EnrollStudentModal.tsx`, `frontend/src/pages/CourseProfile.tsx`

### Reference Screenshots
* `16_courses_grid.png`, `17_course_add_drawer.png`, `18_course_profile_roster.png` (Обзор tab), `18b_course_students_tab.png`, `19_course_enroll_student_modal.png`, `20_course_edit_drawer.png`

### Problems
* **Problem 12:** cards are a stack of gray text lines.
* **Problem 13:** 40 px thumbnail reads as a user avatar.
* **Problem 14:** active and archived cards look alike.
* **Problem 15:** `500.00 TJS / мес` instead of `500 TJS / мес`.
* **Problem 15a:** roster shows the same price on every row and hides payment state and grants.
* **Problem 15b:** enroll modal has no grant option, custom fee or payment day.
* **Problem 15c (Overview, screenshot 18):** group average and attendance show "—" for an active course with students. Check whether no lessons were graded yet; if so, show the translated empty reason instead of a dash.

### Recommendations
1. Course cards: icon chips for schedule, student count and dates; emerald "Идёт" vs muted archived card; integer price when cents are zero (R5); `hover` border change using 150 ms `ease-out`, no lift.
2. Roster: show the course price once in the tab header. Per-row column **«Оплата»** with `Оплачено`, `Долг 250 TJS` or `Грант`; show a per-row price only when it differs from the course price. Balances come from one aggregate query for the course, not one request per student.
3. Enroll modal: `Грант` toggle and `Стоимость в месяц` field (custom fee, §4.5).

## 3.3 Journal Progress Chart

### Files Involved
* `frontend/src/components/journals/JournalProgressChart.tsx`, `JournalProgressView.tsx`

### Reference Screenshots
* `22_journal_detail_table.png`

### Problems
* **Problem 16 (Overlapping lines):** staff view uses `dense`, 190 px. The main cause is the fixed 0–125 y-scale; scores cluster in a narrow band. Height alone does not fix it.
* **Problem 17:** title "Весь курс, все периоды" plus a long explanation.
* **Problem 18 (Tooltip):** shows the full date range `01.06.2026 – 30.06.2026` and a "Maximum" row already drawn as a line.

### Recommendations
* Title **«Динамика успеваемости»**; explanation in an `(i)` tooltip.
* Height 280–320 px **and** a y-domain fitted to the data (rounded to 10, never above the period maximum).
* Tooltip: short month label (`июн 2026`) through `i18n/formatters.ts`; ranked student list; **keep the class average** as the last row, because the legend lets users hide its line; remove the "Maximum" row.
* Motion: 150 ms `ease-out` (AGENTS.md §5). No custom curve.

## 3.4 Period Settings Dialog

### Files Involved
* `frontend/src/components/journals/JournalPeriodSettingsDialog.tsx`, `frontend/src/i18n/locales/{en,ru,tg}/journalPeriodSettings.json`

### Reference Screenshots
* `23_journal_period_settings_modal.png` shows only the menu entry. **Capture the open dialog before Phase 1.**

### Problems (from code, pending screenshot)
* **Problem 20:** course title and period dates repeated in the dialog.
* **Problem 21:** long disclaimer paragraph.
* **Problem 22:** hints above and below each input.

### Recommendations
* Accessible name stays **«Настройки периода»**; subtitle «Месяц 3».
* Disclaimer becomes one `(i)` tooltip next to "Максимум за экзамен".
* Inline hint per field: `текущий макс: 22`. Keep the integer range in input validation, not as text.
