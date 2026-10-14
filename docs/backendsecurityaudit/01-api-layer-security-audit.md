# API layer security audit

## 1. Scope

All 46 owned files received separate security and performance passes; tests were read before implementation. Exact scope:

- `backend/app/api/v1/audit_logs.py`
- `backend/app/api/v1/auth.py`
- `backend/app/api/v1/courses.py`
- `backend/app/api/v1/cron.py`
- `backend/app/api/v1/documents.py`
- `backend/app/api/v1/enrollments.py`
- `backend/app/api/v1/finance.py`
- `backend/app/api/v1/journals.py`
- `backend/app/api/v1/mentors.py`
- `backend/app/api/v1/notifications.py`
- `backend/app/api/v1/settings.py`
- `backend/app/api/v1/students.py`
- `backend/app/api/v1/telegram.py`
- `backend/app/api/v1/users.py`
- `backend/app/core/deps.py`
- `backend/app/main.py`
- `backend/app/schemas/accounting_period.py`
- `backend/app/schemas/analytics.py`
- `backend/app/schemas/audit_log.py`
- `backend/app/schemas/auth.py`
- `backend/app/schemas/charge.py`
- `backend/app/schemas/common.py`
- `backend/app/schemas/course.py`
- `backend/app/schemas/debt.py`
- `backend/app/schemas/document.py`
- `backend/app/schemas/enrollment.py`
- `backend/app/schemas/journal.py`
- `backend/app/schemas/ledger.py`
- `backend/app/schemas/notification.py`
- `backend/app/schemas/org_settings.py`
- `backend/app/schemas/payment.py`
- `backend/app/schemas/receipt.py`
- `backend/app/schemas/user.py`
- `backend/app/tests/integration/test_auth_api.py`
- `backend/app/tests/integration/test_avatar.py`
- `backend/app/tests/integration/test_course_copy.py`
- `backend/app/tests/integration/test_courses.py`
- `backend/app/tests/integration/test_coverage_gaps.py`
- `backend/app/tests/integration/test_documents.py`
- `backend/app/tests/integration/test_endpoints_rbac.py`
- `backend/app/tests/integration/test_integrations_and_polish.py`
- `backend/app/tests/integration/test_rbac.py`
- `backend/app/tests/integration/test_settings.py`
- `backend/app/tests/integration/test_student_cabinet_backend.py`
- `backend/test_live_backend.sh`
- `backend/test_live_all_groups.sh`

Read-only context: AGENTS.md, CONTRACT.md, both new plans, the old quality plan and all three old reports; PRD-IMKON-CRM.md; called services, user repository, relevant models, auth helpers and worker delivery paths. All three installed skills and both bundled reference files were read. Shared checklists are absent. No independent finding is attributed to another group.

Executed: Conda base Python with PYTHONDONTWRITEBYTECODE=1 parsed all 44 owned Python files; bash -n passed for both owned live shell scripts. Memory-only AST extraction exercised self-update schema/service, autosave list validation, the original chart handler with result doubles and original login handler with limiter/auth doubles. An isolated Pydantic check of the proposed bounded/unique batch type accepted one unique item and rejected duplicate keys and 501 items. No application import, pytest, source mutation, services, upload, installation or Git operation ran. Source mutation testing is overridden by the no-source-write constraint. Counts below are local synthetic evidence; production timing, query plans and integration behavior remain unmeasured.

## 2. Summary

**Verdict: Request changes. Security score: 4/10.** A mentor can enumerate unrelated students and their parents, while student self-service bypasses the guardian verification flow and redirects notification attachments. Course authorization is also lost through an enrolled mentor's broad profile response. Request bounds leave a separate authenticated workload amplification path. Scores are qualitative; historical passing tests do not prove these boundaries.

Threat model: anonymous callers cross auth/static/cron boundaries; students and mentors cross object/property boundaries; multipart and JSON inputs cross parser/decoder boundaries. Assets include guardian delivery identity, minor/parent contact details, educational documents and financial integrity. STRIDE abuse cases here emphasize disclosure, destination tampering, guardian spoofing and resource exhaustion. Bearer authentication does not imply cookie CSRF; no CSRF finding is inferred.

Previously identified API-02 setup-scope omission, API-03 fail-open cron, API-04 resend throttling, BUS-05/06 reset replay/races and DATA-05 limiter races remain baseline context, not new findings. API-01 public private-document storage remains visible in main.py:67-70,97-101; no duplicate standalone finding is presented. BUS-01 and BUS-02 require the business review's independently verified identity/concurrency evidence. This score includes those unresolved baseline controls without copying them.

## 3. Findings

### SEC-API-01 — High — Self-service replaces the verified guardian delivery destination

**Category:** OWASP API3:2023 Broken Object Property Level Authorization / CWE-862. **Review disposition:** Critical:. **Location:** backend/app/schemas/user.py:32-39; backend/app/api/v1/users.py:28-35.

```python
class UserSelfUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    parent_telegram_chat_id: Optional[int] = None
    parent_phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
return await user_service.update_own_profile(current_user.id, payload)
```

The schema explicitly permits these properties, but no guardian approval or proof accompanies them. PRD F-36:1433-1440 describes a parent binding their own Telegram through a contact lookup and confirmation; F-28:1146-1150 targets results to that parent. A student can submit `{"parent_telegram_chat_id":123456}` for a chat they control after initiating that bot chat. The worker later sends results and available exam documents to the replaced destination, while the legitimate guardian receives nothing. This does not grant cross-student access: the impact is impersonation of the configured guardian and disclosure of this student's educational attachments to an unverified destination.

Memory-only execution of the original schema and update_own_profile method accepted the supplied chat ID and changed the synthetic user's existing binding. Supporting trace: user_service.py:92-115 directly assigns the property; tasks.py:69-87,103-123 reads it and sends messages/documents. No rebind audit or challenge intervenes. This is a new HTTP property bypass, distinct from BUS-17's wrong-phone lookup inside the bot.

**Concrete fix:** remove guardian fields from ordinary self-service; keep administrator changes in UserUpdate. Offer a separate expiring guardian invitation that proves control and requires the intended authorization before changing the destination. Corrected self input:

```python
class UserSelfUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    date_of_birth: Optional[date] = None
    phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
```

Remove corresponding self-service assignments. Proposed checks: student's chat/parent-phone payload returns 422 and leaves the stored guardian unchanged; authenticated approved binding succeeds; unverified and reused invitations fail; document jobs read only the approved binding.

### SEC-API-02 — High — A mentor can enumerate every student's and parent's personal data

**Category:** OWASP API1/API3:2023 / CWE-862. **Review disposition:** Critical:. **Location:** backend/app/api/v1/students.py:18-31; backend/app/schemas/user.py:42-58.

```python
if current_user.role not in [UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.MENTOR]:
    raise HTTPException(...)
return await user_service.get_students(
    page=pagination.page, page_size=pagination.page_size, search=search)
```

The route checks role but carries neither mentor identity nor course ownership into the query. Supporting trace: user_service.py:137-143 delegates to user_repository.py:36-46, whose predicate is only student role/nondeleted plus optional search. A mentor with zero courses can page through the institution's entire student directory. UserResponse exposes email, DOB, phone, parent phone and guardian Telegram ID. The 100-row page cap slows enumeration but does not authorize it. F-07's PRD acceptance criterion limits mentors to students in their courses; the detail route applies that rule, while this list bypasses it. This is a new reachable disclosure path, not the previous tests-quality finding API-09.

**Concrete fix:** pass a server-derived mentor filter through the service and repository before both count and page queries. Never accept that restriction from the client. The corrected API call and repository predicate proposal are:

```python
mentor_id = current_user.id if current_user.role == UserRole.MENTOR else None
return await user_service.get_students(
    page=pagination.page, page_size=pagination.page_size,
    search=search, mentor_id=mentor_id)
```

```python
if mentor_id is not None:
    owned_students = select(Enrollment.student_id).join(
        Course, Course.id == Enrollment.course_id
    ).where(
        Course.mentor_id == mentor_id,
        Course.is_deleted.is_(False),
        Enrollment.is_deleted.is_(False),
    )
    query = query.where(User.id.in_(owned_students))
```

Add the optional parameter to both existing method signatures and use the filtered query for total and items. Decide active/withdrawn inclusion explicitly rather than silently changing it. Proposed tests: an unrelated student with parent contacts is excluded from items, search and total; a mentor without courses gets zero; own-course students remain visible; allowed administrator behavior remains intact.

### SEC-API-03 — Medium — One mentor relationship exposes courses the student cannot otherwise access

**Category:** OWASP API1/API3:2023 / CWE-200. **Review disposition:** Required (no prefix). **Location:** backend/app/api/v1/mentors.py:66-108; backend/app/schemas/user.py:42-58,120-124.

```python
Enrollment.student_id == current_user.id,
Course.mentor_id == id,
...
stats = await user_repo.get_mentor_profile_stats(id)
return {"user": target_user, "active_courses": stats["active_courses"], ...}
```

Enrollment in course A satisfies the existence check, then the shared profile returns every active course of the mentor, including course B, plus the full UserResponse. The dependency query user_repository.py:326-333 filters by mentor/status/deletion, not student enrollment. A student denied GET /courses/B can still obtain B's description, dates, price and identifiers via GET /mentors/M/profile. The PRD role matrix restricts students to their own courses. Full mentor DOB/parent fields widen the response unnecessarily when populated; no claim is made that every mentor has those values. A broad mentor profile was intended for administrators and mentors in F-08; the added student branch lacks a narrow response boundary.

**Concrete fix:** provide students a separate public mentor card, with only name/avatar and the student's enrolled course subset. An explicit early return with a dedicated response DTO prevents returning full analytics/contact fields:

```python
class StudentMentorCard(BaseModel):
    id: int
    first_name: str
    last_name: str
    photo_path: Optional[str] = None

if current_user.role == UserRole.STUDENT:
    return StudentMentorCard(
        id=target_user.id, first_name=target_user.first_name,
        last_name=target_user.last_name, photo_path=target_user.photo_path)
```

Change the route response annotation/model to `MentorProfileResponse | StudentMentorCard` and maintain the existing enrollment check. If student courses are needed, query them with the same enrollment predicate as course access. Proposed regression: enroll only in A; response excludes B and nonpublic contact fields while staff's permitted profile remains complete.

### SEC-API-04 — Medium — Autosave accepts unlimited repeated cells and comments

**Category:** OWASP API4:2023 Unrestricted Resource Consumption / CWE-400. **Review disposition:** Required (no prefix). **Location:** backend/app/api/v1/journals.py:32-40; backend/app/schemas/journal.py:47-54.

```python
payload: List[JournalEntryUpdate]
comment: Optional[str] = None
```

An authorized mentor of an active course can repeat one schema-valid cell arbitrarily; there is no list length, duplicate-key or comment length limit. Even unchanged duplicate entries are appended individually to applied output, and changed/conflicting repeated entries produce per-item processing. Authorization in the service is present, so the attacker needs mentor access; no anonymous grading privilege is alleged. A memory-only Pydantic check accepted 10,000 identical cells in an 850,001-byte compact JSON body. Service context journal_service.py:431-468,532-545 shows repeated output/iteration despite unique lookup keys. Small unique DB input does not bound request parsing, iteration or serialization. This is a new duplicate-cell amplification path, not BUS-20's full-journal recalculation finding.

**Concrete fix:** bound and deduplicate at the API boundary, and enforce a transport body cap before JSON parsing. Example capacity 500 cells and 2,000 comment characters must be agreed with legitimate autosave requirements:

```python
from typing import Annotated
from pydantic import AfterValidator, Field

def unique_cells(items: list[JournalEntryUpdate]) -> list[JournalEntryUpdate]:
    keys = {(item.student_id, item.lesson_date) for item in items}
    if len(keys) != len(items):
        raise ValueError("Duplicate journal cells")
    return items

JournalBatch = Annotated[
    list[JournalEntryUpdate], Field(max_length=500), AfterValidator(unique_cells)
]
```

Use `payload: JournalBatch`; change the comment field to `Field(None, max_length=2000)`. Proposed checks: 501 cells, duplicate keys and oversized comments fail 422; transport oversize fails 413 before Pydantic; legitimate unique partial-conflict batches retain their contract. Performance measurement is specified in PERF-API-02.

## 4. What is done well

- Live DB role and deactivation checks avoid trusting stale role claims; narrow accountant/superadmin finance guards and explicit mentor ownership protect major mutation paths.
- Student journal rows and chart payloads narrow peer identities correctly; a chart privacy test seeds an adversarial peer. Full student profile visibility for a student's own mentor is specified in F-07 and is not misreported as a cross-course defect.
- Most inputs forbid extra fields, schedules enforce valid days/times, money uses Decimal and response models exclude password hashes. Parameterized SQL and contained storage paths provide useful foundations.
- Telegram webhook secret fails closed; production documentation is disabled, API responses use no-store and useful security headers, and CORS is an explicit configured origin list.
- Tests and live scripts were reviewed without executing state-changing fixtures. Fixed synthetic script credentials are a baseline operational concern, not evidence of a deployed credential.

## 5. Prioritized fixes

1. **M — SEC-API-02:** enforce mentor ownership in both directory count and page queries; test unrelated student/parent data exclusion.
2. **S/M — SEC-API-01:** remove guardian properties from self-service immediately; implement approved verified rebinding separately.
3. **S — SEC-API-03:** give students a narrow mentor card or enrolled-course projection.
4. **S/M — SEC-API-04:** enforce unique bounded batches/comments and a pre-parser body cap.
5. **M/L — baseline context:** address API-01, API-02, API-03 and the independently tracked BUS-01/BUS-02 before release; these are not new findings here.

All corrected snippets are proposals; no source fix or integration/security test execution is claimed.
