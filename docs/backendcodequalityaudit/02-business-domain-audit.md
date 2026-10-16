# Business and domain logic audit

## 1. Scope

All 22 owned files (4,643 lines) were reviewed across correctness, readability/simplicity, architecture, security and performance:

- `backend/app/core/schedule_utils.py`
- `backend/app/core/scoring.py`
- `backend/app/core/security.py`
- `backend/app/services/audit_service.py`
- `backend/app/services/auth_service.py`
- `backend/app/services/course_service.py`
- `backend/app/services/document_service.py`
- `backend/app/services/email_service.py`
- `backend/app/services/enrollment_service.py`
- `backend/app/services/finance_service.py`
- `backend/app/services/journal_generation_service.py`
- `backend/app/services/journal_service.py`
- `backend/app/services/notification_service.py`
- `backend/app/services/settings_service.py`
- `backend/app/services/storage_service.py`
- `backend/app/services/sum_calculation_service.py`
- `backend/app/services/user_service.py`
- `backend/app/telegram_bot/bot.py`
- `backend/app/telegram_bot/handlers/start.py`
- `backend/app/workers/__init__.py`
- `backend/app/workers/settings.py`
- `backend/app/workers/tasks.py`

Read-only context included AGENTS.md, the audit plan, CONTRACT.md, request session/Depends wiring, configuration, Redis/rate limiting, relevant routers, repositories and models. Finance, reconciliation, finance redesign and journal tests were read first; authentication, documents and integration/notification tests were also inspected to trace intent and coverage. Findings below belong only to owned files; referenced cross-group files supply supporting context.

Verification: Conda base `/workspace/miniconda3/bin/python` with `PYTHONDONTWRITEBYTECODE=1` parsed all 22 files successfully using `ast.parse`; a standalone Decimal arithmetic check reproduced the negative final installment in BUS-16. The orchestrator separately executed the original refresh-token function extracted into memory with frozen time and fake settings, confirming identical tokens and only `exp`/`iat` claims (BUS-01). No application imports, integration tests, source mutations, uploads, DB operations or commits were performed. The historical onboarding result of 100 backend tests passing is not an audit test run. Concurrency/delivery findings are static traces, not claims of executed race tests.

## 2. Summary

Request changes: the business layer has useful ledger invariants and reasonable feature organization, but refresh-token identity and concurrent financial writes have release-blocking security and integrity defects. Code quality is weakened by incomplete reversal checks, placeholder journal completion metrics and failure handling that does not respect SQLAlchemy transaction state. Maintainability and extensibility are limited by concrete service/repository construction, broad SQL orchestration and a 1,661-line finance service; the storage abstraction is present but bypassed. Scalability has good set-based reads and async I/O foundations, yet blocking password/image work, repeated queries, local storage and non-atomic background delivery remain material constraints.

| Goal | Score / 10 | Assessment |
| --- | --- | --- |
| Code quality | 4 | Meaningful sequential invariant tests; serious authentication, reversal and workflow edge cases remain. |
| Maintainability | 5 | Named services help navigation; large orchestration methods, duplicate helpers and implicit transaction behavior add coupling. |
| Extensibility | 4 | Router/service/schema boundaries exist, but services construct concrete implementations and bypass storage configuration. |
| Scalability | 4 | Async DB/Redis, pagination and SQL aggregates are positives; concurrent writers and delivery coordination are unsafe. |

## 3. Findings

Required findings use no severity prefix in their titles; their metadata states `Required (no prefix)`. Optional suggestions use the skill's exact `Optional:` prefix.

### BUS-01 — Critical: Refresh tokens are identical across users minted in the same second

**Severity:** Critical: · **Category:** security / quality · **Location:** `backend/app/core/security.py:60-72`; `backend/app/services/auth_service.py:41-51,69-83`.

```python
to_encode = {"exp": int(expire.timestamp()), "iat": int(now.timestamp())}
return jwt.encode(to_encode, settings.JWT_REFRESH_SECRET_KEY, algorithm="HS256")
```

There is no random identifier or subject. With the default lifetime, two calls in the same second produce identical signed tokens and hashes. Refresh resolves a user from the first matching nonrevoked database row, so an ordinary user's token can resolve another user's session, including an administrator. Same-second rotation also produces the old token again. The model's hash index is not unique; it does not prevent this. The orchestrator's isolated frozen-time execution reproduced the collision without importing the app.

**Fix:** generate a cryptographically random opaque token (`secrets.token_urlsafe(32)`) or add a random `jti` plus subject/type claims, bind lookup to the identity, and enforce token-hash uniqueness. Atomically claim/revoke the stored old token during rotation so two concurrent refreshes cannot both succeed. Add frozen-time tests for different users, rotation, replay and logout.

### BUS-02 — Critical: Concurrent ledger writers can spend the same credit and refund beyond the payment

**Severity:** Critical: · **Category:** quality / scalability · **Location:** `backend/app/services/finance_service.py:165-177,271-324,736-770,785-857`.

```python
available = await self._entry_available(entry)
amount = min(available, needed)
self.db.add(Allocation(ledger_entry_id=entry.id, charge_id=charge.id, amount=amount))
```

Allocation totals, wallet amounts and cumulative refunds are checked with unlocked reads before inserts. Two transactions can both see a charge with 100 remaining and allocate 100; two refunds can both see 100 refundable and each refund 100. Allocation/ledger constraints only require positive individual amounts, and there is no lock, version check or aggregate constraint. Updating charge status afterward does not undo excess allocations. Sequential reconciliation tests never create simultaneous writers.

**Fix:** serialize every student financial mutation on a stable existing student/account row with `SELECT ... FOR UPDATE`, retain the lock through request commit, and use the same lock for schedule generation, withdrawal, allocation, refund and void. Add a unique partial constraint for one void per original payment and parallel PostgreSQL tests using separate sessions.

### BUS-03 — Critical: A voided payment can still be refunded

**Severity:** Critical: · **Category:** quality · **Location:** `backend/app/services/finance_service.py:717-770,866-878`.

```python
target = await self._get_payment_entry(payment_id)
already_refunded = Decimal(refunded_res.scalar() or 0)
max_refundable = target.amount - already_refunded
```

The target helper checks only that the row is a payment. Refund excludes prior refunds but never checks prior voids, whereas void explicitly rejects prior refunds. After voiding a payment, a cash refund is still accepted up to its full original amount. The void already removed its credit; the extra cash-out can reduce unrelated wallet credit and cash analytics. Existing lifecycle tests cover refund-then-void, not void-then-refund.

**Fix:** under BUS-02's lock, reject refund when a VOID exists for the target; centralize the reversible-payment eligibility rule. Test both reversal orders and assert no extra ledger/audit rows on rejection.

### BUS-04 — Uploaded documents with the same filename overwrite previous documents

**Severity:** Required (no prefix) · **Category:** quality · **Location:** `backend/app/services/storage_service.py:40-62,112-120`; `backend/app/services/document_service.py:75-86,112-121`.

```python
filepath = os.path.abspath(os.path.join(target_dir, filename))
await path.write_bytes(file_content)
```

Storage keys use only entity type, owner ID and sanitized client filename, while each upload creates a distinct Document row. Uploading `test.pdf` twice for the same student, including in different journals, gives both rows the same path and replaces the first document's bytes. Deleting either document removes the other's file. GCS has the same key construction.

**Fix:** use an immutable UUID/object ID in each storage key while retaining the original filename as metadata. Stage replacement image objects under new keys and clean up old objects after DB commit. Test duplicate filenames and deletion independence.

### BUS-05 — Password reset grants can be reused after successful reset

**Severity:** Required (no prefix) · **Category:** security · **Location:** `backend/app/services/auth_service.py:262-270,280-305`.

```python
to_encode = {"sub": email, "type": "password_reset", "exp": ..., "iat": ...}
user.password_hash = hash_password(new_password)
```

Confirmation only verifies signature/type/expiry and does not consume or revoke the grant. The same reset token can change the password repeatedly for five minutes, including after the user has completed recovery. Refresh-token revocation does not revoke this JWT.

**Fix:** issue a random single-use reset grant stored by hash, atomically claim it once, and apply password change/revocation in the transaction; alternatively bind a stored nonce/password version to the signed grant. Test reuse and simultaneous confirmation.

### BUS-06 — Reset-code attempts and consumption are not atomic

**Severity:** Required (no prefix) · **Category:** security / scalability · **Location:** `backend/app/services/auth_service.py:125-150,236-261`.

```python
raw_data = await redis_client.get(key)
data["attempts"] += 1
await redis_client.set(key, json.dumps(data), keepttl=True)
...
await redis_client.delete(key)
```

Parallel attempts read the same counter and overwrite the same increment, bypassing the five-attempt budget. Parallel correct submissions can both issue grants before either deletion is observed. Password-reset verification has no independent router rate limiter, so this directly weakens its only attempt limit; the separate limiter on initial verification does not make token consumption atomic.

**Fix:** move compare/increment/consume into one Redis Lua script, preserving expiry and returning a typed outcome. Test five concurrent failures and exactly one successful consume.

### BUS-07 — Reminder calculations still use the retired payment model

**Severity:** Required (no prefix) · **Category:** quality / maintainability · **Location:** `backend/app/workers/tasks.py:209-225`.

```python
func.sum(Payment.amount * (Decimal("1.0") - cast(Payment.discount_percent, Numeric) / Decimal("100.0")))
if total_paid < enroll.price_at_enrollment:
```

The finance API now writes LedgerEntry and Allocation, but reminders read the legacy payments table, subtract a legacy discount percentage, and compare a month's payments with the entire contract price. Current API payments, wallet allocations, discounts and charge cancellation are invisible, so paid students receive reminders. The worker test only covers an unpaid enrollment and cannot catch this mismatch.

**Fix:** select upcoming noncancelled Charge balances using active Allocation sums and charge due dates; reuse a finance repository query rather than duplicating ledger rules in the worker. Test fully paid, partially paid, discounted, refunded and withdrawn enrollments.

### BUS-08 — Reminder logs mark queue acceptance as successful delivery

**Severity:** Required (no prefix) · **Category:** quality / scalability · **Location:** `backend/app/workers/tasks.py:42-46,235-251`; `backend/app/services/notification_service.py:120-129`.

```python
await enqueue_job("send_telegram_message", chat_id=..., text=text)
# caller subsequently records SENT
```

Reminder `send_func` only enqueues another task, so NotificationService records SENT before Telegram runs. The second task swallows TelegramForbiddenError/TelegramBadRequest and has no notification-log ID to mark a failure. Its transient failures also cannot update the first job's log. The user's notification history and retry budget therefore describe queue acceptance, not delivery.

**Fix:** have one delivery job own claim, send and final status, carrying a notification ID. Persist queued/in-flight states separately from sent, and record permanent failures in that same log. Test successful enqueue followed by failed delivery.

### BUS-09 — Failed/revised notification rows can be sent by multiple workers

**Severity:** Required (no prefix) · **Category:** quality / scalability · **Location:** `backend/app/services/notification_service.py:77-102,120-135`.

```python
log = result.scalars().first()
log.attempts += 1
await self.db.commit()
await send_func(is_update)
```

The unique insert handles competing first inserts, but an existing FAILED row or revised SENT row has no exclusive claim. Two workers can read it, both increment attempts and both deliver. Committing before the send releases any potential transactional ownership; a crash after remote delivery and before the final commit also causes a resend.

**Fix:** use an atomic conditional update to claim a pending revision with a lease/claim token and finalize only that token. Document at-least-once semantics where Telegram offers no idempotency key, and distinguish revisions using a durable version. Test concurrent retries and abandoned claims.

### BUS-10 — Exam notifications collide for siblings and suppress document-only updates

**Severity:** Required (no prefix) · **Category:** quality · **Location:** `backend/app/workers/tasks.py:87-101,127-134,138-139`.

```python
related_entity_id=journal_id
if existing_log and existing_log.error_message != f"score:{summary.sum_score}":
```

The idempotency identity is recipient, type, journal and date. Two students in the same journal sharing a parent chat therefore share one notification row. If their sums match, the second is suppressed; if they differ, it is treated as a revision and retains the first student's user ID. A document upload delegates to the same worker, but a new document with an unchanged sum is suppressed too, so the attachment never reaches the parent.

**Fix:** key exam notifications by the student's summary ID (or explicit student+journal identity) and use a revision signature containing summary version and document identity. Test siblings with equal scores and a document added after an initial score notification.

### BUS-11 — Jobs and analytics invalidation run before the business transaction commits

**Severity:** Required (no prefix) · **Category:** quality / scalability · **Location:** `backend/app/services/journal_service.py:631-639`; `backend/app/services/document_service.py:94-107`; `backend/app/services/finance_service.py:543,606,645,714,783,857`; `backend/app/services/enrollment_service.py:133-169`.

```python
await sum_service.recalculate(journal_id, student_id)
await enqueue_job("send_exam_result_notification_task", student_id, journal_id)
```

The request session commits after the service returns. A fast worker can read the old score or fail to find a newly uploaded document; a later DB failure leaves a job for rolled-back work. Enqueue exceptions are silently discarded. Similarly, analytics keys are deleted before commit: a reader can repopulate them from old DB state and keep it for ten minutes after the write. Schedule generation and withdrawal change analytics inputs without invalidating at all.

**Fix:** persist notification outbox events and finance cache-generation changes with the business transaction, then dispatch/invalidate after successful commit. Include enrollment mutations in the same cache policy. Test worker/read interleavings and rollback behavior.

### BUS-12 — Journal completion counts precreated empty entries as graded cells

**Severity:** Required (no prefix) · **Category:** quality · **Location:** `backend/app/services/journal_service.py:55-62,79-92,181-183`; `backend/app/services/enrollment_service.py:99-111`.

```python
func.count(JournalEntry.id)
...
elif cells_expected > 0 and cells_filled >= cells_expected:
    state = "complete"
```

Enrollment creates every expected cell with zero score, false attendance and no comment. Counting row existence makes every started enrolled period complete immediately, before any teacher edits. The grading queue only includes empty/partial periods, so it omits these untouched periods. Tests assert key presence and an allowed state, not empty-to-partial-to-complete behavior.

**Fix:** explicitly represent graded/touched state (needed to distinguish a deliberately graded absence/zero from an untouched cell), count that state, and update it in the grading command. Test untouched enrollment, one edit, intentional zero and full grading.

### BUS-13 — Optimistic conflicts escape the journal's 409 handling

**Severity:** Required (no prefix) · **Category:** quality / scalability · **Location:** `backend/app/services/journal_service.py:479-512,622-632,708-724`; `backend/app/services/audit_service.py:37-43`; `backend/app/services/sum_calculation_service.py:118`.

```python
await audit_service.log(...)  # flushes the whole session
...
try:
    await self.db.flush()
except StaleObjectError: ...
...
await sum_service.recalculate_journal(journal_id)  # also flushes
```

SQLAlchemy version columns correctly detect conflicting writes, but the catch only surrounds one flush. AuditService's earlier flush can encounter the conflicting dirty JournalEntry, swallow StaleDataError and leave the session failed; the later flush then raises PendingRollbackError. Summary recalculation flushes also occur outside the catch. Concurrent edits of different cells for the same student can conflict on the shared summary and return 500 rather than 409. Existing tests submit already-stale versions sequentially and never reach this race.

**Fix:** make AuditService add rows without an unconditional flush and do not swallow session-invalidating exceptions. Wrap the entire mutation, recalculation, audit flush and commit boundary in conflict translation with rollback. Recalculate only affected student summaries, and add separate-session races.

### BUS-14 — Configured cloud storage is bypassed by business services and workers

**Severity:** Required (no prefix) · **Category:** extensibility / scalability · **Location:** `backend/app/services/document_service.py:38`; `backend/app/services/course_service.py:187`; `backend/app/services/user_service.py:194`; `backend/app/workers/tasks.py:110-119`; `backend/app/services/storage_service.py:139-143`.

```python
self.storage_service = LocalStorageService()
# factory already exists:
if settings.GCS_BUCKET_NAME:
    return GoogleCloudStorageService(...)
```

Uploads always instantiate LocalStorageService despite the configured GCS factory. With multiple Cloud Run instances, documents/images live on the uploading instance and are unavailable to other API instances or separate workers, and disappear with ephemeral storage. Workers additionally require the local implementation's private absolute-path helper, so simply selecting GCS cannot fix attachments.

**Fix:** inject StorageService through constructors and runtime Depends wiring using the existing factory. Extend the narrow interface with a backend-neutral stream/download or attachment operation; let the worker use it instead of private filesystem paths. Test both local and fake object-store implementations.

### BUS-15 — Password hashing and avatar transformation block async request execution

**Severity:** Required (no prefix) · **Category:** performance / scalability · **Location:** `backend/app/core/security.py:9-21`; `backend/app/services/auth_service.py:33,194,302`; `backend/app/services/user_service.py:169-208`.

```python
bcrypt.checkpw(pwd_bytes, hashed_bytes)
image.thumbnail((200, 200))
image.save(out_io, format=image.format)
```

Async service methods call synchronous bcrypt at cost 12 and Pillow decode/resize/encode directly. These occupy the event-loop thread, delaying unrelated requests on the same process. Avatar processing decodes and resizes the same image twice and stores two 200x200 outputs despite the original-photo comment. SMTP and GCS already demonstrate the correct thread-offload pattern; local `anyio.Path.write_bytes` is also correctly asynchronous.

**Fix:** offload password hash/verification and one bounded image transformation helper with `asyncio.to_thread`/AnyIO, limit concurrent CPU work, enforce pixel/dimension limits, and reuse the generated thumbnail. Read uploads in bounded chunks before allocating full content. Benchmark concurrent authentication/image requests after implementation.

### BUS-16 — Rounded installment generation can create nonpositive charges

**Severity:** Required (no prefix) · **Category:** quality · **Location:** `backend/app/services/finance_service.py:432-450`.

```python
base = (price / Decimal(total_months)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
amount = price - accumulated  # final installment
```

Positive contract prices are not enough to guarantee positive installments. The in-memory Decimal check reproduced price 0.02 over four months as `[0.01, 0.01, 0.01, -0.01]`; price 0.01 over three months produces zero installments. These inputs pass CourseCreate's `gt=0`, then violate the Charge amount-positive DB constraint and fail enrollment. Existing tests cover ordinary remainders, not prices below the installment count in cents.

**Fix:** allocate integer cents with quotient/remainder and define an explicit policy for fewer cents than installments (fewer nonzero charges or validation rejection). Quantize/reject subcent contract prices before persistence and add minimum-price/many-month tests.

### BUS-17 — Parent Telegram linking searches the student's phone instead of parent phone

**Severity:** Required (no prefix) · **Category:** quality / security · **Location:** `backend/app/telegram_bot/handlers/start.py:25-40,52-57`.

```python
User.phone.in_([cleaned, cleaned_without])
student.parent_telegram_chat_id = message.chat.id
```

The flow promises parent linking and the User model has a separate parent_phone, but it matches the student's own phone. A parent whose configured parent_phone differs cannot link; a student controlling their own phone can overwrite the parent's notification chat. Contact ownership verification is useful but verifies ownership of the matched wrong contact. The existing test deliberately seeds student.phone and does not cover distinct parent_phone.

**Fix:** match the configured parent_phone, restrict linking to private chats, and define an administrator-approved replacement/invitation policy before overwriting an existing binding. Test distinct student/parent contacts and rebinding.

### BUS-18 — Organization notification switches are saved but never enforced

**Severity:** Required (no prefix) · **Category:** quality · **Location:** `backend/app/services/settings_service.py:31-34`; `backend/app/workers/tasks.py:154-166,224-251`.

```python
settings.notify_payments = data.notify_payments
settings.notify_debts = data.notify_debts
```

Repository-wide references show the booleans are read only for API output/test assertions, not by notification workers. `check_payment_reminders` sends regardless of either setting, so disabling organization notifications does not stop reminders. Settings tests only check the returned fields.

**Fix:** document the policy mapping of each switch to notification types and check it in the delivery orchestration before claiming/enqueueing a notification. Test disabled settings cause no enqueue/send and no SENT log.

### BUS-19 — Optional: Narrow service dependencies and split finance responsibilities

**Severity:** Optional: · **Category:** maintainability / extensibility · **Location:** `backend/app/services/auth_service.py:19-23`; `backend/app/services/course_service.py:20-23`; `backend/app/services/finance_service.py:76-78,1198-1349,1597-1661`; `backend/app/services/journal_service.py:392-409,565-582,666-683`.

```python
self.user_repo = SQLAlchemyUserRepository(db)
self.email_service = EmailService()
```

FastAPI Depends is idiomatic, but here it supplies the SQLAlchemy session and the services build concrete repositories/mail/storage themselves; it does not provide the abstraction boundary described in AGENTS.md. Finance mixes ledger commands, allocation policy, SQL reporting, cache management, receipts and accounting periods in 1,661 lines. Repeated journal authorization blocks and duplicate lesson-date helpers in journal/enrollment services add policy drift. Many workflows accept untyped dict/list payloads or return optional values under nonoptional annotations (`allocate_credit`, `_load_entry`).

**Recommendation:** inject existing narrow repository/storage/mail protocols, separate financial commands from reporting queries and period administration, use one journal access policy and canonical lesson-date helper, and type DTO/results explicitly. Preserve the single transaction owner; avoid pass-through abstractions that merely move the same complexity into more files. Static AST reference checks alone are insufficient evidence to delete apparently unused wrappers.

### BUS-20 — Optional: Remove repeated queries and unbounded materialization from reporting/jobs

**Severity:** Optional: · **Category:** performance / scalability · **Location:** `backend/app/services/finance_service.py:294-295,1004-1019,1510-1550`; `backend/app/services/journal_service.py:172-182`; `backend/app/services/sum_calculation_service.py:71-118`; `backend/app/workers/tasks.py:156-166,193-222`.

```python
for charge in charges:
    remaining = await self._charge_remaining(charge)
for course in courses:
    journals = await self.get_course_journals_aggregated(course.id)
```

A ledger request performs two initial queries plus one aggregate per charge; auto-allocation adds two aggregates per historical credit entry. Grading queue performs approximately five queries per mentor course. Reminder jobs fetch all eligible students, then query enrollments per student and payments per enrollment. Credits and ledger endpoints materialize entire histories/results, and full-journal recalculation loads all entries even for a one-student edit. These are concrete growth factors, though no runtime latency benchmark was performed.

**Recommendation:** bulk aggregate by charge/entry, query the mentor queue across course IDs in one set, batch due-charge reminders, paginate ledger/credits and recalculate only affected students using grouped SQL. Validate query counts and bounded memory on realistic course/history sizes.

## 4. What is done well

- Decimal arithmetic, typed ledger events, append-only reversal allocation history and a central charge-status recomputation are a solid foundation. Finance mutation audit rows share the request session rather than committing independently.
- Debt listing uses grouped SQL and actual filters, remains read-only, and payment/charge/debt lists cap page size. Payment decoration batches allocations and reversals instead of querying each payment.
- SQLAlchemy `version_id_col` is correctly present on journal entries and summaries; explicit submitted-version checks and partial-batch conflict responses are useful. The aliased `StaleDataError` name is valid SQLAlchemy usage; the problem is the catch boundary, not the alias.
- SMTP and GCS synchronous clients are offloaded with `asyncio.to_thread`; local writes/deletes use AnyIO. Storage sanitizes filenames and checks path containment.
- Journal generation assigns weights by course type; enrollment initializes real summary maxima; scoring rules are centralized and have direct unit assertions. Finance tests assert reconciliation, reversal history, overpayments and closed-period behavior rather than only response shapes.
- Bot contact ownership verification and per-user notification read authorization exist. Worker definitions are concise, and empty `workers/__init__.py` needs no change. Settings, audit, generation and scoring modules remain small and easy to navigate; no actionable standalone issue was established in every small file.

## 5. Prioritized actions

1. **S — BUS-01:** make refresh credentials unique and identity-bound; add frozen-time cross-user and replay tests before release.
2. **L — BUS-02/03:** serialize financial writers, enforce reversal eligibility, and exercise allocation/refund/void races in PostgreSQL.
3. **M — BUS-05/06:** make reset grants and Redis code verification single-use and atomic.
4. **M — BUS-04/14:** generate unique storage keys, inject the configured backend and support worker attachments without local paths.
5. **L — BUS-07/08/09/10/11:** rebuild reminder selection on the ledger and implement durable outbox/claimed delivery with correct identity/revision/status semantics.
6. **M — BUS-12/13:** represent actual grading state and translate all journal transaction conflicts to 409; add real concurrent-editor tests.
7. **M — BUS-11/16:** define commit-safe finance cache invalidation across enrollment mutations and safe integer-cent installment distribution.
8. **S — BUS-17/18:** honor parent_phone and organization notification switches with behavioral tests.
9. **M — BUS-15/20:** offload CPU work, bound upload processing and replace observed per-record query loops with batch aggregates/pagination.
10. **L — BUS-19:** split command/reporting responsibilities and inject existing protocols incrementally while preserving transactional invariants.
