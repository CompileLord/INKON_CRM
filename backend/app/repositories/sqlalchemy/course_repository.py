from datetime import date
from typing import Any, cast, Dict, List, Optional, Sequence
from sqlalchemy import bindparam, func, or_, select, Select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.elements import ColumnElement, TextClause
from sqlalchemy.engine import CursorResult
from app.models.user import User, UserRole
from app.schemas.course_list import CourseSortOrder
from app.repositories.interfaces.base_repository import RepositoryPage
from app.repositories.sqlalchemy.person_search import PersonSearch
from app.models.course import Course, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.repositories.interfaces.course_repository import CourseJournalProgress, CourseRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyCourseRepository(SQLAlchemyBaseRepository[Course], CourseRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Course, session)

    async def get_courses_page(
        self, filters: dict, page: int, page_size: int, user_id: int, role: UserRole,
        search: str | None = None, sort: CourseSortOrder = CourseSortOrder.CREATED_AT_DESC,
    ) -> RepositoryPage[Course]:
        query: Select[tuple[Course]] = (
            select(Course).options(selectinload(Course.schedules)).where(Course.is_deleted.is_(False))
        )
        if role == UserRole.MENTOR:
            query = query.where(Course.mentor_id == user_id)
        elif role == UserRole.STUDENT:
            query = query.join(Enrollment, Enrollment.course_id == Course.id).where(
                Enrollment.student_id == user_id, Enrollment.is_deleted.is_(False),
            )
        if filters.get("status"):
            query = query.where(Course.status == filters["status"])
        if search:
            query = query.where(Course.title.ilike(PersonSearch.pattern(search), escape="\\"))
        columns: dict[CourseSortOrder, ColumnElement[Any]] = {
            CourseSortOrder.CREATED_AT_DESC: Course.created_at.desc(),
            CourseSortOrder.CREATED_AT_ASC: Course.created_at.asc(),
            CourseSortOrder.TITLE_ASC: Course.title.asc(),
            CourseSortOrder.TITLE_DESC: Course.title.desc(),
            CourseSortOrder.PRICE_ASC: Course.price.asc(),
            CourseSortOrder.PRICE_DESC: Course.price.desc(),
            CourseSortOrder.START_DATE_ASC: Course.start_date.asc(),
            CourseSortOrder.START_DATE_DESC: Course.start_date.desc(),
        }
        query = query.order_by(columns[sort], Course.id.asc())
        return cast(RepositoryPage[Course], await self.get_paginated(query, page, page_size))

    async def get_journal_progress(self, course_ids: Sequence[int], today: date) -> dict[int, CourseJournalProgress]:
        if not course_ids:
            return {}
        statement: TextClause = text("""
            WITH current_journals AS (
                SELECT DISTINCT ON (journal.course_id) journal.course_id, journal.id, journal.period_label,
                    journal.period_start, LEAST(journal.period_end, CAST(:today AS date)) AS held_until
                FROM journals AS journal
                WHERE journal.course_id IN :course_ids AND journal.period_start <= :today AND journal.period_end >= :today
                ORDER BY journal.course_id, journal.period_start, journal.id
            ), eligible AS (
                SELECT enrollment.course_id, enrollment.student_id
                FROM enrollments AS enrollment JOIN users AS student ON student.id = enrollment.student_id
                WHERE enrollment.course_id IN :course_ids AND enrollment.is_deleted IS FALSE
                    AND enrollment.status = 'active' AND student.is_deleted IS FALSE
            ), student_counts AS (
                SELECT course_id, count(*) AS student_count FROM eligible GROUP BY course_id
            ), scheduled AS (
                SELECT journal.course_id, sum(CASE WHEN journal.held_until - journal.period_start >=
                    ((schedule.day_of_week - (extract(isodow FROM journal.period_start)::integer - 1) + 7) % 7)
                    THEN 1 + (journal.held_until - journal.period_start -
                    ((schedule.day_of_week - (extract(isodow FROM journal.period_start)::integer - 1) + 7) % 7)) / 7 ELSE 0 END) AS lesson_count
                FROM current_journals AS journal JOIN course_schedules AS schedule ON schedule.course_id = journal.course_id
                GROUP BY journal.course_id
            ), graded_dates AS (
                SELECT journal.course_id, entry.lesson_date, count(DISTINCT entry.student_id) AS graded_count
                FROM current_journals AS journal JOIN journal_entries AS entry ON entry.journal_id = journal.id
                JOIN eligible ON eligible.course_id = journal.course_id AND eligible.student_id = entry.student_id
                JOIN course_schedules AS schedule ON schedule.course_id = journal.course_id
                    AND schedule.day_of_week = extract(isodow FROM entry.lesson_date)::integer - 1
                WHERE entry.is_graded IS TRUE AND entry.lesson_date BETWEEN journal.period_start AND journal.held_until
                GROUP BY journal.course_id, entry.lesson_date
            ), completed AS (
                SELECT graded.course_id, count(*) AS lesson_count FROM graded_dates AS graded
                JOIN student_counts AS students ON students.course_id = graded.course_id
                WHERE graded.graded_count >= students.student_count GROUP BY graded.course_id
            ), last_graded AS (
                SELECT journal.course_id, max(entry.lesson_date) AS lesson_date FROM journal_entries AS entry
                JOIN journals AS journal ON journal.id = entry.journal_id
                WHERE journal.course_id IN :course_ids AND entry.is_graded IS TRUE AND entry.lesson_date <= :today
                GROUP BY journal.course_id
            )
            SELECT course.id, current_journal.period_label, last_graded.lesson_date AS last_graded_lesson_date,
                CASE WHEN COALESCE(students.student_count, 0) = 0 THEN 0
                     ELSE COALESCE(scheduled.lesson_count, 0) - COALESCE(completed.lesson_count, 0) END AS ungraded_lessons_count
            FROM courses AS course
            LEFT JOIN current_journals AS current_journal ON current_journal.course_id = course.id
            LEFT JOIN student_counts AS students ON students.course_id = course.id
            LEFT JOIN scheduled ON scheduled.course_id = course.id
            LEFT JOIN completed ON completed.course_id = course.id
            LEFT JOIN last_graded ON last_graded.course_id = course.id
            WHERE course.id IN :course_ids
        """).bindparams(bindparam("course_ids", expanding=True))
        rows: CursorResult[Any] = await self.session.execute(statement, {"course_ids": list(course_ids), "today": today})
        return {row.id: CourseJournalProgress(row.period_label, row.last_graded_lesson_date, row.ungraded_lessons_count) for row in rows}

    async def get_by_id_for_update(self, course_id: int) -> Optional[Course]:
        statement: Select[tuple[Course]] = select(Course).where(Course.id == course_id).with_for_update().execution_options(populate_existing=True)
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def get_copy_source_enrollments(self, course_id: int, limit: int) -> list[Enrollment]:
        statement: Select[tuple[Enrollment]] = select(Enrollment).where(
            Enrollment.course_id == course_id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
            Enrollment.is_deleted.is_(False),
        ).order_by(Enrollment.id).limit(limit)
        return list((await self.session.execute(statement)).scalars().all())

    async def get_course_journals(self, course_id: int) -> list[Journal]:
        statement: Select[tuple[Journal]] = select(Journal).where(Journal.course_id == course_id).order_by(Journal.period_start)
        return list((await self.session.execute(statement)).scalars().all())

    async def get_course_schedules(self, course_id: int) -> list[CourseSchedule]:
        statement: Select[tuple[CourseSchedule]] = select(CourseSchedule).where(CourseSchedule.course_id == course_id)
        return list((await self.session.execute(statement)).scalars().all())

    async def get_active_courses(self, skip: int = 0, limit: int = 100) -> List[Course]:
        query = select(Course).filter(
            Course.status == CourseStatus.ACTIVE,
            Course.is_deleted == False
        ).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_expired_courses(self, skip: int = 0, limit: int = 100) -> List[Course]:
        today = date.today()
        query = select(Course).filter(
            or_(
                Course.status == CourseStatus.ARCHIVED,
                Course.end_date < today
            ),
            Course.is_deleted == False
        ).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count_active_students_by_course(self, course_ids: Sequence[int]) -> Dict[int, int]:
        if not course_ids:
            return {}
        statement: Select[tuple[int, int]] = (
            select(Enrollment.course_id, func.count(Enrollment.id))
            .join(User, User.id == Enrollment.student_id)
            .where(
                Enrollment.course_id.in_(course_ids),
                Enrollment.status == EnrollmentStatus.ACTIVE,
                Enrollment.is_deleted == False,
                User.is_deleted.is_(False),
            )
            .group_by(Enrollment.course_id)
        )
        rows = (await self.session.execute(statement)).all()
        return {course_id: student_count for course_id, student_count in rows}
