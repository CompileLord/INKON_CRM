from datetime import date
from typing import List, Optional
from sqlalchemy import or_, select, Select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.course import Course, CourseStatus
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
