# IMKON CRM — Production Readiness Plan

**Audit date:** 2026-08-01
**Audit basis:** full-repo scan of `frontend/src` and `backend/app`, frontend typecheck, frontend test run (108/108 pass), backend test run under conda base (53 pass / 10 fail).
**Intended reader:** an implementing agent starting a **fresh session** with no prior context. Everything needed is in this file.

---

## 0. Read this first — the premise correction

This project was described as "a prototype with mock data." **That is no longer accurate**, and an agent that starts hunting for mock data to replace will waste its time and risk breaking working code.

Three prior audit cycles — `AUDIT_FIX_PLAN.md`, `JOURNAL_REDESIGN_PLAN.md`, and `COMPLETION_PLAN.md` — already stripped the mocks. Verified during this audit:

- A repo-wide grep for `mock|dummy|fake|hardcod|TODO|FIXME|stub|not implemented|coming soon` across `frontend/src` and `backend/app` (excluding tests) returns **zero hits**.
- All 42 frontend hooks in `lib/*/hooks.ts` call real endpoints via the shared axios client.
- Every mutation hook is bound to real UI (verified individually — see §5).
- Frontend `tsc -b --noEmit` exits 0.
- Frontend `vitest run`: **14 files, 108 tests, all passing**.

The prior plan docs (`COMPLETION_PLAN.md` in particular) describe Notifications and Settings as "100% mock." **That doc is stale** — Notifications has since been fully implemented (backend router `app/api/v1/notifications.py`, frontend `lib/notifications/`, wired into `pages/Notifications.tsx` and `components/notifications/NotificationPopover.tsx`). Do not re-implement it. Only the Settings System/Notifications tabs remain fake (§2).

**The actual state:** a near-complete, well-structured application with one P0 backend defect that breaks course creation entirely, one small mock remnant, an unfinished localization sweep, and thin loading/error UX.

---

## 1. Repo layout & how to run things

```
IMKON_CRM/
├── backend/          FastAPI + SQLAlchemy async + Alembic + Pydantic v2
│   ├── app/api/v1/   12 routers (auth, users, students, mentors, courses,
│   │                 enrollments, journals, finance, documents, audit_logs,
│   │                 notifications, telegram)
│   ├── app/models/   14 SQLAlchemy models
│   ├── app/repositories/  interfaces/ + sqlalchemy/ (repository pattern)
│   ├── app/services/ 13 service classes (business logic lives here)
│   ├── app/schemas/  Pydantic v2 schemas
│   ├── app/workers/  arq background tasks
│   └── app/tests/    pytest integration suite
└── frontend/         React 19 + Vite 8 + TS 6 + Tailwind 4 + React Query 5
    ├── src/pages/    16 route components
    ├── src/lib/      per-domain {types,endpoints,hooks}.ts modules
    └── src/i18n/     i18next, 3 locales (en, ru, tg), 14 namespaces each
```

### Running the backend — IMPORTANT

The backend does **not** use a venv. It runs on the **conda base environment**:

```bash
source ~/miniconda3/etc/profile.d/conda.sh && conda activate base
cd backend && python -m pytest app/tests -q
```

Running `python -m pytest` without activating conda base fails with
`ModuleNotFoundError: No module named 'aiogram'`. This is an environment
issue, not a code issue — do not "fix" it by adding dependency shims.

### Running the frontend

```bash
cd frontend
npm run dev          # vite dev server
npm run build        # tsc -b && vite build
npm test             # vitest run
npx tsc -b --noEmit  # typecheck only
```

### Architectural conventions to preserve

- **Money is never a JS number.** `price` is a decimal *string* end-to-end; `lib/money.ts` uses `big.js`. Never parse money into `number`.
- **Frontend API paths are relative** (`/courses/`, not `/api/v1/courses/`). The axios `baseURL` in `lib/auth/env.ts` already includes `/api/v1`. A previous bug was a doubled prefix — do not reintroduce it.
- **Pagination** uses the shared `Paginated<T>` from `lib/pagination.ts` with `total_pages` (not `pages`).
- **Business logic lives in services**, not routers. Routers stay thin.
- **Images/files are uploaded via dedicated endpoints**, never as fields on create/update payloads. See §2 — this convention is precisely what the P0 bug violates.

### Uncommitted-work warning

At audit time `git status` showed **116 uncommitted changes** — the `backend/`
directory restructure (files moved from repo root into `backend/`) plus a
modified `CONTRACT.md`. **Commit this restructure before starting**, so the
fixes below land as reviewable diffs rather than being buried in a giant
move commit.

---

## 2. P0 — `POST /api/v1/courses/` returns HTTP 500 unconditionally

**This is the highest-priority item in the entire codebase. Course creation is completely broken in production.**

### The defect

`backend/app/services/course_service.py:47` constructs the `Course` model with:

```python
course = Course(
    title=data.title,
    description=data.description,
    photo_path=data.photo_path,   # <-- line 47: this attribute does not exist
    start_date=data.start_date,
    ...
)
```

But `CourseCreate` (`backend/app/schemas/course.py:31-40`) declares **no `photo_path` field**:

```python
class CourseCreate(BaseModel):
    model_config = {"extra": "forbid"}
    title: str = Field(min_length=1, max_length=255)
    description: str
    start_date: date
    end_date: date
    exam_type: CourseExamType
    price: Decimal = Field(gt=0)
    mentor_id: int
    schedules: List[CourseScheduleCreate] = Field(min_length=1)
```

Under Pydantic v2, attribute access on an undeclared field raises:

```
AttributeError: 'CourseCreate' object has no attribute 'photo_path'
```

Every single `POST /api/v1/courses/` call hits this before touching the DB.

### The correct fix — DELETE line 47

**Do NOT "fix" this by adding `photo_path` to `CourseCreate`.** That would be wrong for three independently verified reasons:

1. `CourseCreate` sets `model_config = {"extra": "forbid"}`. Adding the field makes it a **client-settable filesystem path** on a public endpoint — a path-traversal / arbitrary-path-write footgun.
2. `photo_path` is exclusively owned by the dedicated image-upload endpoint `POST /api/v1/courses/{id}/image/` (router `courses.py:109`), which sets it at `course_service.py:197` (`course.photo_path = new_path`) after running the file through `storage_service`. `CourseUpdate` correctly has no `photo_path` either.
3. The frontend already knows this. `frontend/src/lib/courses/types.ts:24-33` defines `CourseCreate` **without** `photo_path`, and `frontend/src/lib/courses/formMapping.ts:16` carries an explicit comment:
   > `photo_path is intentionally excluded: images are uploaded via the [separate endpoint]`

So no client ever sends this field. Line 47 is simply dead, incorrect code that was never exercised because the create path was broken.

**Action:** delete the single line `photo_path=data.photo_path,` from `backend/app/services/course_service.py:47`. `Course.photo_path` is `nullable=True` (`app/models/course.py:34`), so it correctly defaults to `NULL` on creation and is populated later by the upload endpoint.

### Blast radius — this one line causes 10 test failures

Course creation is a fixture dependency across the suite, so the single defect
cascades. Current backend result: **10 failed, 53 passed**. All 10 failures
share the identical `AttributeError` root cause:

```
FAILED app/tests/integration/test_audit_logs.py::test_audit_logs_workflow
FAILED app/tests/integration/test_course_copy.py::test_course_copy_flow
FAILED app/tests/integration/test_courses.py::test_create_course_success
FAILED app/tests/integration/test_courses.py::test_update_course_mentor_history
FAILED app/tests/integration/test_coverage_gaps.py::test_course_get_schedule_delete
FAILED app/tests/integration/test_endpoints_rbac.py::TestCoursesEndpointGroup::test_superadmin_can_manage_courses
FAILED app/tests/integration/test_enrollment.py::test_enroll_student_success
FAILED app/tests/integration/test_finance.py::test_payment_registration_and_discounts
FAILED app/tests/integration/test_journals.py::test_journal_operations
FAILED app/tests/integration/test_mentor_history.py::test_mentor_history_logs_workflow
```

### Verification

```bash
source ~/miniconda3/etc/profile.d/conda.sh && conda activate base
cd backend && python -m pytest app/tests -q
```

**Expected after fix: 63 passed, 0 failed.** If any test still fails, it is a
genuinely separate defect — investigate it on its own merits and report it;
do not paper over it.

Then manually confirm the full image lifecycle still works:
`POST /courses/` (photo_path is NULL) → `POST /courses/{id}/image/` → `GET /courses/{id}` returns a populated `photo_path`.

---

## 3. P1 — Deprecated Starlette constant

`backend/app/api/v1/documents.py:30` uses `HTTP_413_REQUEST_ENTITY_TOO_LARGE`, which emits:

```
StarletteDeprecationWarning: 'HTTP_413_REQUEST_ENTITY_TOO_LARGE' is deprecated.
Use 'HTTP_413_CONTENT_TOO_LARGE' instead.
```

Replace with `HTTP_413_CONTENT_TOO_LARGE`. The numeric status code is unchanged (413), so no contract or frontend change is needed. This is the only warning in the entire backend suite; fixing it gets the suite to zero warnings.

---

## 4. P1 — The one remaining mock: Settings System & Notifications tabs

### Current state

`frontend/src/pages/Settings.tsx` has three tabs (`"profile" | "system" | "notifications"`, state at line 11).

- **Profile tab — REAL.** `handleSaveProfile` (line 42) calls `useUpdateOwnProfile()` against `PATCH /api/v1/users/me`. Populated from `useCurrentUser()` (line 13). **Leave this alone.**
- **System + Notifications tabs — FAKE.** `handleSave` (lines 59-63) is:

```ts
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);                           // shows a success toast
    setTimeout(() => setSaved(false), 3000);  // ...and persists nothing
  };
```

The four bound values are pure local `useState` with hardcoded defaults and no persistence layer anywhere:

```
line 33: const [currency, setCurrency]           = useState<string>("TJS");
line 34: const [orgName, setOrgName]             = useState<string>("Учебный центр ИМКОН");
line 37: const [notifyPayments, setNotifyPayments] = useState<boolean>(true);
line 38: const [notifyDebts, setNotifyDebts]       = useState<boolean>(true);
```

This is the worst kind of remnant: it **lies to the user**, showing a success confirmation for a save that never happened. It must not ship in this state.

### There is no backend for this

Confirmed: no `OrgSettings` model, no settings table, no migration, and no `/settings` route anywhere in `backend/app/api/v1/`. `PRD-IMKON-CRM.md` never describes organization name or currency as configurable.

### DECISION REQUIRED FROM THE USER — do not guess

**Option A (recommended): delete the two fake tabs.** Currency is hardcoded `"TJS"` system-wide (see `lib/money.ts` consumers) and the org name appears as a constant. A settings table nobody reads is worse than no table, and shipping a lying save button is worse than shipping neither. Reduces `Settings.tsx` to the working Profile tab.

**Option B: build the backend properly.** Roughly a half-day:
1. `OrgSettings` model — singleton row (`id=1`) or a key-value `settings` table.
2. Alembic migration in `backend/alembic/versions/`.
3. `GET /api/v1/settings/org` (any authenticated user — the frontend needs currency) and `PATCH /api/v1/settings/org` (superadmin only, via `require_superadmin` as used in `users.py:38`).
4. Register the router in `app/main.py` alongside the other 12.
5. New `frontend/src/lib/settings/{types,endpoints,hooks}.ts`, following the exact shape of `lib/notifications/` (the most recently added, cleanest example).
6. Wire `handleSave` to the real mutation.
7. Document both endpoints in `CONTRACT.md` in the neighboring format.
8. Integration tests: non-superadmin gets 403 on PATCH; GET returns the singleton.
9. If currency becomes dynamic, audit every hardcoded `"TJS"` in the frontend — otherwise the setting will be silently ignored by the UI, recreating the same lie.

**Whichever is chosen, the no-op `handleSave` must not survive.**

---

## 5. What is NOT broken — do not "fix" these

Verified working during this audit. Touching them is out of scope and risks regressions.

- **CRUD is complete.** Every mutation hook is bound to real UI: create/edit/delete for students, mentors and courses; `useWithdrawEnrollment`; `useUploadDocument`/`useDeleteDocument`; `useCreatePayment`; `useBatchUpdateJournalEntries`; `useUpdateJournalStudentSummary`; `useCopyCourse`; `useUploadAvatar`/`useUploadCourseImage`. No orphaned hooks.
- **All 12 backend routers are registered** in `app/main.py` and reachable.
- **Notifications is fully implemented** end-to-end (backend + frontend + popover badge). `COMPLETION_PLAN.md` §1 is stale.
- **Auth is complete**: login, refresh, logout, email verification, set-password, and a 3-step password reset, with route guards (`AuthGuard`, `RoleGuard`, `GuestRoute`, `SetPasswordRoute`).
- **Responsive layouts exist.** 26 components use `sm:`/`md:`/`lg:` breakpoints; 7 use `overflow-x-auto`. `MentorsTable.tsx` and `StudentsTable.tsx` each ship a *separate mobile card layout* alongside the desktop table — preserve both render paths when editing them.
- **Frontend test + typecheck are green.** Keep them that way.

---

## 6. P2 — Loading & error UX (the largest genuine UI/UX gap)

The primitives already exist and are well built — they are simply barely adopted.

- `components/ui/TableSkeletonRows.tsx`
- `components/ui/TableErrorState.tsx`

**Adoption: 2 of 23** components that track `isLoading` use the skeleton (only `MentorsTable.tsx` and `StudentsTable.tsx` — use these two as the reference implementation). Everything else renders a bare text line; e.g. `ActivityFeed.tsx:47` renders the raw string `t("loadingActivity")`.

### 6a. 21 components with `isLoading` but no skeleton

```
pages/Audit.tsx                              pages/Courses.tsx
pages/CourseProfile.tsx                      pages/Journals.tsx
pages/JournalDetail.tsx                      pages/Mentors.tsx
pages/MentorProfile.tsx                      pages/Students.tsx
pages/Notifications.tsx                      pages/StudentProfile.tsx
components/courses/CourseRosterSection.tsx   components/courses/CourseFormPanel.tsx
components/courses/EnrollStudentModal.tsx    components/documents/DocumentsTab.tsx
components/notifications/NotificationPopover.tsx
components/dashboard/AccountantDashboard.tsx components/dashboard/AttentionList.tsx
components/dashboard/MentorDashboard.tsx     components/finance/DebtorsTab.tsx
components/finance/FinanceAnalyticsTab.tsx   components/journals/JournalPeriodSection.tsx
```

Note `TableSkeletonRows` is table-shaped. Card/chart surfaces (the dashboard
components, `FinanceAnalyticsTab`, `NotificationPopover`) need a small sibling
primitive — add `components/ui/CardSkeleton.tsx` in the same style rather than
forcing table rows into card layouts.

### 6b. 10 components with `isLoading` but no `isError` handling at all

These fail **silently** — on error they render an empty state indistinguishable from "no data", which is actively misleading:

```
pages/Audit.tsx                              pages/Notifications.tsx
components/notifications/NotificationPopover.tsx
components/dashboard/AccountantDashboard.tsx components/dashboard/AttentionList.tsx
components/dashboard/MentorDashboard.tsx     components/courses/CourseFormPanel.tsx
components/courses/EnrollStudentModal.tsx    components/finance/DebtorsTab.tsx
components/finance/FinanceAnalyticsTab.tsx
```

Each needs an `isError` branch with a retry action. `TableErrorState` already
takes an `onRetry` prop — wire it to the query's `refetch()`.

### 6c. `ActivityFeed.tsx` bypasses React Query

`components/dashboard/ActivityFeed.tsx:13-18` hand-rolls data fetching with `useEffect` + `useState` + `.then/.catch/.finally`, unlike every other data path in the app. Consequences: no caching, no retry, no refetch-on-focus, no query-key invalidation, and a `.catch(() => setLogs([]))` that **swallows errors into an empty list**.

Convert to a `useAuditLogs(1, 5)` React Query hook — the hook already exists in `lib/audit/hooks.ts`. This single change also resolves its entries in both 6a and 6b.

---

## 7. P2 — Finish the localization sweep

i18next is fully configured: 3 locales (`en`, `ru`, `tg`) × 14 namespaces, plus `i18n/formatters.ts` for dates/numbers. The infrastructure is done — this is an **unfinished sweep**, not missing plumbing.

**293 hardcoded Cyrillic strings remain across 44 production files** (a further 54 sit in 5 `.test.ts` files, which are assertion fixtures and should **not** be translated).

Detection command (the same one `LOCALIZATION_PLAN.md` uses):

```bash
cd frontend/src && grep -rn "[А-Яа-яЁё]" . --include="*.tsx" --include="*.ts" \
  | grep -v "i18n/locales" | grep -v "\.test\."
```

Priority order — heaviest first, these are the most-visited screens:

| File | Count |  | File | Count |
|---|---|---|---|---|
| `pages/CourseProfile.tsx` | 35 | | `pages/SetPassword.tsx` | 6 |
| `components/courses/CourseFormPanel.tsx` | 21 | | `lib/users/formMapping.ts` | 6 |
| `components/courses/ScheduleEditor.tsx` | 19 | | `lib/mentorFormSchema.ts` | 6 |
| `components/courses/CourseRosterSection.tsx` | 17 | | `components/courses/CoursesToolbar.tsx` | 6 |
| `pages/Notifications.tsx` | 14 | | `pages/Login.tsx` | 5 |
| `pages/MentorProfile.tsx` | 14 | | `lib/courses/formMapping.ts` | 5 |
| `components/students/StudentFormPanel.tsx` | 13 | | `lib/authSchema.ts` | 5 |
| `lib/courseFormSchema.ts` | 12 | | `components/courses/CourseCard.tsx` | 5 |
| `pages/VerifyEmail.tsx` | 11 | | `pages/Settings.tsx` | 4 |
| `components/mentors/MentorFormPanel.tsx` | 9 | | `lib/auth/errorMessages.ts` | 4 |
| `pages/Journals.tsx` | 8 | | `components/ui/AvatarUploadField.tsx` | 4 |
| `components/ui/ThemeToggle.tsx` | 8 | | `components/notifications/NotificationPopover.tsx` | 4 |
| `lib/studentFormSchema.ts` | 7 | | `components/documents/DocumentsTab.tsx` | 4 |
| `components/courses/CourseImageUploadField.tsx` | 7 | | `components/courses/EnrollStudentModal.tsx` | 4 |

Remaining files have 1-4 matches each: `components/courses/CourseListRow.tsx`, `lib/image.ts`, `components/courses/EmptyState.tsx`, `components/courses/CoursesStatsStrip.tsx`, `lib/users/media.ts`, `lib/auth/errors.ts`, `components/ui/TableErrorState.tsx`, `components/ui/ConfirmDialog.tsx`, `components/Sidebar.tsx`, `pages/StudentProfile.tsx`, `components/ui/UserStatusBadge.tsx`, `components/ui/SlideOver.tsx`, `components/ui/Modal.tsx`, `components/students/StudentsTable.tsx`, `components/finance/DebtorsTab.tsx`, `components/courses/MentorAvatarStack.tsx`.

### Localization notes

- The `lib/*Schema.ts` and `lib/*/formMapping.ts` files contain Cyrillic **validation messages**. Zod schemas are defined at module scope where the `t` function is unavailable — emit message *keys* and translate at render time in the form component, rather than calling `t` at module level.
- Watch for a latent trap: `pages/CourseProfile.tsx:107` uses `t("copySuffix", "копия")` — an inline Cyrillic *default value*. These pass a naive grep for `t(` but are still untranslated fallbacks.
- `pages/Settings.tsx:34` hardcodes `"Учебный центр ИМКОН"`; if §4 Option A is chosen, that line disappears with the tab.
- Add keys to **all three** locale files (`en`, `ru`, `tg`) — a key present in only one locale silently falls back and looks like a bug in the others.

---

## 8. Execution roadmap

Work top-down. Each phase ends green before the next begins.

### Phase 1 — Core Backend & Data (P0, ~half day)
1. Commit the pending `backend/` restructure first (§1).
2. Delete `course_service.py:47` (§2). **Highest value change in the repo.**
3. Fix the deprecated 413 constant (§3).
4. Run the backend suite under conda base. **Gate: 63 passed, 0 failed, 0 warnings.**
5. Resolve the §4 Option A/B decision with the user.

### Phase 2 — Missing UI & Actions (~1 day, or ~half day for Option A)
6. Execute the §4 decision. The no-op `handleSave` must not survive either path.
7. Convert `ActivityFeed` to React Query (§6c).
8. **Gate:** `npx tsc -b --noEmit` clean, `npm test` 108+ passing.

### Phase 3 — UX Polish (~2 days)
9. Add `CardSkeleton` primitive; roll skeletons across the 21 components (§6a).
10. Add `isError` + retry to the 10 silent-failure components (§6b).
11. Localization sweep in the priority order above (§7).
12. **Gate:** typecheck clean, both suites green, the §7 grep returns 0 production matches.

---

## 9. Open questions for the user

1. **Org settings (§4)** — delete the two fake tabs, or build the `OrgSettings` backend? *Recommendation: delete.*
2. **Localization scope (§7)** — all 293 production strings, or user-facing pages only (deferring the `lib/` validation-message refactor, which is the fiddliest part)?
3. **Currency** — should it ever be configurable, or is hardcoded `TJS` permanent? This determines whether §4 Option B is worth building at all.

---

## 10. Ground rules for the implementing agent

- **Do not trust the older plan docs.** `AUDIT_FIX_PLAN.md`, `COMPLETION_PLAN.md`, `JOURNAL_REDESIGN_PLAN.md`, and `LOCALIZATION_PLAN.md` are historical. `COMPLETION_PLAN.md` in particular describes already-shipped Notifications work as outstanding. **This file supersedes all of them.**
- **Do not add `photo_path` to `CourseCreate`.** See §2 for the three reasons. Delete the service line.
- **Verify, don't assume.** Run the suites before claiming a phase complete, and quote the actual pass/fail counts.
- **Report honestly.** If a test still fails after the §2 fix, that is a new finding — surface it rather than adjusting the test to pass.
- **Don't widen scope.** Items in §5 are working; leave them alone.
- **Stop and ask** on the §9 questions rather than guessing — each changes what gets built.
