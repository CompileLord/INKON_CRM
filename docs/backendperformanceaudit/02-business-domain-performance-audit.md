# Business and domain performance audit

## 1. Scope

Every owned file received separate security and performance passes. Exact ownership (22 files):

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

Read-only context: AGENTS.md, CONTRACT.md, prior quality plan and all three reports, both new plans, relevant auth/upload/worker and finance/journal tests (before implementations), routers, models, repositories, DB session/Depends, Redis and infrastructure runtime context. All three skills and both bundled references were read; shared checklist files are absent. Findings belong only to the listed files. Tests creating DB schemas, clearing Redis or writing uploads were not run.

Executed checks used Conda base Python with PYTHONDONTWRITEBYTECODE=1: AST parsing all 22 files; AST counts of DB execute calls in the analytics call graph and audit/pool calls; inspection of installed SMTP timeout and TLS defaults. Security-only in-memory service resolution checks are recorded in the companion security report. No app import, source mutation, integration test, real DB/Redis/SMTP request or load benchmark occurred. Operation counts below are source-derived, not latency measurements. Proposals remain hypotheses until equal-condition before/after measurement establishes a benefit.

## 2. Summary

**Verdict: request changes; performance/scalability score 4/10.** Newly quantified analytics misses fan out into 13 SQL executions per request and invalidation makes every finance write scan the shared Redis keyspace. SMTP is correctly offloaded but has no finite socket timeout and is awaited while a request holds its database transaction. Qualifying document uploads create disposable ARQ pools with no explicit close, and journal autosave flushes once per changed cell. Course copying multiplies the entire precreated journal/charge footprint in one transaction. Scores are qualitative; pool exhaustion, latency and memory failure thresholds remain unmeasured.

Baseline context only: BUS-15's bcrypt/Pillow event-loop blocking, BUS-14's local Cloud Run storage, BUS-20's known history/N+1 loops, BUS-11's precommit invalidation and BUS-08–10's delivery correctness are not repeated as new findings. The new journal finding quantifies the flush schedule, rather than repeating the prior full-journal materialization diagnosis. The three known security risks have no fabricated load-test timings here.

## 3. Findings

### PERF-BUS-01 — SMTP without a socket deadline retains request transactions and executor threads

**Impact: High. Category: async/concurrency. Review disposition: Required (no prefix).**
**Owned locations:** backend/app/services/email_service.py:24-34; backend/app/services/auth_service.py:111-121,169-177,219-232; backend/app/services/user_service.py:41-44,64-67.

**New path:** SMTP uses asyncio.to_thread, so it does not itself block the event loop. However smtplib.SMTP has no timeout argument here; inspection confirmed it defaults to Python's global socket timeout, which was None. Password-reset and resend perform user lookup before awaiting delivery; user creation flushes its INSERT before delivery. Request session context commits only after return. A stalled SMTP connect/read therefore retains the checked-out connection/transaction (and created-row locks where applicable) throughout the stall, as well as an executor thread. At A simultaneous stalled requests, up to A database connections and A executor tasks remain occupied, limited by the configured pools/executor; other requests then wait. Worker email delivery uses the same indefinite socket path. Cancellation of to_thread does not forcibly stop the underlying thread.

**Evidence:** the actual constructor, caller await order and yield-session commit boundary establish retention; no stalled service was contacted. This is distinct from the prior bcrypt/image blocking finding and from resend abuse.

**Corrected proposal:** Add a finite per-socket SMTP timeout and use a transactional mail outbox so user/reset business transactions finish without waiting for remote delivery. A bounded worker consumes the committed event; apply a total delivery deadline, finite attempts and queue-age/expiry policy so delayed verification codes are not sent after expiry. Keep the existing thread offload and CA-verifying TLS.

```python
with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
    server.starttls(context=ssl.create_default_context())
```

Timeout=10 is an illustrative budget to tune, not a measured optimum. Merely wrapping to_thread in asyncio.wait_for leaves the thread running; socket deadlines and bounded executor work are required. Do not commit arbitrary service sessions early to free the connection, since that would split the business transaction.

**Measure:** fault-inject SMTP connect/read stalls in an isolated harness; record transaction duration, pool checkout wait, active executor work and unrelated request p95/p99 at 1/10/30 concurrent mail requests. Confirm every stall terminates within the configured delivery budget and rolled-back user creation emits no deliverable outbox event. Repeat equal conditions after fixing; no timings were measured here.

### PERF-BUS-02 — Analytics cache expiry multiplies thirteen-query recomputations

**Impact: High. Category: caching/database. Review disposition: Required (no prefix).**
**Owned locations:** backend/app/services/finance_service.py:1223-1349,1351-1448,1174-1220.

**New quantified evidence:** AST counts confirmed 7 execute sites in get_analytics, 3 in _total_outstanding_credit, 1 in _aging_buckets and 2 in get_debts: **13 explicit SQL executions per cold recomputation**. The read/compute/set sequence has no request coalescing or distributed lease. R requests that all read a miss before any SET can consequently schedule 13R executions for the same key; for R=30 the source-derived count is 390, excluding authentication and hidden driver internals. The three credit aggregation maps also transfer per-student results and aging transfers each eligible open-charge balance into Python, so recomputation memory grows with students plus due open charges even though the HTTP response is small.

**Reachability:** accountant/superadmin analytics endpoint, TTL=600, shared key includes the two date bounds. Callers can select many distinct valid date pairs; identical requests naturally synchronize on expiry/invalidation. No observed production stampede or query-plan claim is made. This is new cold-cache operation evidence, not the old invalidation-staleness finding.

**Corrected proposal:** Coordinate misses by exact key in Redis with a finite lease, unique owner and compare-and-delete release; recheck the cache after acquiring. Waiters should use bounded waits/jitter or return explicitly acceptable stale analytics. A process-local singleflight alone cannot coordinate Cloud Run instances. Avoid serializing permissions or live financial commands through the analytics cache. Aggregate the global-only fields separately from date-window fields only if measurements justify the additional cache concepts, and consider SQL grouped totals instead of transferring every aging row.

```python
cached = await cache.get(key)
if cached is not None:
    return decode(cached)
async with bounded_distributed_lease(key):
    cached = await cache.get(key)
    if cached is not None:
        return decode(cached)
    result = await compute_analytics()
    await cache.set(key, encode(result), ttl=600)
    return result
```

The lease helper is a proposed abstraction, not an existing API; it must enforce ownership, expiry, cancellation and bounded waiting. Preserve acceptable freshness explicitly.

**Measure:** Count SQL executions/recompute winners and pool wait with 1/10/30 concurrent identical misses across two processes. Compare with varied date keys and increasing student/charge cardinalities; capture transferred rows/RSS and p95/p99. A coalescing fix should approach one 13-query recomputation per identical-key burst while producing equivalent money/aging values.

### PERF-BUS-03 — Every financial mutation scans the whole shared Redis keyspace to invalidate analytics

**Impact: Medium. Category: caching/concurrency. Review disposition: Required (no prefix).**
**Owned location:** backend/app/services/finance_service.py:122-134; mutation calls at 543,606,645,714,783,857.

**New quantified insight relative to BUS-11:** SCAN MATCH filters returned keys; it does not restrict traversal to an indexed analytics namespace. Each completed cursor iteration walks Redis's shared keyspace, including auth/code/job keys that do not match. With K total keys and W financial mutations, work is approximately O(WK) over full invalidations, even if only one analytics key exists. COUNT=100 is a hint, not a guaranteed page size; exact round-trip count cannot be derived from it. All SCAN/DELETE awaits occur before the business transaction commits, extending DB checkout and money-writer lock lifetime. The earlier report described staleness timing; this finding concerns keyspace-wide traversal and transaction occupancy.

**Corrected proposal:** Keep an atomic finance analytics generation number, advance it in a commit-safe dispatch/version design, and include it in cache keys. Old-generation entries expire by TTL without scanning. A durable DB generation/outbox event avoids the previously established precommit invalidation race. If precise old-key removal is required, maintain an explicit bounded key index rather than traverse unrelated Redis keys.

```python
key = f"finance:analytics:v{generation}:{date_from}:{date_to}"
```

Handle cache-miss leases using that generation so an old computation cannot publish into the current generation. Do not introduce unbounded obsolete entries; retain TTLs.

**Measure:** Vary unrelated Redis keys at fixed analytics count and finance-write concurrency; record SCAN calls, Redis CPU, transaction duration and lock/pool waits. Compare version advancement under the same conditions and verify rollback/reader interleavings. The O(WK) mechanism is source/Redis-semantic evidence; no Redis benchmark ran.

### PERF-BUS-04 — Each qualifying document upload creates an ARQ pool without closing it

**Impact: Medium. Category: concurrency/async. Review disposition: Required (no prefix).**
**Owned location:** backend/app/services/document_service.py:97-107.

**Problem/evidence:** A superadmin uploads a student document for a journal with positive exam_score; the service awaits create_pool and enqueue_job for that request and never closes the resulting pool, including on enqueue failure. AST checks found one create_pool call and zero close/aclose calls in the file. U qualifying uploads produce U separate pool creation paths, instead of reusing one process-owned producer. Each adds initialization/connection work while the document INSERT transaction remains open. Installed Redis connection destruction can close its writer when garbage collection runs; actual retained socket lifetime depends on cleanup/GC, so a permanent U-socket leak is not claimed; explicit ownership/cleanup is missing and churn is certain. EmailService.enqueue_verification_email has the same unclosed pattern at lines 36-40 but no runtime callers were established, so it is context only, not an additional reachable workload.

**Corrected proposal:** Use the existing process-owned enqueue abstraction through an injected producer, initialized once and closed in lifespan; keep durable enqueueing after business commit as previously recommended by BUS-11. If a temporary pool is unavoidable, close it in finally on success, error and cancellation. Reconcile DSN configuration centrally (DATA-06 baseline) rather than retaining another host/port constructor.

```python
await self.job_producer.enqueue_document_notification(owner_id, journal_id)
```

This constructor dependency is a proposal and must have a concrete shared lifecycle owner. Reusing a pool alone does not fix rollback/enqueue correctness.

**Measure:** With an in-memory producer counter verify U qualifying uploads create one shared producer and do not enqueue on rollback. In a disposable Redis integration harness, record connected clients, connection creation rate and DB transaction duration over repeated uploads, exceptions and cancellation; require clients return to baseline on shutdown. No real upload/pool experiment was run.

### PERF-BUS-05 — Autosave flushes once per changed cell before its batch flush

**Impact: Medium. Category: database/concurrency. Review disposition: Required (no prefix).**
**Owned locations:** backend/app/services/journal_service.py:433-511,514-516; backend/app/services/audit_service.py:25-37; backend/app/services/sum_calculation_service.py:71-118.

**New quantitative evidence relative to BUS-13/20:** The mutation loop awaits AuditService.log for every changed entry. That method unconditionally flushes the session. For K changed cells with successful audit logging, the call path invokes K audit flushes, one explicit batch flush and one recalculation flush: **K+2 explicit flush invocations**. Each audit flush writes the current dirty entry and its one-to-three audit rows, preventing ORM batching across the whole autosave command. Not every invocation is a DB round trip: an empty flush can be a no-op, so K+2 is not asserted as K+2 SQL commands. AST confirmed the audit call is inside the loop at line 484. Unchanged items bypass that call but still trigger recalculation.

**Corrected proposal:** Have audit log construction add rows without flushing, update all accepted cells, then flush once inside the full conflict boundary. Recalculate the affected student summaries and flush once more when required, preserving returned versions and partial-batch conflict semantics. Do not remove individual audit records or version checks to improve the metric.

```python
for update in accepted_updates:
    apply_entry_update(update)
    audit.add_changes(update)
await db.flush()
await sums.recalculate_students(journal_id, changed_student_ids)
await db.flush()
```

Helpers are proposed; fold recalculation's own flush into the transaction owner deliberately. Full-journal materialization remains baseline BUS-20 context rather than a new standalone claim.

**Measure:** Instrument explicit flushes and actual SQL executions for 1/10/100 changed cells plus unchanged replays; compare batching/transaction p95 and version results. Assert exact audit history, partial conflicts and rollback on concurrent updates. The source-derived K+2 count was verified statically; PostgreSQL flush batching/timings were not measured.

### PERF-BUS-06 — Course copying materializes each student's entire destination lifetime in one transaction

**Impact: Medium. Category: database/payload. Review disposition: Required (no prefix).**
**Owned locations:** backend/app/services/course_service.py:234-264; backend/app/services/enrollment_service.py:90-139; backend/app/services/journal_generation_service.py:17-68; backend/app/services/finance_service.py:430-478.

**New growth insight:** copy_course loads every active source enrollment and calls enroll_student sequentially. Each target enrollment eagerly creates all lesson entries, all period summaries and the complete installment schedule. With N source students, L target lesson dates, J target periods and M installments, destination persistence allocates **N(1+L+J+M)** enrollment/entry/summary/charge objects, plus J course journals and schedules/history. Lesson dates are recomputed for every student, O(ND) calendar-day checks for D course duration; each student's service also performs lookup/check/flush/finance work. All students share the same request transaction until it returns. This is a new creation-workload bound, rather than the old read-history/N+1 report. No business upper bound for copy roster/course duration was found in this path; only superadmins can invoke it.

**Corrected proposal:** Establish a product duration/roster budget for synchronous copies. Precompute destination dates once, stage bulk row sets and process a durable copy job in bounded batches when the bound is exceeded. Preserve enrollment uniqueness, installment monetary semantics and per-student finance serialization. If batches commit separately, expose pending/completed/failed copy status; do not silently turn current atomic semantics into a partial copy. An alternative bounded synchronous bulk implementation may be sufficient at actual CRM cardinalities and is cheaper if measurement proves it.

```python
lesson_dates_by_journal = compute_destination_dates_once(course)
for student_batch in bounded_batches(source_student_ids, batch_size):
    await copy_batch_with_checkpoint(copy_id, student_batch, lesson_dates_by_journal)
```

This is a proposed background workflow, not a source fix. Its checkpoint must make retries idempotent.

**Measure:** Vary N at fixed L/J/M and vary duration at fixed N; record rows inserted, execute/flush counts, transaction duration and peak RSS. Verify completed copies match ordinary enrollment balances/maxima and cancellation/retry does not duplicate installments. No copied course or DB workload was created during this audit.

## 4. What is done well

- Async SQLAlchemy and Redis allow I/O concurrency; SMTP and GCS are already offloaded. AnyIO local file operations are asynchronous. The report distinguishes transaction retention from event-loop blocking.
- Debt/payment queries use grouped aggregates and batched decoration; most list endpoints cap pages. Analytics cache TTL and complete date-key inputs provide a usable foundation.
- Charge recomputation batches touched IDs, and journal reads index entries by student rather than repeatedly filtering every entry per student. Optimistic version columns are valid SQLAlchemy concurrency controls.
- Telegram FSInputFile supports streamed file transmission rather than eagerly buffering every document in the worker; source does not prove an attachment memory leak. Worker runtime defaults need representative workload measurement before changing concurrency/timeouts blindly.
- Empty workers/__init__.py and small scoring/scheduling/settings/generation modules do not warrant micro-optimization findings. No timings, EXPLAIN plans or missing-index defects were invented.

## 5. Prioritized fixes and measurement

| Priority | Action | Effort |
| --- | --- | --- |
| 1 | Bound SMTP sockets/worker work and remove remote delivery from business transactions through a committed outbox (PERF-BUS-01). | M |
| 2 | Coalesce analytics misses across instances; capture 13R query fan-out and row transfer before further aggregation changes (PERF-BUS-02). | M |
| 3 | Replace keyspace scans with commit-safe cache generations and explicit TTLs (PERF-BUS-03). | M |
| 4 | Reuse a lifecycle-owned producer for document notifications and measure client counts/cancellation (PERF-BUS-04). | S |
| 5 | Batch autosave audit flushes within the complete optimistic-conflict boundary (PERF-BUS-05). | M |
| 6 | Measure copy creation footprint, enforce a synchronous budget and introduce bounded durable batches only if warranted (PERF-BUS-06). | M/L |

S/M/L mean localized / several components / cross-layer redesign. Run equal-condition repeated before/after trials, preserve correctness and discard changes whose improvement falls within noise. All source proposals and integration/load measurements remain unexecuted; only the explicitly listed static/in-memory checks were performed.
