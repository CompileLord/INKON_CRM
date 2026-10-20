from app.core.deps import get_student_journal_history_service
from datetime import date, time, timedelta
from decimal import Decimal
from typing import Any
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User
from app.schemas.journal import JournalEntryUpdate
from app.services.enrollment_service import EnrollmentService
from app.services.journal_service import JournalService
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository


class GradingFixture:
    @classmethod
    async def create(
        cls, session: AsyncSession, student: User, mentor: User, admin: User
    ) -> tuple[Course, Journal, Journal]:
        past: date = date.today() - timedelta(days=7)
        future: date = date.today() + timedelta(days=7)
        course: Course = Course(
            title="Grading",
            description="Synthetic",
            start_date=past,
            end_date=future + timedelta(days=1),
            exam_type=CourseExamType.WEEKLY,
            price=Decimal("100.00"),
            mentor_id=mentor.id,
            status=CourseStatus.ACTIVE,
        )
        session.add(course)
        await session.flush()
        weekday: int
        for weekday in range(7):
            session.add(CourseSchedule(course_id=course.id, day_of_week=weekday, time_start=time(9), time_end=time(10)))
        journals: list[Journal] = []
        start: date
        for start in (past, future):
            journal: Journal = Journal(
                course_id=course.id,
                period_label=str(start),
                period_start=start,
                period_end=start + timedelta(days=1),
                period_type=JournalPeriodType.WEEK,
            )
            session.add(journal)
            journals.append(journal)
        await session.flush()
        await EnrollmentService(session).enroll_student(student.id, course.id, admin)
        await session.commit()
        return course, journals[0], journals[1]

    @classmethod
    async def entries(cls, session: AsyncSession, journal: Journal) -> list[JournalEntry]:
        return list(
            (
                await session.execute(
                    select(JournalEntry).where(JournalEntry.journal_id == journal.id).order_by(JournalEntry.lesson_date)
                )
            ).scalars()
        )

    @classmethod
    async def grade(cls, session: AsyncSession, entry: JournalEntry, mentor: User, score: int = 0) -> dict[str, Any]:
        result: dict[str, Any] = await JournalService(session).batch_update_entries(
            entry.journal_id,
            [
                JournalEntryUpdate(
                    student_id=entry.student_id,
                    lesson_date=entry.lesson_date,
                    attendance=score > 0,
                    score=score,
                    comment=None,
                    version=entry.version,
                )
            ],
            mentor,
        )
        await session.commit()
        return result


@pytest.mark.asyncio
async def test_precreated_grid_empty_deliberate_zero_partial_then_complete(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    course: Course
    current: Journal
    future: Journal
    course, current, future = await GradingFixture.create(db_session, test_student, test_mentor, test_admin)
    service: JournalService = JournalService(db_session)
    initial: list[Any] = await service.get_course_journals_aggregated(course.id)
    assert [(row.state, row.cells_filled) for row in initial] == [("empty", 0), ("upcoming", 0)]
    entries: list[JournalEntry] = await GradingFixture.entries(db_session, current)
    await GradingFixture.grade(db_session, entries[0], test_mentor)
    after_zero: list[Any] = await service.get_course_journals_aggregated(course.id)
    assert (after_zero[0].state, after_zero[0].cells_filled, after_zero[0].avg_percentage) == ("partial", 1, 0.0)
    await GradingFixture.grade(db_session, entries[1], test_mentor)
    completed: list[Any] = await service.get_course_journals_aggregated(course.id)
    assert (completed[0].state, completed[0].cells_filled) == ("complete", 2)
    assert completed[1].state == "upcoming"


@pytest.mark.asyncio
async def test_intentional_zero_summary_changes_unknown_to_proven_without_score_change(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    course: Course
    current: Journal
    future: Journal
    course, current, future = await GradingFixture.create(db_session, test_student, test_mentor, test_admin)
    summary: JournalStudentSummary = (
        await db_session.execute(select(JournalStudentSummary).where(JournalStudentSummary.journal_id == current.id))
    ).scalar_one()
    before_version: int = summary.version
    await JournalService(db_session).update_exam_or_bonus(
        current.id, test_student.id, 0, 0, summary.version, test_mentor
    )
    await db_session.commit()
    await db_session.refresh(summary)
    assert getattr(summary, "is_graded", None) is True
    assert summary.version > before_version
    stats: dict[str, Any] = await SQLAlchemyUserRepository(db_session).get_student_profile_stats(test_student.id)
    assert stats["courses"][0]["periods_graded"] == 1
    assert stats["courses"][0]["my_avg_percentage"] == 0.0
    assert stats["courses"][0]["my_rank"] == 1


@pytest.mark.asyncio
async def test_untouched_student_unranked_and_future_zero_denominators_not_grade_evidence(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    course: Course
    current: Journal
    future: Journal
    course, current, future = await GradingFixture.create(db_session, test_student, test_mentor, test_admin)
    stats: dict[str, Any] = await SQLAlchemyUserRepository(db_session).get_student_profile_stats(test_student.id)
    assert stats["courses"][0]["periods_graded"] == 0
    assert stats["courses"][0]["my_rank"] == 0
    assert stats["raw_totals"].summaries_count == 1
    assert stats["raw_totals"].periods_with_max_score_count == 1
    assert stats["raw_totals"].avg_score_raw is None
    assert stats["totals"]["absences"] == 0


@pytest.mark.asyncio
async def test_proven_only_means_ranks_and_history_keep_unknown_and_future_out(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    from app.models.user import UserRole
    from app.services.student_profile_service import StudentProfileService

    course: Course
    current: Journal
    future: Journal
    course, current, future = await GradingFixture.create(db_session, test_student, test_mentor, test_admin)
    classmate: User = User(
        email="graded-peer@example.invalid",
        password_hash="synthetic",
        first_name="Peer",
        last_name="Synthetic",
        role=UserRole.STUDENT,
    )
    db_session.add(classmate)
    await db_session.flush()
    await EnrollmentService(db_session).enroll_student(classmate.id, course.id, test_admin)
    await db_session.commit()
    entries: list[JournalEntry] = await GradingFixture.entries(db_session, current)
    own_entry: JournalEntry = next(row for row in entries if row.student_id == test_student.id)
    await GradingFixture.grade(db_session, own_entry, test_mentor, 5)
    summaries: list[JournalStudentSummary] = list((await db_session.execute(select(JournalStudentSummary))).scalars())
    row: JournalStudentSummary
    for row in summaries:
        if row.student_id == classmate.id and row.journal_id == current.id:
            row.sum_score = 100
            row.max_period_score = 100
            row.is_graded = None
        elif row.journal_id == future.id:
            row.sum_score = 999
            row.max_period_score = 1000
            row.is_graded = True
    await db_session.commit()
    repository: SQLAlchemyUserRepository = SQLAlchemyUserRepository(db_session)
    profile: dict[str, Any] = await StudentProfileService(repository).get_student_profile_payload(test_student.id)
    assert profile["courses"][0]["my_rank"] == 1
    assert profile["courses"][0]["periods_graded"] == 1
    assert profile["courses"][0]["periods_total"] == 1
    assert profile["totals"]["total_score"] == 6
    assert profile["totals"]["total_max_score"] == 102
    assert profile["performance"].raw_avg_percentage == 5.88
    assert profile["courses"][0]["class_avg_percentage"] == 5.9
    assert profile["courses"][0]["class_avg_score"] == 6.0
    peer_profile: dict[str, Any] = await repository.get_student_profile_stats(classmate.id)
    assert peer_profile["courses"][0]["my_rank"] == 0
    assert peer_profile["raw_totals"].unknown_summaries_count == 1
    assert peer_profile["raw_totals"].avg_score_raw is None
    history: list[dict[str, Any]] = await get_student_journal_history_service(db_session).legacy(classmate.id)
    assert {row["journal_id"]: row["state"] for row in history} == {current.id: "in_progress", future.id: "upcoming"}
    grid: dict[str, Any] = await JournalService(db_session).get_journal(current.id, test_student)
    assert (grid["my_rank"], grid["class_avg_score"], grid["class_avg_percentage"]) == (1, 6.0, 5.9)
    metrics: Any = await JournalService(db_session).get_course_journal_metrics(course.id)
    assert (metrics.periods_total, metrics.periods_complete, metrics.at_risk_count) == (1, 0, 1)
    assert (metrics.class_avg_score, metrics.class_avg_max_score, metrics.class_avg_percentage) == (6.0, 102.0, 5.9)
    mentor: dict[str, Any] = await repository.get_mentor_profile_stats(test_mentor.id)
    assert mentor["avg_score"] == 5.88
    assert mentor["avg_score_summary_count"] == 2
    assert mentor["avg_score_defined_ratios_mean"] == pytest.approx(100 * 6 / 102)
    analytics: dict[str, Any] = await repository.get_mentor_analytics(test_mentor.id)
    assert analytics["average_student_score"] == 6.0
    assert analytics["average_student_score_summary_count"] == 2
    peer_summary: JournalStudentSummary = next(
        row for row in summaries if row.student_id == classmate.id and row.journal_id == current.id
    )
    peer_summary.is_graded = True
    peer_summary.sum_score = 6
    peer_summary.max_period_score = 102
    await db_session.commit()
    own_tie: dict[str, Any] = await repository.get_student_profile_stats(test_student.id)
    peer_tie: dict[str, Any] = await repository.get_student_profile_stats(classmate.id)
    assert (own_tie["courses"][0]["my_rank"], peer_tie["courses"][0]["my_rank"]) == (1, 2)
    peer_grid: dict[str, Any] = await JournalService(db_session).get_journal(current.id, classmate)
    assert peer_grid["my_rank"] == 2


@pytest.mark.asyncio
async def test_zero_transition_requires_current_version_and_idempotent_retry_has_one_audit(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    from fastapi import HTTPException
    from app.models.audit_log import AuditLog

    course: Course
    current: Journal
    future: Journal
    course, current, future = await GradingFixture.create(db_session, test_student, test_mentor, test_admin)
    entry: JournalEntry = (await GradingFixture.entries(db_session, current))[0]
    stale: JournalEntryUpdate = JournalEntryUpdate(
        student_id=entry.student_id, lesson_date=entry.lesson_date, attendance=False, score=0, version=entry.version - 1
    )
    with pytest.raises(HTTPException) as conflict:
        await JournalService(db_session).batch_update_entries(current.id, [stale], test_mentor)
    assert conflict.value.status_code == 409
    assert entry.is_graded is False
    await GradingFixture.grade(db_session, entry, test_mentor)
    version: int = entry.version
    stale.version = version - 1
    await JournalService(db_session).batch_update_entries(current.id, [stale], test_mentor)
    await db_session.commit()
    assert entry.version == version
    audits: list[AuditLog] = list(
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.entity_type == "journal_entry",
                    AuditLog.entity_id == entry.id,
                    AuditLog.field_name == "is_graded",
                )
            )
        ).scalars()
    )
    assert [(row.old_value, row.new_value) for row in audits] == [("False", "True")]


@pytest.mark.asyncio
async def test_proven_zero_with_zero_maximum_counts_grade_without_ratio_or_rank(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    course: Course
    current: Journal
    future: Journal
    course, current, future = await GradingFixture.create(db_session, test_student, test_mentor, test_admin)
    summary: JournalStudentSummary = (await db_session.execute(select(JournalStudentSummary).where(
        JournalStudentSummary.journal_id == current.id,
    ))).scalar_one()
    summary.is_graded = True
    summary.max_period_score = 0
    await db_session.commit()
    repository: SQLAlchemyUserRepository = SQLAlchemyUserRepository(db_session)
    stats: dict[str, Any] = await repository.get_student_profile_stats(test_student.id)
    assert stats["courses"][0]["periods_graded"] == 1
    assert stats["courses"][0]["my_rank"] == 0
    assert stats["raw_totals"].graded_summaries_count == 1
    assert stats["raw_totals"].periods_with_max_score_count == 0
    assert stats["raw_totals"].avg_score_raw is None
    history: list[dict[str, Any]] = await get_student_journal_history_service(db_session).legacy(test_student.id)
    assert next(row for row in history if row["journal_id"] == current.id)["state"] == "graded"
