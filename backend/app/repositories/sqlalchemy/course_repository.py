from datetime import date
from typing import Dict, List, Optional, Sequence
from sqlalchemy import func, or_, select, Select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.repositories.interfaces.course_repository import CourseRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyCourseRepository(SQLAlchemyBaseRepository[Course], CourseRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Course, session)

    async def get_by_id_for_update(self, course_id: int) -> Optional[Course]:
        statement: Select[tuple[Course]] = select(Course).where(Course.id == course_id).with_for_update().execution_options(populate_existing=True)
        return (await self.session.execute(statement)).scalar_one_or_none()

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
            .where(
                Enrollment.course_id.in_(course_ids),
                Enrollment.status == EnrollmentStatus.ACTIVE,
                Enrollment.is_deleted == False,
            )
            .group_by(Enrollment.course_id)
        )
        rows = (await self.session.execute(statement)).all()
        return {course_id: student_count for course_id, student_count in rows}
