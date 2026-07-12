from datetime import date
from typing import Any, Dict, List, Optional
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.repositories.interfaces.user_repository import UserRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyUserRepository(SQLAlchemyBaseRepository[User], UserRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(User, session)

    async def get_by_email(self, email: str) -> Optional[User]:
        query = select(User).filter(User.email == email, User.is_deleted == False)
        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_students_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> dict:
        query = select(User).filter(User.role == UserRole.STUDENT, User.is_deleted == False)
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                or_(
                    User.first_name.ilike(search_pattern),
                    User.last_name.ilike(search_pattern),
                    User.email.ilike(search_pattern),
                )
            )
        return await self.get_paginated(query, page, page_size)

    async def get_mentors_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> dict:
        query = select(User).filter(User.role == UserRole.MENTOR, User.is_deleted == False)
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                or_(
                    User.first_name.ilike(search_pattern),
                    User.last_name.ilike(search_pattern),
                    User.email.ilike(search_pattern),
                )
            )
        return await self.get_paginated(query, page, page_size)

    async def get_student_profile_stats(self, student_id: int) -> Dict[str, Any]:
        courses_query = select(Course).join(Enrollment).filter(
            Enrollment.student_id == student_id,
            Enrollment.is_deleted == False
        )
        courses_result = await self.session.execute(courses_query)
        courses = list(courses_result.scalars().all())

        avg_score_query = select(func.avg(JournalStudentSummary.sum_score)).filter(
            JournalStudentSummary.student_id == student_id
        )
        avg_score_result = await self.session.execute(avg_score_query)
        avg_score = avg_score_result.scalar()

        absences_query = select(func.count(JournalEntry.id)).filter(
            JournalEntry.student_id == student_id,
            JournalEntry.attendance == False
        )
        absences_result = await self.session.execute(absences_query)
        absences = absences_result.scalar() or 0

        total_lessons_query = select(func.count(JournalEntry.id)).filter(
            JournalEntry.student_id == student_id
        )
        total_lessons_result = await self.session.execute(total_lessons_query)
        total_lessons = total_lessons_result.scalar() or 0

        return {
            "courses": courses,
            "avg_score": float(avg_score) if avg_score is not None else 0.0,
            "absences": absences,
            "total_lessons": total_lessons
        }

    async def get_mentor_profile_stats(self, mentor_id: int) -> Dict[str, Any]:
        courses_query = select(Course).filter(
            Course.mentor_id == mentor_id,
            Course.status == CourseStatus.ACTIVE,
            Course.is_deleted == False
        )
        courses_result = await self.session.execute(courses_query)
        active_courses = list(courses_result.scalars().all())

        active_students_query = select(func.count(func.distinct(Enrollment.student_id))).join(Course).filter(
            Course.mentor_id == mentor_id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
            Enrollment.is_deleted == False
        )
        active_students_result = await self.session.execute(active_students_query)
        active_students_count = active_students_result.scalar() or 0

        avg_score_query = select(func.avg(JournalStudentSummary.sum_score)).join(
            Journal, JournalStudentSummary.journal_id == Journal.id
        ).join(Course, Journal.course_id == Course.id).filter(
            Course.mentor_id == mentor_id
        )
        avg_score_result = await self.session.execute(avg_score_query)
        avg_score = avg_score_result.scalar()

        return {
            "active_courses": active_courses,
            "active_students_count": active_students_count,
            "avg_score": float(avg_score) if avg_score is not None else 0.0
        }
