from datetime import date
from typing import Any, cast, Dict, List, Optional, Sequence
from sqlalchemy import func, or_, select, Select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.elements import ColumnElement
from app.models.user import User, UserRole
from app.schemas.course_list import CourseSortOrder
from app.repositories.interfaces.base_repository import RepositoryPage
from app.repositories.sqlalchemy.person_search import PersonSearch
from app.models.course import Course, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.repositories.interfaces.course_repository import CourseRepository
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
