from app.repositories.sqlalchemy.student_performance_repository import SQLAlchemyStudentPerformanceRepository
from typing import Any, Dict, List, Optional
from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.selectable import Exists
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
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

    async def get_by_id_for_authentication(self, user_id: int) -> Optional[User]:
        query: Select[tuple[User]] = (
            select(User)
            .where(User.id == user_id)
            .execution_options(populate_existing=True)
        )
        result: Result[tuple[User]] = await self.session.execute(query)
        return result.scalars().first()

    async def get_by_id_for_update(self, user_id: int) -> Optional[User]:
        query: Select[tuple[User]] = (
            select(User)
            .where(User.id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        result: Result[tuple[User]] = await self.session.execute(query)
        return result.scalars().first()

    async def get_by_email_for_update(self, email: str) -> Optional[User]:
        query: Select[tuple[User]] = (
            select(User)
            .where(User.email == email, User.is_deleted.is_(False))
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        result: Result[tuple[User]] = await self.session.execute(query)
        return result.scalars().first()

    async def get_active_superadmins(self) -> list[User]:
        query: Select[tuple[User]] = (
            select(User)
            .where(User.role == UserRole.SUPERADMIN, User.is_deleted.is_(False))
            .order_by(User.id)
        )
        result: Result[tuple[User]] = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_students_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        mentor_id: int | None = None,
    ) -> dict:
        query: Select[tuple[User]] = select(User).where(
            User.role == UserRole.STUDENT,
            User.is_deleted.is_(False),
        ).order_by(User.id)
        if mentor_id is not None:
            owned_course_enrollment: Exists = (
                select(Enrollment.id)
                .join(Course, Enrollment.course_id == Course.id)
                .where(
                    Enrollment.student_id == User.id,
                    Enrollment.is_deleted.is_(False),
                    Course.is_deleted.is_(False),
                    Course.mentor_id == mentor_id,
                )
                .correlate(User)
                .exists()
            )
            query = query.where(owned_course_enrollment)
        if search:
            search_pattern = f"%{search}%"
            query = query.where(
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
        return await SQLAlchemyStudentPerformanceRepository(self.session).get_student_profile_stats(student_id)

    async def get_student_journals(
        self,
        student_id: int,
        course_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        return await SQLAlchemyStudentPerformanceRepository(self.session).get_student_journals(student_id, course_id)

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

        avg_score_query = select(
            func.avg(
                case(
                    (JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
                    else_=0.0
                )
            )
        ).join(
            Journal, JournalStudentSummary.journal_id == Journal.id
        ).join(Course, Journal.course_id == Course.id).filter(
            Course.mentor_id == mentor_id
        )
        avg_score_result = await self.session.execute(avg_score_query)
        avg_score = avg_score_result.scalar()

        profile_summary_counts_query = select(
            func.count(JournalStudentSummary.id),
            func.count(case((JournalStudentSummary.max_period_score > 0, JournalStudentSummary.id))),
            func.count(case((JournalStudentSummary.max_period_score <= 0, JournalStudentSummary.id))),
            func.avg(case(
                (JournalStudentSummary.max_period_score > 0,
                 (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
                else_=None
            ))
        ).join(
            Journal, JournalStudentSummary.journal_id == Journal.id
        ).join(Course, Journal.course_id == Course.id).filter(
            Course.mentor_id == mentor_id
        )
        profile_summary_counts_result: Any = await self.session.execute(profile_summary_counts_query)
        summary_count: int
        defined_ratio_count: int
        undefined_ratio_count: int
        defined_ratios_mean: Any
        summary_count, defined_ratio_count, undefined_ratio_count, defined_ratios_mean = profile_summary_counts_result.one()

        return {
            "active_courses": active_courses,
            "active_students_count": active_students_count,
            "avg_score": round(float(avg_score), 2) if avg_score is not None else 0.0,
            "avg_score_grading_state": "unknown" if summary_count else "missing",
            "avg_score_provenance": "unknown",
            "avg_score_basis": "all_summaries_on_courses_currently_assigned_including_soft_deleted_and_archived",
            "avg_score_summary_count": summary_count,
            "avg_score_defined_ratio_count": defined_ratio_count,
            "avg_score_undefined_ratio_count": undefined_ratio_count,
            "avg_score_defined_ratios_mean": float(defined_ratios_mean) if defined_ratios_mean is not None else None
        }

    async def get_mentor_analytics(self, mentor_id: int) -> Dict[str, Any]:
        active_courses_result: Any = await self.session.execute(select(func.count(Course.id)).filter(
            Course.mentor_id == mentor_id,
            Course.status == CourseStatus.ACTIVE,
            Course.is_deleted == False
        ))
        active_courses_count: int = active_courses_result.scalar() or 0

        students_result: Any = await self.session.execute(select(
            func.count(func.distinct(Enrollment.student_id))
        ).join(Course).filter(
            Course.mentor_id == mentor_id,
            Enrollment.is_deleted == False
        ))
        total_students_count: int = students_result.scalar() or 0

        score_result: Any = await self.session.execute(select(
            func.avg(JournalStudentSummary.sum_score),
            func.count(JournalStudentSummary.id)
        ).join(
            Journal, JournalStudentSummary.journal_id == Journal.id
        ).join(Course, Journal.course_id == Course.id).filter(
            Course.mentor_id == mentor_id,
            Course.is_deleted == False
        ))
        average_score: Any
        summary_count: int
        average_score, summary_count = score_result.one()

        return {
            "active_courses_count": active_courses_count,
            "active_courses_population": "active_non_deleted_courses",
            "total_students_count": total_students_count,
            "total_students_population": "non_deleted_enrollments_on_assigned_courses_all_statuses_including_soft_deleted_courses",
            "average_student_score": float(average_score) if average_score is not None else 0.0,
            "average_student_score_grading_state": "unknown" if summary_count else "missing",
            "average_student_score_provenance": "unknown",
            "average_student_score_basis": "all_summaries_on_non_deleted_courses_including_archived_raw_points",
            "average_student_score_summary_count": summary_count
        }
