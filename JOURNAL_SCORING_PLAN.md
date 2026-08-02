# Journal Scoring — Implementation Plan

Status: approved design, not yet implemented.
Audience: the agent implementing this. Read this file end to end before editing anything.

---

## 1. Why this change

The scoring implemented today (`backend/app/services/sum_calculation_service.py:44`) is:

```
sum_score = Σ daily score + exam_score + bonus_score
```

with `exam_score + bonus_score <= 500` (`backend/app/services/journal_service.py:337`) and a
`score BETWEEN 0 AND 5` DB constraint on entries. It matches PRD lines 608–633, but it has four
defects:

1. **Attendance earns nothing.** `JournalEntry.attendance` is recorded, counted into
   `attendance_count`, and then contributes zero to the score.
2. **`sum_score` has no ceiling.** Exam+bonus may reach 500 while 20 lessons of homework reach
   100, so the number the whole product reports is mostly whatever the mentor typed into two
   free-form fields. Nothing can be expressed as a percentage, and the `success` threshold
   `DESIGN (1).md:58` wants is not definable.
3. **The exam weight is not configurable.** It is implicitly "anything up to 500", identical for
   a 5-lesson week and a 13-lesson month.
4. **`score = 0` is overloaded** — column default, "absent", and "present but earned nothing"
   are the same value.

## 2. Target model

Per journal period, per student:

| Component | Range | Where it lives |
|---|---|---|
| homework | 0–5 per lesson | `journal_entries.score` (unchanged) |
| attendance | 1 per attended lesson | derived from `journal_entries.attendance` |
| exam | 0 – `journal.exam_max_score` | `journal_student_summaries.exam_score` |
| bonus | 0–20 | `journal_student_summaries.bonus_score` |

```
homework_score   = Σ entry.score
attendance_score = count(entry.attendance is True) × 1
sum_score        = homework_score + attendance_score + exam_score + bonus_score
max_period_score = total_lessons × (5 + 1) + journal.exam_max_score      # bonus excluded
percentage       = sum_score / max_period_score × 100                    # may exceed 100 via bonus
```

`total_lessons` stays what it is today: the number of `journal_entries` rows the student has in
that period. Entries are pre-created for every scheduled lesson date at enrollment
(`backend/app/services/enrollment_service.py:95-120`), so this equals the scheduled lesson count.

### Worked examples

**Weekly, 5 lesson-days/week, `exam_max_score = 70`** — the canonical 100:

```
homework   5 lessons × 5 = 25
attendance 5 lessons × 1 =  5
exam                     = 70
                          ---
max_period_score          100
```

**Monthly, 3 lesson-days/week (12 lessons), `exam_max_score = 60`:**

```
homework   12 × 5 = 60
attendance 12 × 1 = 12
exam              = 60
                   ---
max_period_score   132
```

The period maximum is **not** pinned to 100. It follows the lesson count, and every display uses
`percentage` rather than the raw number. A mentor who wants an exam-dominant month awards little
or no homework — the exam still carries 60 of the points on offer.

### Approved decisions (do not revisit)

1. **`exam_max_score` is per journal period**, not per course — the mentor may weight a hard exam
   week differently from an easy one. The course's `exam_type` only supplies the default at
   journal-generation time: **70 for weekly, 60 for monthly**.
2. **Bonus is capped at 20** and sits outside `max_period_score`, so a bonus can push a student
   above 100%.
3. **No enforced minimum on the monthly exam weight.** The default of 60 already satisfies
   "monthly exam > 50"; a mentor may set it lower deliberately. Allowed range is 0–100.
4. **Mid-course enrollees keep 0 for past periods.** Entries for every period are already created
   on enrollment, so the mentor backfills them after assessing the student. Averages keep
   dividing by the full period count. **No change to enrollment or averaging logic.**
5. **Attendance is independent of homework**, but awarding a score implies presence: when
   `score > 0`, the backend forces `attendance = True`. The frontend already does this; the
   server must not trust it.

---

## 3. Work breakdown

Phases are ordered by dependency. Each has its own verification step; do not start a phase until
the previous one's verification passes.

### Phase 1 — Scoring rules module

Create `backend/app/core/scoring.py` as the single source of truth. No other module may hardcode
these numbers.

```python
MAX_HOMEWORK_SCORE_PER_LESSON = 5
ATTENDANCE_POINT_PER_LESSON   = 1
MAX_BONUS_SCORE               = 20
EXAM_MAX_SCORE_LIMIT          = 100
DEFAULT_EXAM_MAX_SCORE        = {CourseExamType.WEEKLY: 70, CourseExamType.MONTHLY: 60}

def default_exam_max_score(exam_type) -> int
def max_period_score(total_lessons: int, exam_max_score: int) -> int
def score_percentage(sum_score: int, max_period_score: int) -> float   # 0.0 when max is 0
```

Import direction: `core.scoring` → `models.course` only. Nothing in `models/` may import it
(circular import risk).

**Verify:** module imports cleanly (`python -c "import app.core.scoring"`).

### Phase 2 — Schema changes

**`backend/app/models/journal.py`** — add:

- `exam_max_score: int`, `nullable=False`, `server_default="70"`
- `CheckConstraint("exam_max_score >= 0 AND exam_max_score <= 100", name="check_exam_max_score_range")`

**`backend/app/models/journal_student_summary.py`** — add, all `nullable=False, server_default="0"`:

- `homework_score: int`
- `attendance_score: int`
- `max_period_score: int`
- `CheckConstraint("bonus_score >= 0 AND bonus_score <= 20", name="check_bonus_score_range")`

Keep `sum_score`, `attendance_count`, `total_lessons`, and the `version` optimistic-lock column
exactly as they are — `sum_score` is read by the notification worker, the progress chart, and
mentor/student averages, and its meaning stays "everything the student earned this period".

**Verify:** `python -c "from app.models import *"` and the app still boots.

### Phase 3 — Alembic migration

One revision under `backend/alembic/versions/`. Determine the current head with
`alembic heads` (or by following `down_revision` through the six existing files) and chain onto
it — do not guess the revision id.

Upgrade steps, in order:

1. Add `journals.exam_max_score` with `server_default="70"`.
2. Backfill: `UPDATE journals SET exam_max_score = 60 WHERE period_type = 'month'`.
   (Weekly rows keep the 70 default. `period_type` holds the `JournalPeriodType` string value.)
3. Add the three summary columns with `server_default="0"`.
4. Backfill the summaries. Old `sum_score` was `homework + exam + bonus`, so homework is
   recoverable:
   ```sql
   UPDATE journal_student_summaries
      SET homework_score   = sum_score - exam_score - bonus_score,
          attendance_score = attendance_count;
   ```
5. **Clamp out-of-range legacy values** before adding the constraints — the old rules allowed
   `exam + bonus <= 500`:
   ```sql
   UPDATE journal_student_summaries SET bonus_score = 20 WHERE bonus_score > 20;
   UPDATE journal_student_summaries s SET exam_score = j.exam_max_score
     FROM journals j WHERE j.id = s.journal_id AND s.exam_score > j.exam_max_score;
   ```
6. Recompute the denormalized fields:
   ```sql
   UPDATE journal_student_summaries s
      SET max_period_score = s.total_lessons * 6 + j.exam_max_score,
          sum_score = s.homework_score + s.attendance_score + s.exam_score + s.bonus_score
     FROM journals j WHERE j.id = s.journal_id;
   ```
7. Add both check constraints.

Downgrade: drop the constraints and columns, and restore `sum_score = homework + exam + bonus`
(i.e. subtract `attendance_score`). Clamped exam/bonus values are **not** recoverable — say so in
the revision docstring.

**Verify:** `alembic upgrade head` then `alembic downgrade -1` then `alembic upgrade head` on a
scratch database, with no errors and no constraint violations.

### Phase 4 — Recalculation

Rewrite `SumCalculationService.recalculate` (`backend/app/services/sum_calculation_service.py`).
It currently loads the student's entries and writes `sum_score`, `attendance_count`,
`total_lessons`. It must additionally load the `Journal` (for `exam_max_score`) and write
`homework_score`, `attendance_score`, `max_period_score` using `core.scoring` helpers.

Keep the existing contract intact: it creates the summary row when absent, it is called inside
the caller's transaction, and it ends with `await self.db.flush()`. Both call sites
(`journal_service.py:281-283` and `:373-374`) keep working unchanged.

Add a second entry point for exam-weight edits:

```python
async def recalculate_journal(self, journal_id: int) -> None
```

which recalculates every summary in the period — needed because changing `exam_max_score` moves
`max_period_score` for all students at once. Batch-load entries grouped by student; do not loop
`recalculate` per student with a query each (the codebase already fought N+1 here, see the
"eliminates N+1" comments in `journal_service.py:110`).

**Verify:** unit test the arithmetic against both worked examples in §2.

### Phase 5 — Validation and write paths

**`journal_service.update_exam_or_bonus` (`:287-384`):**

- Replace `if exam_score + bonus_score > 500` (`:337`) with:
  - `exam_score > journal.exam_max_score` → 400, message naming the period's maximum.
  - `bonus_score > MAX_BONUS_SCORE` → 400.
- Keep the negative check, the `version` conflict check (`:355`), the `StaleObjectError` handling,
  the recalculation call, and the notification enqueue exactly as they are.

**`journal_service.batch_update_entries` (`:171-285`):**

- In the pre-validation loop (`:210-215`), keep the 0–5 range check.
- When applying an update (`:258-262`), force `attendance = True` if `score > 0`, and log the
  coerced value in the audit `changes` dict so the audit trail reflects what was actually stored.

**New: set the period's exam weight.** Add `journal_service.update_exam_max_score(journal_id,
exam_max_score, current_user)`:

- RBAC identical to `batch_update_entries` (`:188-205`): superadmin, or the course's own mentor;
  mentors blocked on archived courses.
- Range 0–100 → else 400.
- **Reject** (400) if any student in the period already has `exam_score > exam_max_score`, naming
  the affected students. Do not silently clamp a mentor's grades.
- On success, call `recalculate_journal`.
- Write an audit log entry (`AuditService.log`, `entity_type="journal"`) — this changes every
  student's denominator and must be traceable.

**Endpoint:** `PATCH /api/v1/journals/{id}/exam-max-score` in
`backend/app/api/v1/journals.py`, following the RBAC and response conventions already used there.

**Verify:** integration tests in Phase 8.

### Phase 6 — Read paths

- **`journal_service.get_journal` (`:138-169`)** — add `homework_score`, `attendance_score`,
  `max_period_score`, and computed `percentage` to `summary_data`; add `exam_max_score` to the
  journal-level payload so the grid can validate input and label the exam column.
- **`backend/app/schemas/journal.py`** — extend `JournalStudentSummaryResponse` with the new
  fields; add `exam_max_score` to `JournalResponse`; add the new request model for the
  exam-weight endpoint. `JournalStudentSummaryUpdate` keeps `exam_score`/`bonus_score` as
  `Field(ge=0)` — the upper bounds are period-dependent and stay in the service layer.
- **`backend/app/api/v1/courses.py:173-246` (progress chart)** — `summary_map` (`:212`) should
  carry both `sum_score` and `max_period_score` so the chart can plot percentages; emit both raw
  and percentage series. **Leave the averaging as-is** (`:231`): per decision 4, missing periods
  count as 0 and the divisor stays `len(journals)`.
- **`backend/app/repositories/sqlalchemy/user_repository.py:69,106`** — these average raw
  `sum_score` across periods of differing maxima, which is now clearly wrong. Switch to an
  average of `sum_score / max_period_score` (guarding division by zero) so mentor and student
  "average score" become comparable percentages.
- **`backend/app/workers/tasks.py:99-131`** — include the maximum in the message text
  (`Sum = {sum_score} / {max_period_score}`). Note the dedup key at `:99` is
  `f"score:{summary.sum_score}"`; because the migration shifts every `sum_score` by the
  attendance points, one extra notification per student may fire on first run after deploy. That
  is acceptable; do not add a suppression hack.
- **`backend/app/services/document_service.py:97`** — certificate eligibility is
  `exam_score > 0`. Unaffected; leave it.

### Phase 7 — Frontend

Do not assume the component internals; inspect before editing. Relevant files:
`frontend/src/components/journals/` (`JournalScoreChart.tsx`, `JournalCard.tsx`,
`JournalPeriodSection.tsx`, `JournalsStatsStrip.tsx`), `frontend/src/pages/Journals.tsx`,
`frontend/src/components/courses/CourseProgressChart.tsx`, `frontend/src/pages/CourseProfile.tsx`,
and wherever the API types for journals are declared.

Required behaviour:

1. Show `sum / max_period_score` and the percentage wherever a bare Sum is shown today.
2. The exam input's max is the period's `exam_max_score`; the bonus input's max is 20. Surface the
   backend's 400s rather than failing silently.
3. Mentor UI to edit the period's exam weight, calling the Phase 5 endpoint. Warn that it changes
   every student's maximum for that period.
4. Score entry keeps auto-ticking attendance when a score is entered (existing behaviour — verify
   it still holds, and that the backend coercion agrees with it).
5. Charts plot percentage, so weekly and monthly periods share an axis.

### Phase 8 — Tests

Extend `backend/app/tests/integration/test_journals.py` and add unit tests for `core.scoring`:

- Weekly 5-lesson period, perfect student: 25 + 5 + 70 = 100, `max_period_score == 100`,
  percentage 100.0.
- Monthly 12-lesson period, `exam_max_score = 60`: `max_period_score == 132`.
- Attendance with score 0 earns exactly 1 point; absence earns 0.
- `score > 0` submitted with `attendance = false` is stored as `attendance = true`.
- `exam_score = journal.exam_max_score + 1` → 400; `bonus_score = 21` → 400.
- Bonus pushes the percentage above 100.
- Changing `exam_max_score` recalculates every student's `max_period_score` in the period.
- Changing `exam_max_score` below an existing `exam_score` → 400, nothing mutated.
- Non-owner mentor and student roles → 403 on the new endpoint; archived course → 403 for mentor.
- Mid-course enrollee: past periods report `sum_score = 0` with a non-zero `max_period_score`, and
  the mentor can later fill those entries.
- Optimistic locking on the summary still returns 409 on a stale `version`.

Also update `backend/scripts/seed_demo_data.py` so demo data produces realistic percentages
rather than the old unbounded sums.

**Verify:** full backend suite green — do not report completion on a subset.

### Phase 9 — Documentation

- `PRD-IMKON-CRM.md` — rewrite the formula at line 609 and the surrounding rules (608–633), the
  recommendation at 669, the chart query at 1059–1060, and the ER fields at 1655–1657. Delete the
  `exam_score + bonus_score <= 500` rule; it no longer exists.
- `CONTRACT.md` — the journal payloads around lines 1697–1712 gain `homework_score`,
  `attendance_score`, `max_period_score`, `percentage`, and `exam_max_score`; document the new
  endpoint. If the contract is generated (`backend/scripts/generate_contract.py`), regenerate
  rather than hand-editing.
- `DESIGN (1).md:58` — the `success` threshold now applies to percentage, not raw `sum_score`.

---

## 4. Risks

| Risk | Handling |
|---|---|
| Migration clamps legacy exam/bonus values irreversibly | Pre-production data; state it in the revision docstring. Back up before running against anything real. |
| Every `sum_score` shifts by the attendance points | Expected. Causes at most one duplicate notification per student (`tasks.py:99`). |
| `exam_max_score` edits change all students' denominators at once | Rejected when it would invalidate an existing grade; audit-logged. |
| Averages become percentages | Deliberate — averaging raw sums across periods of different maxima was meaningless. Flag it in the release notes. |
| Frontend reading `sum_score` as a 0–100 value | Phase 7 audit of every consumer; percentage is now the comparable figure. |

## 5. Definition of done

- `alembic upgrade head` clean on a fresh and on a seeded database.
- Both §2 worked examples reproduce exactly in tests.
- Full backend suite green; no `skip`/`only`/TODO placeholders left behind.
- Journals page, progress chart, and mentor/student averages all render percentages consistently.
- PRD, CONTRACT and DESIGN no longer describe the old formula or the 500 cap.
