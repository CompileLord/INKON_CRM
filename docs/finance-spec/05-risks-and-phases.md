# IMKON Master Spec — Technical Risks & Implementation Phases

Part of [`docs/finance-spec/`](README.md). Revision 2, 2026-10-27.

# SECTION 10: Technical Risks

### R1. Frontend tests that encode current behaviour
* `JournalProgressChart.test.tsx:102` uses "Class average" as a legend toggle; lines 165–172 assert tooltip names and `chart-tooltip-dates`. Update for: average kept, "Maximum" removed, short month label. Keep `data-testid="chart-tooltip"`.
* `JournalDetail.periodSettingsDialog.test.tsx:122` expects "Highest existing exam score: 60". Update to the new inline hint text in all three locales.

### R2. Days of week
Changing `day_of_week` moves historical lesson dates and orphans journal entries. Backend rejects it (§2.2). Test required.

### R3. `charges.amount > 0`
Grant enrollments generate no charges, so the constraint is never hit. Do not relax the constraint.

### R4. Allocation scope
Targeted payments must never reach other enrollments. Tests: targeted payment with other open courses; enrollment creation with wallet credit present; adjustment with no preference; void of a split payment.

### R5. Money formatting
Money stays a decimal string. Drop `.00` by checking the string's fractional part, never by converting to a JS number.

### R6. Translation parity
Every new or changed key in en, ru and tg in the same change; parity tests per namespace.

### R7. Monthly price data repair
No repair is built (L6). Risk is that real enrollments with divided charges appear between now and the Phase 0 deploy. Mitigation: re-run the read-only prod count right before deploy; if any active enrollment has charges, stop and ask the owner.

### R8. Optimistic locking and concurrency
Payment creation keeps `lock_student_accounts`. Split payments lock once per student, not per target.

### R9. Coordination with UAT work
U16 (SMS fallback), U17 (lesson times) and U18 (withdrawal cancels future charges) touch the same files. Phases below that touch `finance_service.py`, `charge_balance_query.py` or `course_service.py` start after the related U-task is merged to `master`.

### R10. Expand/contract
New columns (`billing_mode`, organization address/phone) and table `payment_targets` are added nullable first; readers switch in a later release; old columns are dropped later. Single Alembic head.

---

# SECTION 11: Implementation Phases

Each phase lists its definition of done in addition to AGENTS.md §6 (backend suite on the disposable pod, `npx vitest run`, `npx tsc -p tsconfig.app.json --noEmit`, `CONTRACT.md` regenerated when a schema changes).

### Phase 0: Monthly price (OD-1) — first
- [ ] `generate_schedule_for_enrollment`: one charge per billed month equal to `price_at_enrollment`; first month per Q2/Q3.
- [ ] `InstallmentPriceInput` and error text: positive money only.
- [ ] Course form label "Цена в месяц"; `DebtorDetails` "contracted" label fixed; en/ru/tg.
- [ ] Roster and student-deletion bug (§1.0b, B-1).
- **Tests:** 1-, 3- and 13-month courses; late enrollment; custom fee. **Accept:** no charge differs from the monthly price.

### Phase 1: Journal chart & period dialog
- [ ] Capture the open period settings dialog (missing screenshot 23).
- [ ] `JournalProgressView.tsx`, `JournalProgressChart.tsx`: title, height, fitted y-domain, tooltip per §3.3, 150 ms `ease-out`.
- [ ] `JournalPeriodSettingsDialog.tsx`: per §3.4.
- [ ] Tests per R1; locales `journals.json`, `journalPeriodSettings.json`.
- **Accept:** lines distinguishable on a course whose scores span 40–90.

### Phase 2: Mentors & course cards
- [ ] Mentor performance bug (Problem 11d) with backend test.
- [ ] `MentorPerformance.tsx`, `Mentors.tsx` (courses column via one query), `MentorFormPanel.tsx`.
- [ ] `CourseCard.tsx`; shared money formatter with `TJS` (Q7) used in student and mentor profiles.
- [ ] Student progress mismatch (UX-B1) with backend test.
- **Accept:** no "сомони" left in ru locales for amounts; mentors list makes one request per page.

### Phase 3: Course time editing — delivered by U17
- [ ] Verify U17 meets §2.2 (dates read-only, times editable, days locked in backend with test). No separate work here.

### Phase 4: Grants (after Q6)
- [ ] Migration: `enrollments.billing_mode` (expand).
- [ ] No charges for grant enrollments; transitions per §4.4 with audits.
- [ ] Analytics exclusions with tests.
- [ ] `EnrollStudentModal.tsx` grant toggle and custom monthly fee; badges per §4.6.
- [ ] Contract and `frontend/src/lib/*/types.ts` regenerated.
- **Accept:** a grant enrollment never appears in debtors or reminders; no grant badge in the journal.

### Phase 5: Students & onboarding
- [ ] `StudentFormPanel.tsx` per §5.1; open enroll modal after create.
- [ ] Students list endpoint with courses and balance aggregates, filters; `StudentsTable.tsx`.
- [ ] Profile tabs per §5.3.
- **Accept:** students list page issues one API request; query count test in the backend.

### Phase 6: Dashboard
- [ ] Depends on Phase 8's backend actor fix for "Система".
- [ ] Tiles as links; slim today line; header actions.
- [ ] `GET /dashboard/attention` and the attention block per §6 item 3, with the listed backend tests.
- **Accept:** no raw queue text in the feed in any locale.

### Phase 7: Multi-course payments (after Q4, Q5; after U16/U18 merged)
- [ ] Migration: `payment_targets` table.
- [ ] `PaymentCreate.targets`, fingerprint, receipt, audit; no auto-allocation on enrollment creation or adjustment.
- [ ] Payment modal, debtor row with channel icon, receipt print, naming in `finance.json`.
- [ ] Tests per R4.
- **Accept:** a targeted payment never creates an allocation on another enrollment.

### Phase 8: Audit
- [ ] Re-capture screenshot 28 on master.
- [ ] Backend: real actor on link-code and credential events; test.
- [ ] Sentences, inspector labels, category filter (backend parameter).

### Phase 9: Settings
- [ ] Deploy env for version info (Problem 50).
- [ ] Quick drawer link; profile grid; organization address/phone (migration + contract).

### Phase 10: Notifications
- [ ] Context fields and links.
- [ ] Retry endpoint (idempotent, outbox, rate-limited, channel re-resolution).
- [ ] Staff notifications and lockout reset: separate spec first.
- [ ] Card style with lucide icons.

### Phase 11: Cross-cutting UI/UX (§12)
- [ ] Re-seed the capture environment without test data (UX-G8) and rename the seeded admin (UX-G9) before any new screenshots.
- [ ] Shared pieces first: `PageHeader` (title + count), status badge rule, phone display formatter, empty-value component, 24-hour time input. Then apply per screen (UX-S*).
- [ ] Items that touch a screen owned by an earlier phase ship with that phase instead.
- **Accept:** the §12 checklist re-run on fresh screenshots of all 31 screens finds none of the listed issues.
