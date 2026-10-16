# API layer audit

## 1. Scope

Reviewed every line of the following 44 owned files (4,178 lines). Tests were read before implementation. The review applied correctness, readability/simplicity, architecture, security and performance, with separate assessments of the four requested engineering goals.

API and application wiring:

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

Schemas:

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

Tests:

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

Read-only context: `AGENTS.md`, `CONTRACT.md`, the audit plan, core config/security/rate limiter, DB session, test fixtures, auth/document/storage/user/course/settings/journal/finance services, relevant ORM models, the user repository and Telegram bot setup. Findings below belong to the owned files; dependency reads verify their consequences rather than independently audit other groups.

Verification actually executed: Conda base Python with `PYTHONDONTWRITEBYTECODE=1` parsed all 44 owned files successfully using `ast.parse`. Isolated schema class execution removed imports of `app.*` and supplied enum/type stand-ins: `PaymentCreate` accepted `0.001` and `100000000.00`; `UserSelfUpdate` accepted a telephone without `+`; `OrgSettingsUpdate` silently discarded a misspelled setting. These are narrow validation checks, not integration tests. No app imports, pytest, source mutation, DB requests or uploads were performed. Historical onboarding's 100 passing backend tests are not an audit run. Mutation testing was omitted under the explicit no-source-edit constraint.

## 2. Summary

The API has useful Pydantic boundaries and recognizable FastAPI patterns, but three security blockers prevent treating its authorization as complete. Maintainability and extensibility suffer where routers calculate domain metrics, query ORM entities and instantiate concrete services instead of receiving replaceable collaborators. Scalability is constrained by per-instance changes to a shared Telegram webhook and unbounded chart/history workloads, while regression tests leave important authorization and numeric invariants unproved. The verdict is **request changes**; scores below are qualitative judgments, not measured coverage or load-test results.

| Goal | Score / 10 | Assessment |
|---|---:|---|
| Code quality | 6 | Clear small handlers and strong create validation; incomplete security checks, numeric bounds and regression assertions. |
| Maintainability | 5 | Feature-oriented modules help navigation; chart and analytics domain logic crosses API/service/repository boundaries. |
| Extensibility | 5 | Routers and schemas provide a useful structure; concrete constructors, generic response dictionaries and duplicate dependency helpers reduce substitutability. |
| Scalability | 4 | Async DB access and capped list pages help; global webhook lifecycle, unbounded aggregate reads and Python chart processing need attention. |

## 3. Findings

Required findings use no title prefix, as specified by the review skill; their severity is stated explicitly in metadata. Critical, Optional and FYI prefixes retain the skill's exact meanings.

### API-01 — Critical: Private documents are served without authentication

**Severity:** Critical: · **Category:** security · **Location:** `backend/app/main.py:67–70,97–101`

```python
app.mount("/storage", StaticFiles(directory=settings.STORAGE_PATH), name="storage")
response.headers["Cache-Control"] = "public, max-age=86400"
```

The entire storage tree is exposed by a public ASGI mount. Document uploads use the same root and return predictable `/storage/student/{owner_id}/{filename}` or `/storage/mentor/{owner_id}/{filename}` paths; a caller can fetch a known or guessed private document URL without the `/documents/` listing guard. The student-only-own expectation is explicit in `test_documents.py:56–63`, yet that test only checks metadata listing. StaticFiles performs filesystem safety checks, not this application's authentication or ownership checks; public caching additionally allows copies to survive later revocation.

**Fix:** Mount only intentionally public avatar/course-image directories. Serve documents through `GET /documents/{id}/download` that loads the document, rejects deletion, applies the canonical role/object policy and returns a private/no-store response. For object storage, issue short-lived private signed URLs after the same check. Add anonymous, different-student and revoked-document download tests using the returned file path; checking list visibility alone is insufficient.

### API-02 — Critical: Restricted onboarding tokens receive ordinary account privileges

**Severity:** Critical: · **Category:** security · **Location:** `backend/app/core/deps.py:33–52,55–77`; `backend/app/api/v1/auth.py:75–82`

```python
payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
user_id = int(payload.get("sub"))
...
return user
```

`get_current_user` ignores the signed `scope` claim. `AuthService.login`, `refresh` and `verify_code` emit `scope="must_set_password"`, but all normal route guards consume this dependency and accept those tokens. The separate `check_must_set_password` has no callers. A verified onboarding token for a superadmin can therefore create/delete users or call finance routes before completing password setup. Checking only the current DB flag would also be insufficient: a previously issued restricted token must remain restricted after `must_set_password` becomes false.

**Fix:** Introduce a typed authenticated principal carrying validated token purpose/scope. Make the default application dependency reject restricted scope and users awaiting setup. Use a separate explicit dependency for `/auth/set-password` that accepts the permitted setup token; preserve the separate password-reset-token verifier and its token-type checks. Regression tests must cover ordinary routes for each restricted role, successful setup, and reuse of the original restricted token after setup.

### API-03 — Critical: Scheduler endpoints disable authentication when configuration is missing

**Severity:** Critical: · **Category:** security · **Location:** `backend/app/api/v1/cron.py:9–14,17–32`

```python
if settings.CRON_SECRET and x_cloud_scheduler_secret != settings.CRON_SECRET:
    raise HTTPException(status_code=401, ...)
```

An unset or empty secret makes this condition false for every request. Configuration declares `CRON_SECRET` optional with default `None`, and these endpoints have no other application authentication. Under that valid configuration, anonymous requests can archive courses and trigger reminder work. This is a conditional vulnerability; the audit does not claim the deployed secret is absent.

**Fix:** Fail closed when the secret is absent, reject absent/mismatched headers and compare configured secrets with `hmac.compare_digest`. Require the configuration in production startup, or verify Cloud Scheduler OIDC with its expected audience. Use one `Depends(verify_cron_secret)` guard on the router. Test unset, empty, wrong, missing and correct credentials for both endpoints.

### API-04 — Verification-code resend has no throttling

**Severity:** Required (no prefix) · **Category:** security/performance · **Location:** `backend/app/api/v1/auth.py:66–72`

```python
async def resend_code(payload: ResendCodeRequest, db=Depends(get_db_session)):
    auth_service = AuthService(db)
    await auth_service.resend_code(payload.email)
```

Unlike login, verification and password-reset requests, this anonymous email-sending route applies no rate limit. The service overwrites the stored code and resets its attempt counter each time. Repeated requests can flood a pending user's inbox and invalidate a code immediately before the user submits it, as well as consume SMTP capacity. Service reads confirmed there is no hidden resend limiter.

**Fix:** Apply an email-based resend cooldown and a sender/global request budget before code generation; do not clear the resend limit on successful sending. Preserve the last valid code during the cooldown. Add tests proving repeated calls receive 429 and do not enqueue/send more email or overwrite the accepted code.

### API-05 — Instance shutdown removes the shared Telegram webhook

**Severity:** Required (no prefix) · **Category:** scalability/correctness · **Location:** `backend/app/main.py:23–41`

```python
await bot.set_webhook(...)
...
yield
...
await bot.delete_webhook()
```

The webhook belongs to the bot globally, while lifespan executes per process/Cloud Run instance. During scale-down or a rolling deployment, an old instance can delete the webhook after another live instance has registered it; Telegram delivery then stops despite a healthy serving instance. Startup/shutdown exceptions are also silently suppressed, so this loss has no visible application signal.

**Fix:** Register the webhook through a deployment/admin operation with one owner and remove unconditional deletion from instance shutdown. Close the local bot HTTP session during shutdown instead. Log registration failures with useful context, and test two overlapping application lifetimes: closing one must not delete the shared webhook.

### API-06 — Telegram handler acknowledges failed updates as successful

**Severity:** Required (no prefix) · **Category:** quality/correctness · **Location:** `backend/app/api/v1/telegram.py:20–26`

```python
await dp.feed_update(bot, update)
except Exception as e:
    logger.error(...)
return {"status": "ok"}
```

Both invalid request JSON/schema and operational failures in handlers are caught by the same blanket handler and returned as HTTP 200. A temporary DB or Telegram/API failure therefore acknowledges an update that was not successfully handled, preventing Telegram's retry behavior. The existing webhook test only exercises the successful contact-binding path.

**Fix:** Handle malformed input with an explicit 400/422; allow transient processing failures to produce a retryable 5xx, or persist the update durably before acknowledging and process it with an idempotent background consumer. Test malformed updates, failed processing and successful retries without duplicate effects.

### API-07 — Progress chart uses inconsistent populations and average rules

**Severity:** Required (no prefix) · **Category:** quality/correctness · **Location:** `backend/app/api/v1/courses.py:197–216,225–269,282–298`

```python
Enrollment.status == EnrollmentStatus.ACTIVE
j_summaries = [s for s in summaries if s.journal_id == j.id and s.max_period_score > 0]
avg_pct = round(sum(percentages) / len(journals), 2) if journals else 0.0
```

The student branch excludes only missing or zero-maximum summaries from their average, while the staff branch divides by every journal. A student with one 80% period and one missing/zero-maximum summary (for example, a journal that predates their enrollment) appears with 80% to themselves and 40% to staff. A positive `max_period_score` is not proof that grading occurred: preinitialized ungraded summaries can have a positive maximum and are counted by both branches. Class averages include all summaries, including withdrawn students, while `class_size` and rank include only active enrollments. Access deliberately allows any nondeleted enrollment, so a withdrawn student can receive a fallback rank of `class_size + 1`, an impossible position within the returned class size (including rank 1/class size 0).

**Fix:** Define the chart's roster and grading denominator once in a chart service, then use that policy for class averages, staff averages, rank and class size. If archived/withdrawn students may view their history, define their historical cohort or return an explicitly absent rank. Add a multi-student fixture with missing/zero-maximum summaries, preinitialized positive-maximum ungraded summaries and a withdrawn student, asserting the exact staff/student averages and valid rank semantics.

### API-08 — Monetary inputs exceed the precision and range of persisted amounts

**Severity:** Required (no prefix) · **Category:** quality/correctness · **Location:** `backend/app/schemas/payment.py:16–21`; `backend/app/schemas/ledger.py:40–42,49–55,61–66,72–78`; `backend/app/schemas/course.py:32–42`

```python
amount: Decimal = Field(gt=0)
price: Decimal = Field(gt=0)
```

Decimal preserves exact input values but these schemas impose neither scale nor maximum digits. Persistence uses `Numeric(10, 2)` for ledger amounts and course prices. Isolated execution confirmed `PaymentCreate` accepts `0.001` and `100000000.00`; the service checks positivity before inserting the original amount. The first can become zero when stored and violate the positive-amount constraint; the second exceeds the column range. Validated requests can thus fail as DB errors, and extra fractional digits can silently change financial amounts.

**Fix:** Use one shared money input type with `Field(gt=0, max_digits=10, decimal_places=2)` for payment/refund/discount/adjustment/allocation and course-price inputs. If rounding is a product rule, perform it explicitly before positivity checks and document it. Add boundary tests for sub-cent amounts, three fractional digits, the maximum valid amount and an overflow amount; expect validation errors rather than database failures.

### API-09 — Several regression tests do not exercise the invariant they claim

**Severity:** Required (no prefix) · **Category:** quality/tests · **Location:** `backend/app/tests/integration/test_student_cabinet_backend.py:119–156,159–206`; `backend/app/tests/integration/test_coverage_gaps.py:30–37,41–52`; `backend/app/tests/integration/test_documents.py:56–70`

```python
"""Test active vs archive bucket logic ... and rank calculation with ungraded period exclusion."""
...
assert course_entry["bucket"] == "active"
```

The bucket/rank test creates only an active course and asserts only that bucket; it never creates an archived/withdrawn enrollment, grades competing students or checks exclusion of ungraded periods. The roster-narrowing test seeds only one student, so returning every classmate still passes. The logout test never tries the token after logout, and the reset-confirm test sends `token` instead of the required `reset_token`, so its permitted 422 bypasses token verification entirely. Document visibility seeds just one document, so its length-one assertion cannot prove exclusion of another student's document. These are concrete missing behaviors, not a measured mutation score.

**Fix:** Seed adversarial second objects and assert absence of their identifiers; add graded/ungraded peers and archived/withdrawn enrollments with expected numeric results; test refresh replay and the rotated token after logout. Send a schema-valid invalid reset token and also exercise successful reset and replay according to the intended policy. Replace broad status alternatives with the specific expected code where fixture conditions are controlled.

### API-10 — Optional: Move domain calculation and queries out of routers and complete typed response boundaries

**Severity:** Optional: · **Category:** maintainability/extensibility · **Location:** `backend/app/api/v1/courses.py:186–315`; `backend/app/api/v1/mentors.py:137–172`; `backend/app/api/v1/students.py:75–113`; `backend/app/api/v1/journals.py:22–29`; `backend/app/api/v1/finance.py:51,140–148`; `backend/app/core/deps.py:80–126`

```python
@router.get("/{id}/progress-chart")
...
select(func.avg(JournalStudentSummary.sum_score))
...
decorated = await finance_service._decorate_entries([entry])
```

The chart handler owns roster queries, ranking, colors and aggregation; mentor analytics owns three SQL calculations. Student/mentor profile handlers and course-access helpers reach directly into repositories/ORM state. This contradicts the documented controller/service/repository separation and creates multiple places to update grading and cohort policies. Generic `dict` responses for journal detail/chart/analytics and `List[dict]` for ledger history also discard the Pydantic/OpenAPI boundary used elsewhere. The finance router calls a private service method. Existing unused ownership helpers duplicate route-specific checks; `core.deps.get_storage_service` always returns local storage while the storage module has a separate configuration-aware factory, and neither dependency factory is wired into these service constructors.

**Fix:** Extract a `CourseProgressService` with an explicit repository result and a shared roster/grading policy; move mentor calculations into a repository-backed analytics service. Inject services through named `Depends` factories and expose a public decorated-payment operation. Add typed staff/student chart DTOs, journal-detail and ledger-history DTOs. Consolidate ownership policies and the storage factory once the intended policies are settled. Avoid extracting pass-through wrappers that merely relocate existing complexity.

### API-11 — Optional: Bound aggregate responses and make chart work proportional to the data returned

**Severity:** Optional: · **Category:** scalability/performance · **Location:** `backend/app/api/v1/courses.py:194–216,239–259,282–308`; `backend/app/api/v1/finance.py:140–148,187–194`; `backend/app/api/v1/students.py:56–70`; `backend/app/api/v1/cron.py:17–32`

```python
summaries = list(summary_res.scalars().all())
for j in journals:
    j_summaries = [s for s in summaries if s.journal_id == j.id ...]
```

Chart retrieval materializes every enrollment and summary, and the student branch rescans the full summary list for each journal: O(J × S), with S commonly proportional to students × journals. Staff responses grow with students × journals. Ledger history, credits and student journal history expose uncapped lists. Scheduler handlers synchronously await whole maintenance jobs, keeping requests open and allowing overlapping scheduler retries. No load benchmark was run, so no latency claim is made; these are observable growth mechanisms.

**Fix:** Add date/period ranges and pagination to histories/credits; pre-index summaries by journal and student or compute class aggregates in SQL, returning only the student's series for their chart. Establish a product limit or paginated staff chart series. Enqueue maintenance jobs through the existing ARQ abstraction with stable deduplication keys and return an accepted job identifier; measure bounded fixtures and concurrent triggers before choosing cache TTLs.

### API-12 — Optional: Align settings and phone validation with the project's declared input rules

**Severity:** Optional: · **Category:** quality/maintainability · **Location:** `backend/app/schemas/org_settings.py:15–18`; `backend/app/schemas/user.py:14–16,26–28,37–39`

```python
class OrgSettingsUpdate(BaseModel):
    org_name: Optional[str] = Field(None, min_length=1, max_length=255)
phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
```

The settings input omits `extra="forbid"`; a payload such as `{"notify_paymnts": false}` is silently accepted as an empty update, despite the project requiring unknown inputs to fail. Every phone regex makes the leading plus optional, contrary to the documented strict E.164 representation; equivalent numbers can be stored differently. Isolated class checks reproduced both behaviors. This is a standards/consistency recommendation; the audit does not infer an additional security vulnerability from the format alone.

**Fix:** Add settings' missing extra-field configuration and share a normalized E.164 phone type that requires `+` (or a documented boundary normalizer that produces it). Add typo and phone-format tests and review existing stored values before enforcing canonical formatting.

## 4. What is done well

- Most API controllers are small, use recognizable `Depends` guards and return declared response models. Explicit accountant/superadmin boundaries protect finance operations; refund/adjustment/period operations have narrower privileges.
- User lookup reads the current DB role and rejects deactivated users, so authorization does not blindly trust a stale JWT role claim. Enrollment listing narrows mentor requests to owned courses and student requests to their own identity.
- Most lists cap page size at 100. User listings reuse `PaginationParams`; course/chart student loading uses eager loading rather than an obvious per-enrollment lazy-load N+1.
- Create schemas forbid unexpected fields, validate enums, require positive Decimal amounts and validate course date/schedule relationships. Decimal response serialization supports the money-as-string contract. Pydantic model list defaults are copied per instance; the literal empty-list defaults were not falsely classified as shared-state bugs.
- FastAPI's response validation can read ORM attributes through its Pydantic adapter. Missing `from_attributes` on every DTO was not treated as a universal response bug. Yield-based DB session handling, commit/rollback and FastAPI's dependency reuse are idiomatic; actual transaction conflict behavior belongs to service/persistence review.
- Tests cover login failures, course schedule constraints, upload size/magic checks, avatar resizing and replacement, role denial, course copying, successful webhook binding and explicit exclusion of peer identities from the student chart payload. The chart privacy test seeds an actual peer, which is stronger than testing shape alone.
- Security headers, restricted CORS origins, disabled production documentation, API no-store headers and GZip are useful foundations. Health checks inspect both DB and Redis and return 503 for degraded dependencies.

## 5. Prioritized actions

Effort: **S** = localized change with targeted regression checks; **M** = cross-layer change; **L** = broader API/deployment migration.

1. **API-01 — M:** Separate public assets from private document downloads and test anonymous/other-owner access plus revocation.
2. **API-02 — M:** Carry token purpose through a typed principal; enforce setup-only scope across ordinary routes, including reuse after setup.
3. **API-03 — S:** Make scheduler authentication fail closed and require valid production configuration.
4. **API-04 — S:** Add resend cooldowns and sender budgets before SMTP/code generation.
5. **API-05/API-06 — M:** Give deployment one owner for webhook registration; make acknowledgements reflect durable handling and close local client resources.
6. **API-07/API-09 — M:** Establish one cohort/grading policy and add adversarial rank, average, roster, document and token regression fixtures.
7. **API-08/API-12 — S:** Enforce persisted monetary precision/range and consistent settings/phone validation.
8. **API-10 — L:** Extract chart/mentor domain operations, add concrete response DTOs and inject replaceable service/repository/storage collaborators.
9. **API-11 — M:** Bound history/chart payloads, aggregate/index chart summaries and enqueue deduplicated maintenance jobs; validate with realistic data and concurrency measurements.

No source fixes, commits or integration test runs are included in this report.
