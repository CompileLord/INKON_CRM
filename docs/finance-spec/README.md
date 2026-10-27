# Master Specification: CRM Financial Logic, Course Management & Minimalist SaaS UI/UX

**System:** IMKON CRM (KITOB)
**Document Identifier:** `IMKON-MASTER-SPEC-2026`
**Repo Path:** `docs/finance-spec/` (split into files of at most 20 KB each, as the pre-commit hook requires)
**Revision:** 2 — audited against `master` code and all screenshots in `docs/audit_screenshots/` on 2026-10-27
**Status:** All owner questions closed on 2026-10-27 (§0.1). Phase 0 is ready to implement.

> Revision 2 changes: added the owner decision that a course price is a **monthly** price (§0.1). Corrected factual claims that did not match the code (§0.4). Added a full screenshot check (§0.3). Replaced the single `target_enrollment_id` idea with a split model and an overpayment policy (§1.3). Moved Section 2 under UAT task U17. Fixed the contradictions in the grant model (§4). Kept `paymentDay` on the student by owner decision (§5). Rewrote the risks (§10) and phases (§11) with migrations, contract regeneration, tests and acceptance criteria. File links are now repo-relative. Added a logic review (§0.5), the removed-student roster bug (§1.0b) and Section 12 (additional UI/UX findings from a second full screenshot pass) and Phase 11.

---

## Files

- [`00-decisions.md`](00-decisions.md): Owner Decisions, Screenshot Check & Corrections (Section 0)
- [`01-finance-and-schedules.md`](01-finance-and-schedules.md): Finance, Payment Allocation & Course Schedules (Section 1, 2)
- [`02-ui-overhaul.md`](02-ui-overhaul.md): Mentors, Courses, Journal Chart & Period Dialog (Section 3)
- [`03-grants-and-students.md`](03-grants-and-students.md): Grants & Students (Section 4, 5)
- [`04-dashboard-audit-settings-notifications.md`](04-dashboard-audit-settings-notifications.md): Dashboard, Audit, Settings & Notifications (Section 6, 7, 8, 9)
- [`05-risks-and-phases.md`](05-risks-and-phases.md): Technical Risks & Implementation Phases (Section 10, 11)
- [`06-ux-findings.md`](06-ux-findings.md): Additional UI/UX Findings (Section 12)

Section numbers (§N.M) are kept across files. Screenshots referenced as `NN_*.png` live in `docs/audit_screenshots/`, which is git-ignored.
