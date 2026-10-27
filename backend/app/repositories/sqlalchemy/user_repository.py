from app.repositories.sqlalchemy.student_performance_repository import SQLAlchemyStudentPerformanceRepository
from datetime import date
from typing import cast, Any, Dict, List, Optional
from sqlalchemy import Select, case, func, select
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.selectable import Exists
from app.core.email_normalizer import EmailNormalizer
from app.core.login_identifier import LoginIdentifier, LoginIdentifierKind
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.repositories.interfaces.base_repository import RepositoryPage
from app.repositories.interfaces.user_repository import UserRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository
from app.repositories.sqlalchemy.person_search import PersonSearch


class SQLAlchemyUserRepository(SQLAlchemyBaseRepository[User], UserRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(User, session)

    async def get_by_email(self, email: str) -> Optional[User]:
        query = select(User).filter(func.lower(User.email) == EmailNormalizer.normalize(email), User.is_deleted == False)
        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_by_phone(self, phone: str) -> Optional[User]:
        query: Select[tuple[User]] = select(User).where(User.phone == phone, User.is_deleted.is_(False))
        result: Result[tuple[User]] = await self.session.execute(query)
        return result.scalars().first()

    async def get_by_login(self, identifier: LoginIdentifier) -> Optional[User]:
        if identifier.kind == LoginIdentifierKind.EMAIL:
            return await self.get_by_email(identifier.value)
        return await self.get_by_phone(identifier.value)

    async def get_by_login_for_update(self, identifier: LoginIdentifier) -> Optional[User]:
        if identifier.kind == LoginIdentifierKind.EMAIL:
            return await self.get_by_email_for_update(identifier.value)
        query: Select[tuple[User]] = (
            select(User)
            .where(User.phone == identifier.value, User.is_deleted.is_(False))
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        result: Result[tuple[User]] = await self.session.execute(query)
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
            .where(func.lower(User.email) == EmailNormalizer.normalize(email), User.is_deleted.is_(False))
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
    ) -> RepositoryPage[User]:
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
            query = query.where(PersonSearch.matches(search, include_parent_phone=True))
        return cast(RepositoryPage[User], await self.get_paginated(query, page, page_size))

    async def get_mentors_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> RepositoryPage[User]:
        query: Select[tuple[User]] = select(User).filter(User.role == UserRole.MENTOR, User.is_deleted == False).order_by(User.id)
        if search:
            query = query.where(PersonSearch.matches(search))
        return cast(RepositoryPage[User], await self.get_paginated(query, page, page_size))

    async def get_student_profile_stats(self, student_id: int) -> Dict[str, Any]:
        return await SQLAlchemyStudentPerformanceRepository(self.session).get_student_profile_stats(student_id)

    async def get_student_visible_mentor_courses(self, mentor_id: int, student_id: int) -> list[Course]:
        statement: Select[tuple[Course]] = (
            select(Course)
            .join(Enrollment, Enrollment.course_id == Course.id)
            .join(User, User.id == Course.mentor_id)
            .where(
                Course.mentor_id == mentor_id,
                Course.is_deleted.is_(False),
                User.is_deleted.is_(False),
                User.role == UserRole.MENTOR,
                Enrollment.student_id == student_id,
                Enrollment.is_deleted.is_(False),
            )
            .order_by(Course.id)
        )
        result: Result[tuple[Course]] = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_mentor_profile_stats(self, mentor_id: int) -> Dict[str, Any]:
        courses_query = select(Course).filter(
            Course.mentor_id == mentor_id,
            Course.status == CourseStatus.ACTIVE,
            Course.is_deleted == False
        )
        courses_result = await self.session.execute(courses_query)
        active_courses = list(courses_result.scalars().all())

        active_students_query = select(func.count(func.distinct(Enrollment.student_id))).join(Course).join(User, User.id == Enrollment.student_id).filter(
            Course.mentor_id == mentor_id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
            Enrollment.is_deleted == False,
            User.is_deleted.is_(False),
        )
        active_students_result = await self.session.execute(active_students_query)
        active_students_count = active_students_result.scalar() or 0

        avg_score_query = select(
            func.avg(
                case(
                    (JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
                    else_=None
                )
            )
        ).join(
            Journal, JournalStudentSummary.journal_id == Journal.id
        ).join(Course, Journal.course_id == Course.id).filter(
            Course.mentor_id == mentor_id,
            Journal.period_start <= date.today(),
            JournalStudentSummary.is_graded.is_(True),
        )
        avg_score_result = await self.session.execute(avg_score_query)
        avg_score = avg_score_result.scalar()

        profile_summary_counts_query = select(
            func.count(JournalStudentSummary.id),
            func.count(case((JournalStudentSummary.max_period_score > 0, JournalStudentSummary.id))),
            func.count(case((JournalStudentSummary.max_period_score <= 0, JournalStudentSummary.id))),
            func.avg(case(
                (JournalStudentSummary.is_graded.is_(True) & (JournalStudentSummary.max_period_score > 0),
                 (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
                else_=None
            ))
        ).join(
            Journal, JournalStudentSummary.journal_id == Journal.id
        ).join(Course, Journal.course_id == Course.id).filter(
            Course.mentor_id == mentor_id,
            Journal.period_start <= date.today(),
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
            func.avg(JournalStudentSummary.sum_score).filter(JournalStudentSummary.is_graded.is_(True)),
            func.count(JournalStudentSummary.id)
        ).join(
            Journal, JournalStudentSummary.journal_id == Journal.id
        ).join(Course, Journal.course_id == Course.id).filter(
            Course.mentor_id == mentor_id,
            Course.is_deleted == False,
            Journal.period_start <= date.today(),
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

    async def mentor_has_student(self, mentor_id: int, student_id: int) -> bool:
        query: Select[tuple[bool]] = select(select(Enrollment.id).join(Course).where(
            Enrollment.student_id == student_id,
            Course.mentor_id == mentor_id,
            Enrollment.is_deleted.is_(False),
        ).exists())
        return bool(await self.session.scalar(query))
