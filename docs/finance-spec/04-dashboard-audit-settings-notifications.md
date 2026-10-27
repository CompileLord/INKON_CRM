# IMKON Master Spec — Dashboard, Audit, Settings & Notifications

Part of [`docs/finance-spec/`](README.md). Revision 2, 2026-10-27.

# SECTION 6: Dashboard & Activity Feed

### Files Involved
* Frontend: `frontend/src/pages/Dashboard.tsx`, `frontend/src/components/dashboard/StatsRow.tsx`, `GreetingBanner.tsx`, `TodayLessons.tsx`, `AttentionList.tsx`, `ActivityFeed.tsx`, `frontend/src/components/audit/AuditSentence.tsx`
* Backend: `backend/app/services/audit_service.py`, `backend/app/api/v1/audit_logs.py`

### Reference Screenshots
* `03_dashboard.png`

### Problems
* **Problem 31:** feed shows `Password sms queued: initial:student_phone`, `Credentials queued: initial:email`, `Link code expires at…`, and "Автор недоступен".
* **Problem 32:** "Требуют внимания сегодня" lists the 5 oldest debtors, not today's items.
* **Problem 33:** tiles are not links.
* **Problem 34:** large empty "no lessons today" card.
* **Problem 35:** no quick actions.

### Recommendations
1. **Feed:** translate SMS/credential events into readable sentences (they are real business events: "Пароль отправлен по SMS"). Filtering, if any, happens in the backend query so pagination stays correct. "Система" requires the backend actor fix in §7.
2. **Tiles:** links to `/finance?tab=debtors`, `/courses`, `/students`. Debt tile excludes grant enrollments automatically (they have no charges). No invented metrics such as "38 ур/нед".
3. **Attention block (Q8)** — today only, grouped by lesson, newest first:
   - **Lessons in progress now:** course, time, mentor (from schedule `time_start`/`time_end`; depends on U17 times being correct).
   - **Attendance not marked:** a lesson that started **10 minutes** ago or more and has no marked row for any student (marked = `is_graded IS TRUE`, see L1). Shows mentor name and phone plus `[Открыть журнал]`. Stays in the list until marked or the day ends. No "remind mentor" button in v1; the admin contacts the mentor.
   - **Absent students today:** per lesson, the students marked absent (`is_graded IS TRUE AND attendance IS FALSE`; unmarked rows never count), with a "3-й пропуск подряд" badge when it is the third or later consecutive absence in that course. Each name links to the student profile (phone visible there).
   - **Payments:** due today and overdue 1–7 days, with `[Оплатить]` opening the payment modal for that student.
   - **Grades are not checked** — only attendance.
   - Backend: one new endpoint `GET /dashboard/attention` returning these four groups in one response, computed in SQL (no per-lesson requests). "Now" uses the school's timezone. Tests: lesson started 9 min ago → not flagged, 10 min → flagged; any mark clears the flag; consecutive absence count across lesson dates; mentor role cannot call the endpoint.
   - Empty state: "Сегодня всё в порядке" with the next lesson time.
4. **Today:** one slim line when empty: «Сегодня занятий нет · Следующее: завтра, 09:00».
5. **Header:** `[Принять оплату]`, `[Добавить студента]`.

---

# SECTION 7: Audit Logs & Activity Trail

### Files Involved
* Frontend: `frontend/src/pages/Audit.tsx`, `frontend/src/components/audit/AuditToolbar.tsx`, `AuditEventRow.tsx`, `AuditSentence.tsx`, `useAuditEventText.ts`, `AuditInspector.tsx`; locales `audit.json`
* Backend: `backend/app/services/user_service.py`, `backend/app/services/student_password_sms_service.py`, `backend/app/services/credentials_delivery_service.py`, `TelegramLinkService`

### Reference Screenshots
* `28_audit_logs.png` — probably older than master's U07/U12 audit changes. **Re-capture on master before Phase 8** and drop any problem master already fixed.

### Problems
* **Problem 43:** raw queue events in English.
* **Problem 44:** "Автор недоступен". Cause: `user_service.py:124` calls `TelegramLinkService(self.db).issue_code(created_user, None)`, so an admin-triggered action is stored with a null actor. This is a backend bug: the actor is the admin.
* **Problem 45:** template sentences like «изменение — пользователь».
* **Problem 46:** raw keys and enums in the inspector.
* **Problem 47:** no category filter.

### Recommendations
1. **Backend first:** pass the acting admin to `issue_code` and to the SMS/credential queue events. Only events from scheduled jobs keep a null actor; those render as **«Система»**. Test that an admin-created student's link-code event has the admin as actor.
2. Translate queue events into sentences; do not hide them.
3. Natural sentences for every entity type; inspector field and enum labels in `audit.json` for en/ru/tg.
4. Category segmented control: Все / Оплаты / Студенты / Курсы / Журнал / Система, as a backend filter parameter.

---

# SECTION 8: Settings & Shell

### Files Involved
* `frontend/src/pages/Settings.tsx`, `frontend/src/components/ui/QuickSettingsChanger.tsx`, `frontend/src/components/settings/ProfileSection.tsx`, `OrganizationSection.tsx`, `NotificationRulesSection.tsx`, `AboutSection.tsx`, `AppearanceSection.tsx`; locales `settings.json`

### Reference Screenshots
* `29_settings_general.png` (Profile only). `30_settings_quick_drawer.png` actually shows the notifications popover; there is no screenshot of the quick-settings drawer or of "О приложении".

### Problems
* **Problem 48:** `QuickSettingsChanger.tsx` has no link to `/settings` (code-verified).
* **Problem 49:** one stretched column; phone hint "Начните с + и укажите 2–15 цифр без пробелов."
* **Problem 50:** "Неизвестно" in About. Cause: the build/version environment values are not set in the deploy. Fix the deploy env first; then simplify the section.
* **Problem 51:** no organization address/phone for receipts.

### Recommendations
1. Quick drawer: link «Все настройки →».
2. Profile: 2-column grid at desktop widths; short phone hint consistent with student and mentor forms.
3. About: version and environment from build env; commit details collapsed.
4. Organization address and phone: new nullable columns, schema change, `CONTRACT.md` and types regenerated, used in the receipt header.

---

# SECTION 9: Notifications Center & Delivery Log

### Files Involved
* Frontend: `frontend/src/pages/Notifications.tsx`, `frontend/src/components/notifications/NotificationInbox.tsx`, `DeliveryLog.tsx`, `NotificationPopover.tsx`, `frontend/src/lib/notifications/NotificationPresentation.ts`; locales `notifications.json`
* Backend: `backend/app/schemas/notification.py`, `backend/app/services/notification_service.py`

### Reference Screenshots
* `31_notifications_page.png`; popover in `30_settings_quick_drawer.png`.

### Facts
* `NotificationLog` holds messages sent **to recipients** (students, parents). The admin inbox is empty because nothing generates staff notifications.
* There is no endpoint to reset a Telegram link lockout.
* No retry strings exist in `notifications.json`.

### Problems
* **Problem 52:** templates without context (amount, course, score).
* **Problem 53:** no links to the related entity.
* **Problem 54:** personal inbox and delivery log mixed; admin inbox empty.
* **Problem 55:** no retry for failed deliveries.
* **Problem 56:** bare empty state.

### Recommendations
1. **Context:** add `course_title`, `amount` (decimal string), `score` to `NotificationLogItem`; regenerate the contract.
2. **Links:** each item links to its entity when the viewer's role may open it (check the endpoint guard).
3. **Staff notifications are a new feature**, not a restyle: they need a generator (which events create a staff card), storage and read state. Spec it separately before building action cards like "Принять 750 TJS".
4. **Retry:** new endpoint that re-resolves the recipient's current channel (Telegram, else SMS per D3), goes through the outbox, is idempotent per original log item and rate-limited. Only for failed items.
5. **Lockout reset:** new admin endpoint before any "Сбросить блокировку" button.
6. **Style:** cards with `bg-card`, `border-border`; icons from lucide (map category → icon), not emoji; relative time via `i18n/formatters.ts`; translated empty state with what happens next.
