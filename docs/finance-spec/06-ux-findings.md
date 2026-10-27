# IMKON Master Spec — Additional UI/UX Findings

Part of [`docs/finance-spec/`](README.md). Revision 2, 2026-10-27.

# SECTION 12: Additional UI/UX Findings

Found while re-checking every screenshot on 2026-10-27. Items already covered in Sections 1–9 are not repeated. Each item names its screenshot. "Verify" means the screenshot suggests the issue but the cause must be confirmed in code first.

## 12.1 Bugs visible in the UI

| ID | Screen | Finding | Fix |
|----|--------|---------|-----|
| UX-B1 | 06 vs 07 | The student's Courses tab says "оценено периодов: 0 из 3" with average "—", but the Progress tab for the same student and course draws 3 graded months at about 60 and shows "60". The two tabs read graded periods from different sources. | Find which count is wrong; both tabs use one query. Backend test with one graded period asserting both endpoints agree. |
| UX-B2 | 13 | (Problem 11d) "Считано по 80 оценённым периодам" with 0 points and "—". | See §3.1. |
| UX-B3 | 17 | Lesson time inputs show the 12-hour placeholder `--:-- --` (AM/PM) in the Russian UI. A native `<input type="time">` follows the browser locale, not the app language. | Use a 24-hour time control that follows the app locale. Test in ru/tg/en. |
| UX-B4 | 04 | Payment day renders as "2 - е число" with spaces around the hyphen. Verify: likely a translation key with spaces or a separate span. | Single translated string with an ordinal formatter. (The column itself is removed in §5.2; fix applies wherever the day is shown.) |
| UX-B5 | 31 | Admin inbox empty state says "Всё прочитано" although nothing was ever received, and the subtitle talks about "занятия, оценки и сообщения", which is the student copy. | Separate empty states for "nothing yet" and "all read", and per-role copy. |
| UX-B6 | 22 | A warning triangle next to "Shahrom Hakimov" in the journal has no label or tooltip. Verify what it means. If it is a debt marker, it must never render in the student or mentor journal view (D1, D2). | Tooltip with the reason; role check on the data, not only the UI. |

## 12.2 Global consistency

| ID | Finding | Screens | Fix |
|----|---------|---------|-----|
| UX-G1 | Page titles differ from the sidebar: "Курсы и Группы", "Финансы и Оплаты" vs "Курсы", "Финансы". | 16, 25 | Page title equals the sidebar label. |
| UX-G2 | Count next to the title: "(5)" on Courses, "35" on Students, "5" on Mentors, "40" on Audit, nothing on Journals ("5 журналов" as a separate line). | 04, 10, 16, 21, 28 | One `PageHeader` component: muted count without brackets. Remove the separate "5 журналов" line. |
| UX-G3 | Email label: "Электронная почта" (student), "Email" (mentor), "Эл. почта" (settings). | 05, 09, 11, 15, 29 | One translation key. |
| UX-G4 | Phone hint in three different forms: "Формат: +992901234567" above plus the same value as placeholder; settings "Начните с + и укажите 2–15 цифр без пробелов". | 05, 09, 11, 15, 29 | One shared phone field: placeholder only, error text on invalid input. |
| UX-G5 | Phones shown as raw E.164 (`+992901110005`) everywhere; hard to read and dictate. | 04, 06, 10, 12, 19 | Display-only grouping `+992 90 111 0005` via a formatter. Storage and API stay E.164. |
| UX-G6 | A bare "—" is used for "no data" with no reason: averages, attendance, missing phone. | 04, 06, 12, 13, 18 | Empty-value component: "—" with a tooltip giving the translated reason ("Ещё нет оценённых периодов"). |
| UX-G7 | Green "Активен" badge on every row where almost everything is active. | 06, 12, 18b, 19 | Show a status badge only when the status is not the normal one (archived, withdrawn, completed). |
| UX-G8 | Test data in the captures ("Curl Test Course 25719", "Curl Student", "Test Mentor", 664-day debts). | 03, 10, 16, 25, 27, 28 | Re-seed the capture environment with realistic data before the next audit. Not a product change. |
| UX-G9 | The seeded admin is called "SuperAdmin System". Once null-actor events render as «Система» (§7), "SuperAdmin **System**" and «Система» will be confused. | 03, 28 | Rename the seed admin (e.g. "Администратор"). Seed change only. |
| UX-G10 | Disabled primary buttons are light blue, close to the secondary style, and give no reason: "Напомнить в Telegram", "Записать студента", "Сохранить". | 19, 20, 27 | Disabled style with clear contrast difference; reason in a tooltip on the button. |
| UX-G11 | Top bar has only the bell and gear, which duplicate the sidebar items "Уведомления" and "Настройки" but open different things (popover, quick settings). Users cannot predict which one they get. | all | Keep the bell (popover with link to the page) and the gear (quick settings with link to the page, §8). Label both with tooltips "Уведомления", "Быстрые настройки". |
| UX-G12 | Section headings repeat the tab name: tab "Документы" → card "Документы"; tab "Прогресс" → card "Прогресс"; tab "Должники" → card "Список должников". | 07, 08, 14, 27 | Drop the card heading when it equals the active tab; keep the card actions. |
| UX-G13 | Mixed time styles in one list: "29 минут назад" and "13:26". | 28 | Relative time under 24 h, then date and time, all through `i18n/formatters.ts`. |

## 12.3 Per-screen findings

| ID | Screen | Finding | Fix |
|----|--------|---------|-----|
| UX-S1 | 01 | "Новый студент? Введите 6-значный код из SMS." but there is no code field; the user must guess that the code goes into the password field. | Say it: "Новый студент? Введите код из SMS в поле «Пароль»." |
| UX-S2 | 01 | The logo appears twice (small logo above the form and the large emblem on the right). | Keep the small logo on mobile only, where the right panel is hidden. |
| UX-S3 | 02 | The description already says the code can come by SMS, and a separate link "У меня нет доступа к почте" repeats that path. The right-hand emblem differs from the login page. | Keep one path explanation. Same emblem on both pages. |
| UX-S4 | 03 | Title "Панель администратора" adds nothing on the home page. | Greeting or date line instead, with the quick actions from §6. |
| UX-S5 | 05 | The "Оплата" section is below the fold and easy to miss; two `(i)` icons (email and "Контакты") explain password delivery. | Move the payment-day group higher (§5.1); one explanation of password delivery, next to the email field. |
| UX-S6 | 06 | The debt card spans the full width for one number; course row has no link anywhere. | Debt as a compact pill in the profile header; course row links to the course. |
| UX-S7 | 07 | With one course, the legend and the row below repeat the course name, and "60" has no scale (60 of what?). | Hide the legend with a single series; show "60%" or "60 / 100" consistent with the journal. |
| UX-S8 | 09, 15 | The photo block takes about a quarter of the drawer height. | Avatar and upload button on one compact row. |
| UX-S9 | 10 | Column header "Дата регистрации" wraps to two lines while the name column takes half the table. | Rebalance column widths; short header "Добавлен". |
| UX-S10 | 13 | Card title "Как идут группы" is conversational; it repeats the top strip (Problem 10). | Merge into the top strip (§3.1). |
| UX-S11 | 16 | The ended course (01.01.2025–01.06.2025) looks the same as running ones. Exam type sits in the subtitle with higher priority than the schedule. | Status per §3.2; exam type moves to the course page. |
| UX-S12 | 17 | "Описание *" is required, which slows course creation. The price placeholder "1500" looks like a filled value. | Description optional; empty price field with "Цена в месяц" label and "TJS" suffix. |
| UX-S13 | 18 | "Смена менторов" is a full card that only holds a "Показать" button. | Move to a link in the course header menu or a collapsed row. |
| UX-S14 | 18b | Under each price is an unlabeled date (27.10.2026). Probably the enrollment date. | Label it ("с 27.10.2026") or move to the row menu/details. |
| UX-S15 | 19 | Single-select radio list: one student per dialog, and the list mixes email and phone lines with "•". Caps heading "ДОСТУПНЫЕ КАНДИДАТЫ". | Multi-select with checkboxes and a count on the button ("Записать 3"). Sentence-case heading. Backend must accept a batch or the UI loops with clear per-student errors. |
| UX-S16 | 20 | Read-only course terms are a long block at the bottom; the first lines say twice that they cannot be changed (heading "только для чтения" plus a sentence). | One short heading with a lock icon and tooltip. |
| UX-S17 | 21 | The journals list repeats the courses list (same name, exam type, dates, mentor) and adds nothing useful for a journal. Search placeholder says "Поиск курсов…". | Show journal-relevant data: current period, last lesson graded, ungraded lessons count. Placeholder "Поиск журналов…". |
| UX-S18 | 22 | The period select is about 450 px wide for "Месяц 3"; the `?` help button sits alone at the far right; every date column has its own "…" menu. | Compact select; help next to the title; column menu on hover/focus only. |
| UX-S19 | 22 | Per-lesson grades are 1–5 but the chart above shows period totals on 0–125 with no explanation that they are different scales. | Y-axis label or `(i)` stating the chart shows period totals; see §3.3. |
| UX-S20 | 23 | The "…" menu next to the period select contains one item, "Настройки периода". | Replace the menu with a direct icon button with tooltip. |
| UX-S21 | 25 | The month picker "Период поступлений" sits above all three tiles but only affects the collected tile; the two debt tiles are "now". | Move the picker into the collected tile, or label tiles "сейчас" vs month. |
| UX-S22 | 25 | "Балансы по курсам" lists students with debt, duplicating the Debtors tab. | Rename to "Крупнейшие долги" with a link to the Debtors tab, or show real per-course totals. |
| UX-S23 | 26 | Submit button "+ Принять платеж" uses a plus icon and a different noun than the title "Принять оплату"; footer hint "Введите фактически полученную сумму" is far from the amount field. | Button "Принять оплату" without icon; hint under the amount field. |
| UX-S24 | 27 | Counter "Балансов по курсам: 17" is unclear; "Напомнить всем на странице (0)" is shown disabled with a hint line below it. | Counter "17 должников"; hide the bulk reminder when no row can be reminded. |
| UX-S25 | 28 | Every event uses the same pencil icon, so categories are not scannable; the refresh button sits alone in the header. | Icon per category (§7 categories); refresh next to filters. |
| UX-S26 | 30 | Popover says "Непрочитанные уведомления: 0" and then the empty text; the link "Открыть историю уведомлений" names a page that is called "Уведомления". | Drop the zero counter; link text "Все уведомления". |
| UX-S27 | 31 | Empty state is a single line in the top-left of a 1440 px page. | Centered empty state with icon, reason and next step (AGENTS.md §5 list states). |
