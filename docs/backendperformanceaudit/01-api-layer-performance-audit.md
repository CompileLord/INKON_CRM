# API layer performance audit

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

**Verdict: Request changes. Performance/scalability score: 5/10.** Common pagination and async I/O are sound foundations, but a compact student chart does much more work than its output size suggests. Autosave permits duplicate-cell request/response growth, and successful logins erase the only endpoint budget before the next expensive verification. Operation-count experiments establish growth, not production latency or outage thresholds. Remediation should preserve existing authorization and grading semantics and be retained only after representative measurement.

Prior API-11 described chart/history growth and inline cron jobs; BUS-15 described blocking bcrypt/images; BUS-20 described service query/recalculation growth; DATA-10/11/15 covered repository ranking/history and connection lifetimes. They are baseline context. Findings below add new counted chart operations, a distinct duplicate-input amplification path, and an executed success-budget bypass. No missing index, speedup or benchmark timing is asserted.

## 3. Findings

### PERF-API-01 — Medium — Measured student chart processing grows quadratically in periods

**Category:** payload / async. **Review disposition:** Required (no prefix). **Location:** backend/app/api/v1/courses.py:194-218,237-259.

```python
for j in journals:
    j_summaries = [s for s in summaries if s.journal_id == j.id and s.max_period_score > 0]
...
for enroll in enrollments:
    for j in journals:
        sum_score, max_score = summary_map.get((s_id, j.id), (0, 0))
```

New quantified evidence relative to API-11: the original AST-extracted handler ran with 30 synthetic active enrollments and complete positive-maximum summaries. Result doubles supplied preloaded journals/enrollments/summaries; only summary journal_id accesses and score_percentage calls were instrumented. The awaited access/journal helper work was stubbed, so the two observed direct execute calls are not a full endpoint query count.

| N students | J periods | Loaded summaries | journal_id accesses | score_percentage calls | compact response bytes |
|---:|---:|---:|---:|---:|---:|
| 30 | 52 | 1,560 | 82,680 | 3,172 | 2,198 |
| 30 | 104 | 3,120 | 327,600 | 6,344 | 4,338 |

Map construction reads S journal IDs, while the per-period filter reads J×S: total `(J+1)×S`, or N×J×(J+1) for complete data. Percentage calls are J for own values plus S class values plus N×J ranking values. Doubling periods nearly quadrupled journal-ID accesses while response size approximately doubled. This CPU loop has no await, and therefore occupies the serving event loop. Production lag impact is a hypothesis until measured; missing/withdrawn summaries change S but not the J×S mechanism.

**Corrected proposal:** group summaries once; retain exactly the current population and positive-maximum predicate while fixing complexity. Handle intended cohort/grading changes as a separate correctness change, not an optimization shortcut.

```python
from collections import defaultdict
by_journal = defaultdict(list)
for summary in summaries:
    if summary.max_period_score > 0:
        by_journal[summary.journal_id].append(summary)
for journal in journals:
    j_summaries = by_journal[journal.id]
    j_pcts = [score_percentage(s.sum_score, s.max_period_score) for s in j_summaries]
```

This changes grouping scans to O(S+J), while ranking remains O(N×J + N log N). Then project minimal summary columns, avoid loading full peer User objects for the student branch, and evaluate bounded period ranges. Do not cache permissions or personalized charts under an unscoped key.

**Verification plan:** rerun operation instrumentation after the grouping change (one journal lookup per retained summary plus J dictionary reads); compare exact response equality including zero/missing maxima and withdrawn students. In a disposable representative runtime measure repeated p95 latency, event-loop lag, DB count/pool wait and RSS at 30/300 students and 52/104 periods with equal warm/cold conditions. Keep only improvements beyond variance.

### PERF-API-02 — Medium — One unique autosave cell can amplify into thousands of output entries

**Category:** payload / concurrency. **Review disposition:** Required (no prefix). **Location:** backend/app/api/v1/journals.py:32-40; backend/app/schemas/journal.py:47-54.

```python
payload: List[JournalEntryUpdate]
return await journal_service.batch_update_entries(id, payload, current_user)
```

Executed isolated Pydantic validation accepted a repeated cell 10,000 times; compact request size was 850,001 bytes (a single item was 86 bytes including list brackets). Unique student/date lookup sets remain size one. Supporting service trace journal_service.py:431-468 appends every unchanged occurrence to applied, and :532-545 serializes each occurrence; a matching stored cell yields B repeated applied rows, not one. For B payload entries and U unique cell keys, decoding/validation/loop/output scale O(B) even when U=1. The synthetic experiment validated list acceptance, not an executed database autosave; exact service output cardinality is a source-derived count. Full-journal recalculation remains BUS-20 context and is not counted again here.

This matters for an accidentally duplicated frontend batch as well as a malicious mentor. Long repeated comments further multiply request/response bytes and validation memory. No concurrent throughput timing is claimed.

**Corrected proposal:** reuse SEC-API-04's Annotated bounded list with AfterValidator(unique_cells), cap comments and transport bodies. Send only changed unique cells from the client; reject duplicates on the server so autosave semantics stay explicit. Do not silently keep an arbitrary first/last duplicate with conflicting versions.

```python
JournalBatch = Annotated[
    list[JournalEntryUpdate], Field(max_length=500), AfterValidator(unique_cells)
]
# Route parameter:
payload: JournalBatch
```

**Verification plan:** measure decoded bytes, peak RSS and applied/conflict cardinalities at 1,100,500 unique cells; reject repeated keys and 501 cells. Test legitimate partial conflicts/no-op saves and stable returned versions. Compare concurrent autosave p95 and loop lag before/after against the same seeded journal, recording service query/recalculation counts separately.

### PERF-API-03 — Medium — Successful logins bypass the only route work budget

**Category:** async / concurrency. **Review disposition:** Required (no prefix). **Location:** backend/app/api/v1/auth.py:22-32.

```python
await check_rate_limit(key, 5, 900)
result = await auth_service.login(payload.email, payload.password)
await clear_rate_limit(key)
```

The limiter is keyed only by email and cleared after success. A client using one valid account can repeatedly trigger password verification plus refresh-session creation with no retained budget. An AST-extracted original handler with deterministic limiter/auth doubles executed 100 sequential successful calls and retained counter zero. This is a new endpoint amplification experiment, distinct from BUS-15's already-known blocking primitive and DATA-05's parallel limiter race. It does not depend on a race or email normalization.

Supporting trace auth_service.py:24-51 verifies bcrypt and adds a refresh session per success. Thus R serial successful calls cause R password verifications and R session insert workflows; no route-level throughput ceiling remains. Event-loop saturation and session-storage growth under a real workload are hypotheses, not measured production effects. Invalid-password attempt limits are useful but serve a different purpose from a capacity budget.

**Corrected proposal:** retain the failure lockout behavior while adding a shared success-independent request budget. Derive the client key through the trusted ingress policy; raw untrusted forwarding headers cannot identify the sender. Use the atomic limiter proposed by the infrastructure audit.

```python
await check_rate_limit(f"auth:capacity:account:{payload.email}", 30, 60)
await check_rate_limit(key, 5, 900)
result = await auth_service.login(payload.email, payload.password)
await clear_rate_limit(key)
return result
```

The example capacity is a proposal requiring workload calibration; do not clear this separate key on successful login. Add an ingress/client and aggregate budget to handle distributed accounts; bound concurrent password CPU work in the service fix. A single account limit alone cannot protect against distributed spraying.

**Verification plan:** isolated 31st successful call in a fixed minute must be throttled while failed-login lockout still works; real shared-store tests cover multiple instances and concurrent calls. Then measure login p95, unrelated endpoint p95/loop lag, refresh row growth and pool wait at controlled concurrent successful traffic. Calibrate budget and CPU concurrency from results.

## 4. What is done well

- Common list page_size caps at 100 bound ordinary page output; chart relations use joinedload rather than per-enrollment lazy queries. Async sessions are reused through FastAPI dependency caching.
- Student chart output excludes peer names and returns a compact series; the measured problem is its hidden input/CPU work, not an unnecessary peer response.
- Response schemas and Decimal output provide predictable serialization; list defaults in Pydantic are copied and are not a shared mutable-state leak.
- SQL aggregates are used in mentor analytics; GZip reduces transfer for larger responses without fixing decoding or object allocation. No speculative micro-optimization is proposed for small imports or DTOs.
- Long-running cron work, webhook ownership, local Cloud Run storage and pool shutdown are already documented baseline concerns. Clean small routers/schemas/tests need no invented independent bottleneck.

## 5. Prioritized fixes

1. **S — PERF-API-02:** cap/deduplicate autosave and bound comments/body before processing.
2. **S/M — PERF-API-01:** group summaries once, then measure minimal projections and bounded ranges; preserve response equivalence.
3. **M — PERF-API-03:** add a success-independent shared capacity budget and verify atomic multi-instance enforcement alongside password offload.
4. **M — verification:** run representative load scenarios for chart/autosave/login in a disposable runtime; collect latency, loop lag, queries/pool wait and RSS before selecting caches/indexes.

No optimization was implemented. Tables report executed synthetic counts; all runtime load tests and before/after proposals remain unexecuted.
