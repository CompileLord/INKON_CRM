# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Auth API

Client for the FastAPI backend's `/api/v1/auth/*` endpoints, in `src/lib/auth/`:

- `types.ts` — request/response models derived from the OpenAPI spec.
- `errors.ts` — `AuthApiError` (HTTP status + FastAPI `detail`, including the 422 validation array) and `NetworkError` (no response at all — timeout, offline, etc.).
- `tokenStorage.ts` — the `TokenStorage` interface plus the default implementation (access token in memory, refresh token in `localStorage`). Swap it by pointing `src/store/authStore.ts` at a different factory — nothing in `httpClient.ts`/`endpoints.ts` needs to change.
- `session.ts` — a tiny logout-event emitter so the HTTP layer can signal "session ended" without importing React/Zustand.
- `httpClient.ts` — the shared axios instance: base URL, timeout, JSON headers, automatic `Authorization: Bearer` injection, and the single-flight 401 refresh/retry-once interceptor.
- `endpoints.ts` — one named function per endpoint: `login`, `refresh`, `logout`, `verifyCode`, `resendCode`, `setPassword`, `passwordResetRequest`, `passwordResetVerify`, `passwordResetConfirm`.

### Env vars

| Var | Used by | Default |
|---|---|---|
| `VITE_API_BASE_URL` | the app (Vite only exposes `VITE_`-prefixed vars to client code) | `http://35.228.205.63:8001/api/v1` |
| `API_BASE_URL` | `scripts/smoke-test.mjs` (plain Node, not bundled by Vite) | `http://35.228.205.63:8001/api/v1` |

Set them in `.env` (app) or the shell/CLI flag (smoke test).

### Running the smoke test

Plain Node script, no TS build step required — hits the live server directly:

```bash
node scripts/smoke-test.mjs --email you@example.com --password yourpassword
# or: npm run smoke-test -- --email you@example.com --password yourpassword

# also exercise resend-code/verify-code (only meaningful for an unverified account):
node scripts/smoke-test.mjs --email you@example.com --password yourpassword --code 123456

# also exercise set-password, if the account needs one:
node scripts/smoke-test.mjs --email you@example.com --password yourpassword --new-password NewSecret123

# point at a different server:
node scripts/smoke-test.mjs --email you@example.com --password yourpassword --base-url http://localhost:8001/api/v1
```

It walks login → (resend-code/verify-code if `--code` given, and/or set-password if `must_set_password` and `--new-password` given) → refresh → logout, then checks the revoked refresh token is actually rejected. It never prints tokens, passwords, or codes — only status codes and booleans. Required steps (login/refresh/logout) exit non-zero on failure; the code/set-password steps and the post-logout revoke check are informational.

### Running the unit tests

```bash
npm test          # one-shot
npm run test:watch
```

Uses Vitest with `axios-mock-adapter` attached to the real `httpClient` instance, so tests exercise the actual interceptors (auth-header injection, 401 refresh/retry) rather than re-implementing them. Covers all nine endpoints plus the concurrent-401 refresh race (`src/lib/auth/httpClient.test.ts`).

### Usage

```ts
import {
  login,
  refresh,
  logout,
  verifyCode,
  resendCode,
  setPassword,
  passwordResetRequest,
  passwordResetVerify,
  passwordResetConfirm,
} from "./lib/auth/endpoints";
import { AuthApiError, NetworkError } from "./lib/auth/errors";

// login
const tokens = await login("user@example.com", "password123");
// tokens: { access_token, refresh_token, token_type, must_set_password }

// refresh
const refreshed = await refresh(tokens.refresh_token!);

// logout — revokes refresh_token server-side; caller still clears local state
await logout(tokens.refresh_token!);

// verify-code — first-activation flow; returns a token pair (often must_set_password: true)
const verified = await verifyCode("user@example.com", "123456");

// resend-code — 204 No Content
await resendCode("user@example.com");

// set-password — needs the caller's current (possibly temporary) access token;
// httpClient attaches it automatically from tokenStorage
const afterSetPassword = await setPassword("newSecret123");

// password reset, 3 steps — carry the token forward, don't re-ask for the code
await passwordResetRequest("user@example.com");
const { reset_token } = await passwordResetVerify("user@example.com", "654321");
const afterReset = await passwordResetConfirm(reset_token, "newSecret123");

// errors
try {
  await login("user@example.com", "wrong");
} catch (err) {
  if (err instanceof AuthApiError) {
    console.log(err.status, err.detail, err.fieldErrors); // never logs the password itself
  } else if (err instanceof NetworkError) {
    console.log("offline or unreachable");
  }
}
```

Note: `PasswordResetVerifyResponse.reset_token` is an assumption — the OpenAPI spec types `password-reset/verify`'s response as a bare, fieldless object. The name was inferred by analogy with `password-reset/confirm`'s request field of the same name; if the live server names it differently, only `types.ts`/`endpoints.ts`'s `passwordResetVerify` need to change.

## Users API

Client for `/api/v1/users/*`, in `src/lib/users/`, built on the same shared `httpClient` as auth (every call gets the `Authorization` header and the 401 refresh/retry-once handling automatically — nothing extra to wire up).

**The API has no `GET /users/` or `GET /users/{id}`.** The only real listing endpoints are the role-scoped `GET /api/v1/students/` and `GET /api/v1/mentors/`, which both already return the same `UserResponse` shape — so `getStudents`/`getMentors` live here instead of a generic "list users." `accountant`/`superadmin` users can be created but never listed or looked up again through any documented endpoint. There is consequently no `useUser`(-by-id) hook — edit/avatar actions work off the row object already in hand from a list query.

- `types.ts` — `Role`, `UserCreate`, `UserUpdate` (note: **not** `Partial<UserCreate>` — the spec's `UserUpdate` has no `role` field at all, since role is immutable after creation), `User`, `PaginatedUsers<T>`.
- `dates.ts` — `dateOnlyToDate`/`dateToDateOnly`, timezone-safe conversions for the date-only `date_of_birth` field (a plain `new Date(str)`/`.toISOString()` round-trip shifts the day in any timezone behind UTC).
- `media.ts` — `resolveMediaUrl(path)` resolves `photo_path`/`thumbnail_path` (bare server paths) to full URLs, `null` when empty; `validateAvatarFile(file)` checks type (jpeg/png/webp) and a 5 MB max size before upload.
- `endpoints.ts` — `createUser`, `updateUser`, `deleteUser`, `uploadAvatar` (multipart `FormData`, field name `file`, `onUploadProgress` + `AbortSignal` support — the client's default JSON `Content-Type` is explicitly cleared so axios sets the multipart boundary itself), `getStudents(params)`, `getMentors(params)` (both take `search`/`page`/`page_size`).
- `hooks.ts` — `@tanstack/react-query` hooks: `useStudents`, `useMentors`, `useCreateUser(role)`, `useUpdateUser(role)`, `useDeleteUser(role)`, `useUploadAvatar(role)`. Every mutation invalidates the matching list's query key on success. `role` is fixed per hook call (`"student" | "mentor"`) rather than read off each payload, since `Students.tsx` only ever creates students and `Mentors.tsx` only ever creates mentors.
- `formMapping.ts` — shared plumbing between the Student and Mentor forms: `buildUserFormValues` (User → form values), `buildCreatePayload`, `buildUpdatePayload` (sends **only** the fields react-hook-form marked dirty — never a full object with nulls for untouched fields), `applyFieldErrors` (maps a 422's `fieldErrors` back onto react-hook-form's `setError`), `describeUserApiError` (403 gets its own message; it never triggers a refresh — only 401 does).

**Where this is wired into the app:** `pages/Students.tsx` and `pages/Mentors.tsx` read live data instead of the local mock store — search (debounced), page-size, and pagination are all real server params. `StudentProfile.tsx`/`MentorProfile.tsx`, Courses, Enrollments, and Journals (all below) are also on real data now; Finance/Documents/Audit still run on the mock store pending their own migration. The mock `data/mock.ts` module itself has been trimmed down to just the still-mock Dashboard data plus two type aliases (`StudentStatus`/`MentorStatus`) kept alive by two currently-unrendered badge components — the mock `Student`/`Mentor`/`Course`/`Journal` data models and the zustand stores built on them (`coursesStore`, `journalsStore`, `studentsStore`, `mentorsStore`) were deleted once nothing referenced them anymore.

### Usage

```ts
import { createUser, updateUser, deleteUser, uploadAvatar, getStudents, getMentors } from "./lib/users/endpoints";
import { useStudents, useCreateUser, useUpdateUser, useDeleteUser, useUploadAvatar } from "./lib/users/hooks";
import { resolveMediaUrl } from "./lib/users/media";
import { AuthApiError } from "./lib/auth/errors";

// list (role-scoped — this is the only way to list users)
const page = await getStudents({ search: "aziz", page: 1, page_size: 20 });
// page: { items: User[], total, page, page_size, total_pages }

// create
const student = await createUser({
  email: "aziz@example.com",
  first_name: "Азиз",
  last_name: "Рахимов",
  role: "student",
  payment_day_of_month: 15, // 1–28
});

// update — send only changed fields
const updated = await updateUser(student.id, { phone: "+992901234567" });

// delete
await deleteUser(student.id);

// avatar upload, with progress + cancellation
const controller = new AbortController();
const withAvatar = await uploadAvatar(student.id, file, {
  onUploadProgress: (e) => console.log(e.loaded, e.total),
  signal: controller.signal,
});
resolveMediaUrl(withAvatar.thumbnail_path); // full URL, or null if empty

// react-query hooks (inside a component)
const { data, isLoading, isError } = useStudents({ page: 1, page_size: 20 });
const createStudent = useCreateUser("student"); // invalidates the students list on success
createStudent.mutate({ email: "...", first_name: "...", last_name: "...", role: "student" });

// errors — 403 is distinct from 401 and never triggers a refresh
try {
  await deleteUser(student.id);
} catch (err) {
  if (err instanceof AuthApiError && err.status === 403) console.log("insufficient permissions");
}
```

## Money — arbitrary-precision decimal strings

The API returns `price`, `price_at_enrollment`, `amount`, `effective_amount`, `total_paid`, and `debt` as strings, not numbers — they're Python `Decimal` values serialized without rounding, and real examples run to 40+ fractional digits. **Never parse these with `Number()`/`parseFloat()`** — that silently rounds to a float64 and corrupts the figure. The rule end to end: keep every monetary value as a string, send it back to the server exactly as received (never reformatted or rounded), and only convert to a display string at the last moment via `src/lib/money.ts`.

- `formatMoney(value, { suffix? })` — display-only: thousands separators + fixed 2 decimals (`"1234567.5"` → `"1 234 567.50"`). Never feed its output back into a request.
- `previewEffectiveAmount(amount, discountPercent)` — a live client-side preview of a payment's discount before submit; not authoritative, the server computes the real `effective_amount`.
- `addMoney` / `subtractMoney` / `compareMoney` / `isPositiveMoney` / `isValidMoneyString` — exact arithmetic/validation built on [`big.js`](https://github.com/MikeMcl/big.js), configured with `Big.DP = 100` so a value with far more fractional digits than any real payment still round-trips exactly.

```ts
import { formatMoney, isValidMoneyString } from "./lib/money";

const price = "436688811034941926602435971499369190867.07"; // from CourseResponse.price
isValidMoneyString(price); // true
formatMoney(price, { suffix: "TJS/мес" }); // "436688811034941926602435971499369190867.07 TJS/мес" (display only)
// price itself is still the original string — send exactly that back on update, never the formatted one
```

## Courses API

Client for `/api/v1/courses/*`, in `src/lib/courses/`, built on the shared `httpClient`.

- `types.ts` — `CourseCreate`, `CourseUpdate`, `CourseResponse`, `CourseScheduleCreate`/`Response`, `CourseMentorHistoryResponse`, `CourseExamType` (`weekly | monthly`), `CourseStatus` (`active | archived`). **`CourseUpdate` has no `price`, `exam_type`, or `schedules` field at all** — those are immutable after creation via this API, not just optional; the edit form shows them read-only. `CourseProgressChartResponse` is `Record<string, unknown>` — the spec types `GET /courses/{id}/progress-chart` as `additionalProperties: true` and no live sample was available while building this, so `CourseProgressChart.tsx` extracts a label/value series from a few plausible shapes and falls back to a raw JSON dump rather than silently hiding real data it doesn't recognize.
- `endpoints.ts` — `createCourse`, `listCourses` (`status`/`page`/`page_size` — **no text-search param exists server-side**, see below), `getCourse`, `updateCourse`, `deleteCourse`, `getCourseSchedule` (bare array), `copyCourse` (id + a full `CourseCreate` body — the endpoint doesn't infer anything from the source course, the caller resends every field), `getCourseMentorHistory` (bare array), `getCourseProgressChart`.
- `hooks.ts` — `useCourses`, `useCourse`, `useCourseSchedule`, `useCourseMentorHistory`, `useCourseProgressChart`, `useCreateCourse`, `useUpdateCourse`, `useDeleteCourse`, `useCopyCourse`. Mutations invalidate the course list, the specific course, and (for updates) its mentor-history query.
- `formMapping.ts` / `courseFormSchema.ts` — one `CourseFormValues` shape covers both create and edit; `buildCourseCreatePayload` builds the full `CourseCreate`, `buildCourseUpdatePayload` sends only dirty, patchable fields (silently drops `price`/`exam_type`/`schedules` even if somehow marked dirty, since `CourseUpdate` can't carry them).

**No server-side text search:** `GET /courses/` only accepts `status`/`page`/`page_size`. `Courses.tsx` loads one `page_size: 100` batch and does search + sort client-side over it — fine at the current catalog size, but a course beyond the first 100 (by whatever order the server returns) won't be searchable until pagination is added.

**Schedule times:** `CourseScheduleCreate.time_start`/`time_end` are OpenAPI `format: time`. No live sample confirmed the exact wire format, so `formMapping.ts` sends `"HH:MM:SS"` (appending `:00` to the `<input type="time">` value) as the standard Pydantic `time.isoformat()` output — verify against a real create call and adjust `toTimeOfDay()` if the server expects something else.

## Enrollments API

Client for `/api/v1/enrollments/*`, in `src/lib/enrollments/`. No standalone page — consumed inside `CourseProfile.tsx` (roster, enroll, withdraw) and, via `useCourseRoster`, inside `JournalDetail.tsx` too.

**`GET /enrollments/` has no `student_id`/`course_id` filter in the spec** — only `page`/`page_size`. `hooks.ts`'s `fetchFilteredEnrollments` sends the filter anyway (FastAPI sometimes under-documents accepted params), checks whether every item in the response actually matches it, and — only if the server ignored it — falls back to paging through the unfiltered list and filtering client-side. `useCourseEnrollments`/`useStudentEnrollments` are thin `useQuery` wrappers around it.

`useCourseRoster(courseId)` joins each enrollment with the enrolled student's identity by calling the existing `getStudentProfile` from the Users API per distinct `student_id` (there's no bare `GET /students/{id}`) — this reuses, and shares a cache key with, `useStudentProfile`.

### Usage

```ts
import { createCourse, listCourses, copyCourse } from "./lib/courses/endpoints";
import { useCourses, useCreateCourse } from "./lib/courses/hooks";
import { createEnrollment, withdrawEnrollment } from "./lib/enrollments/endpoints";
import { useCourseRoster } from "./lib/enrollments/hooks";

// create — price/amount fields are always strings
const course = await createCourse({
  title: "Английский B1",
  description: "Разговорный курс",
  start_date: "2026-01-10",
  end_date: "2026-06-10",
  exam_type: "weekly",
  price: "1500.00",
  mentor_id: 5,
  schedules: [{ day_of_week: 1, time_start: "18:00:00", time_end: "19:30:00" }],
});

// duplicate — resend every field, not just the id
await copyCourse(course.id, { ...course, title: `${course.title} (копия)`, schedules: [...] });

// enroll / withdraw
const enrollment = await createEnrollment({ student_id: 10, course_id: course.id });
await withdrawEnrollment(enrollment.id);

// react-query (inside a component)
const { data } = useCourses({ status: "active", page_size: 100 });
const { rows } = useCourseRoster(course.id); // [{ enrollment, student, avgScore }]
```

## Journals API

Client for `/api/v1/journals/*`, in `src/lib/journals/`.

**⚠️ The two biggest open assumptions in this codebase are here — read before trusting this section:**

1. **There is no `GET /journals/` list endpoint, and nothing in the spec links a journal to a course** (no `journal_id` on `CourseResponse`, no `course_id` on any journal schema). `journalId.ts`'s `journalIdForCourse(courseId)` currently just returns `courseId` unchanged — an unverified working hypothesis that each course has exactly one implicit journal sharing its numeric id. If that's wrong, this one function is the only place to fix.
2. **`GET /journals/{id}` and the response of `PUT /journals/{id}/entries` are both `additionalProperties: true`** — genuinely untyped, and no live sample was available while building this. `parse.ts`'s `parseJournalResponse` extracts an `entries` array and a `summaries` array by checking a few plausible key names (`entries`/`lessons`/`records`/..., `summaries`/`students`/...) against the shape of the two schemas that *are* typed (`JournalEntryUpdate`, `JournalStudentSummaryResponse`). If nothing matches, both come back empty and `JournalDetail.tsx` shows a raw JSON dump instead of silently rendering nothing — but the grid will look empty even when the server has real data, until `parse.ts` is corrected against an actual response.

- `types.ts` — `JournalEntryUpdate` (`student_id`, `lesson_date`, `attendance`, `score` 0–5, `comment?`, `version`), `JournalStudentSummaryUpdate`, `JournalStudentSummaryResponse` (both fully typed by the spec).
- `endpoints.ts` — `getJournal`, `batchUpdateJournalEntries` (PUT, array body), `updateJournalStudentSummary` (PATCH, per-student).
- `parse.ts` — `parseJournalResponse`, `entryKey(studentId, lessonDate)` (the `"student_id:lesson_date"` key both the grid and the parser use to line up cells).
- `hooks.ts` — `useJournal` (fetches + parses), `useBatchUpdateJournalEntries`, `useUpdateJournalStudentSummary`. Mutations invalidate the journal's detail query.

**UI:** `Journals.tsx` lists courses (reusing `useCourses`) as journal entry points — no per-journal fill/attendance stats on the list page, since that would mean fetching every course's journal entries up front with no bulk endpoint to do it cheaply. `JournalDetail.tsx` combines the course header, `useCourseRoster` (from Enrollments) for the student list, and the parsed journal data into:
- `JournalGrid.tsx` — an editable attendance/score table, one column per lesson date (existing dates from the data, plus a date picker to add new ones). Edits accumulate in a local `Map` keyed by `entryKey` and are sent as **one batch `PUT`**, not one request per cell; the map only clears after a successful save so a failed save doesn't lose edits.
- `JournalSummaryPanel.tsx` — per-student exam/bonus score editing via the summary `PATCH`, saved individually (the endpoint is already per-student) with the `version` from the last-seen summary for optimistic-concurrency.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
