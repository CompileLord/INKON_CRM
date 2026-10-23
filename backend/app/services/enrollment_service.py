from datetime import date
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.audit_service import AuditService
from app.core.scoring import ScoringPolicy
from app.core.schedule_utils import EnrollmentLessonPlan, LessonDateCalculator
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.schemas.enrollment import (
    CourseRosterItemResponse,
    CourseRosterResponse,
    EligibleCandidateResponse,
    RosterLocationResponse,
    RosterSortOrder,
    RosterStudentIdentity,
)
from app.schemas.common import PaginatedResponse
from app.models.course import Course, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.repositories.interfaces.course_repository import CourseRepository
from app.repositories.interfaces.enrollment_repository import EnrollmentRepository, EnrollmentFilters
from app.repositories.interfaces.base_repository import RepositoryPage
from app.repositories.interfaces.user_repository import UserRepository
from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
from app.repositories.sqlalchemy.enrollment_repository import SQLAlchemyEnrollmentRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository

PALETTE: List[str] = [
    "#E53E3E", "#319795", "#3182CE", "#D69E2E", "#D53F8C",
    "#805AD5", "#DD6B20", "#38A169", "#00B5D8", "#B83280",
    "#4C51BF", "#C05621", "#2B6CB0", "#2F855A", "#9B2C2C",
    "#2C7A7B", "#6B46C1", "#975A16", "#702459", "#1A365D"
]


class EnrollmentConflictClassifier:
    CONSTRAINT_NAME: str = "uq_student_course"

    def is_uniqueness_conflict(self, error: IntegrityError) -> bool:
        original_cause = getattr(error, "orig", None)
        if original_cause is not None:
            constraint_name = getattr(original_cause, "constraint_name", None)
            if constraint_name == self.CONSTRAINT_NAME:
                return True
            orig_diag = getattr(original_cause, "diag", None)
            if orig_diag is not None and getattr(orig_diag, "constraint_name", None) == self.CONSTRAINT_NAME:
                return True
        error_message = str(error).lower()
        if self.CONSTRAINT_NAME in error_message:
            return True
        return False


class EnrollmentService:
    def __init__(
        self,
        db: AsyncSession,
        enrollment_repo: Optional[EnrollmentRepository] = None,
        course_repo: Optional[CourseRepository] = None,
        user_repo: Optional[UserRepository] = None,
        conflict_classifier: Optional[EnrollmentConflictClassifier] = None,
    ) -> None:
        self.db: AsyncSession = db
        self.enrollment_repo: EnrollmentRepository = enrollment_repo or SQLAlchemyEnrollmentRepository(db)
        self.course_repo: CourseRepository = course_repo or SQLAlchemyCourseRepository(db)
        self.user_repo: UserRepository = user_repo or SQLAlchemyUserRepository(db)
        self.conflict_classifier: EnrollmentConflictClassifier = conflict_classifier or EnrollmentConflictClassifier()

    async def enroll_student(
        self, student_id: int, course_id: int, current_user: User,
        lesson_plan: EnrollmentLessonPlan | None = None,
    ) -> Enrollment:
        from app.services.finance_service import FinanceService

        await FinanceService(self.db).lock_student_accounts([student_id])
        course = await self.course_repo.get_by_id(course_id)
        if not course or course.is_deleted or course.status != CourseStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Course is archived/inactive"
            )

        FinanceService.validate_installment_price(course.price, course.start_date, course.end_date)

        student = await self.user_repo.get_by_id(student_id)
        if not student or student.is_deleted or student.role != UserRole.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student deactivated/inactive"
            )

        if await self.enrollment_repo.find_existing(student_id, course_id) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Student is already enrolled in this course"
            )

        count_existing_enrollments: int = await self.enrollment_repo.count_existing(course_id)
        color_hex = PALETTE[count_existing_enrollments % len(PALETTE)]

        enrollment = Enrollment(
            student_id=student_id,
            course_id=course_id,
            price_at_enrollment=course.price,
            color_hex=color_hex,
            status=EnrollmentStatus.ACTIVE
        )
        try:
            self.db.add(enrollment)
            await self.db.flush()
        except IntegrityError as error:
            await self.db.rollback()
            if self.conflict_classifier.is_uniqueness_conflict(error):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Student is already enrolled in this course"
                )
            raise

        if lesson_plan is None:
            schedules: list[CourseSchedule] = await self.enrollment_repo.list_schedules(course_id)
            journals: list[Journal] = await self.enrollment_repo.list_journals(course_id)
            lesson_plan = EnrollmentLessonPlan.build(course_id, journals, LessonDateCalculator.calculate(
                course.start_date, course.end_date, [schedule.day_of_week for schedule in schedules],
            ))
        if lesson_plan.course_id != course_id:
            raise ValueError("Enrollment lesson plan belongs to another course")
        entries_to_add: list[JournalEntry] = []
        summaries_to_add: list[JournalStudentSummary] = []
        for journal in lesson_plan.journals:
            lesson_dates: tuple[date, ...] = lesson_plan.dates_by_journal[journal.id]
            for l_date in lesson_dates:
                entries_to_add.append(JournalEntry(
                    journal_id=journal.id,
                    student_id=student_id,
                    lesson_date=l_date,
                    attendance=False,
                    score=0,
                    comment=None,
                    version=1,
                    is_graded=False,
                ))

            summaries_to_add.append(JournalStudentSummary(
                journal_id=journal.id,
                student_id=student_id,
                homework_score=0,
                attendance_score=0,
                exam_score=0,
                bonus_score=0,
                sum_score=0,
                max_period_score=ScoringPolicy.max_period_score(len(lesson_dates), journal.exam_max_score, journal.bonus_max_score),
                attendance_count=0,
                total_lessons=len(lesson_dates),
                version=1,
                is_graded=False,
            ))

        try:
            self.db.add_all(entries_to_add)
            self.db.add_all(summaries_to_add)
            await self.db.flush()
        except IntegrityError as error:
            await self.db.rollback()
            if self.conflict_classifier.is_uniqueness_conflict(error):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Student is already enrolled in this course"
                )
            raise

        finance_service = FinanceService(self.db)
        await finance_service.generate_schedule_for_enrollment(enrollment.id)

        await AuditService(self.db).log_change(
            current_user.id, "create", "enrollment", enrollment.id,
            f"{student.first_name} {student.last_name}", {"student_id", "course_id"},
        )
        await self.db.refresh(enrollment)
        return enrollment

    async def withdraw_student(self, enrollment_id: int, actor_id: int | None = None) -> Enrollment:
        enrollment = await self.enrollment_repo.get_by_id(enrollment_id)
        if not enrollment or enrollment.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Enrollment not found"
            )
        from app.services.finance_service import FinanceService

        await FinanceService(self.db).lock_student_accounts([enrollment.student_id])
        previous_status: EnrollmentStatus = enrollment.status
        enrollment.status = EnrollmentStatus.WITHDRAWN
        await self.enrollment_repo.update(enrollment)

        from app.models.charge import Charge, ChargeStatus
        from app.services.finance_service import get_dushanbe_today
        today: date = get_dushanbe_today()
        future_charges: list[Charge] = await self.enrollment_repo.list_future_open_charges(enrollment_id, today)
        future_charge: Charge
        for future_charge in future_charges:
            future_charge.status = ChargeStatus.CANCELLED

        if previous_status != EnrollmentStatus.WITHDRAWN:
            student: User | None = await self.user_repo.get_by_id(enrollment.student_id)
            if student is None:
                raise ValueError("Enrollment student not found")
            await AuditService(self.db).log_change(
                actor_id, "update", "enrollment", enrollment.id,
                f"{student.first_name} {student.last_name}", {"status"},
            )
        await FinanceService(self.db)._invalidate_cache()
        await self.db.refresh(enrollment)
        return enrollment

    async def list_enrollments(
        self,
        filters: EnrollmentFilters,
        page: int,
        page_size: int
    ) -> RepositoryPage[Enrollment]:
        return await self.enrollment_repo.list_enrollments(filters, page, page_size)

    async def get_course_roster(
        self,
        course_id: int,
        current_user: User,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        status_filter: Optional[EnrollmentStatus] = None,
        sort: RosterSortOrder = RosterSortOrder.NAME_ASC,
        student_id: Optional[int] = None,
        locate_student_id: Optional[int] = None,
    ) -> CourseRosterResponse:
        course = await self.course_repo.get_by_id(course_id)
        if not course or course.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )

        if current_user.role == UserRole.SUPERADMIN:
            pass
        elif current_user.role == UserRole.MENTOR:
            if course.mentor_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to view enrollments for this course"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view course roster"
            )

        roster_data = await self.enrollment_repo.get_course_roster(
            course_id=course_id,
            page=page,
            page_size=page_size,
            search=search,
            status=status_filter,
            sort=sort,
            student_id=student_id,
            locate_student_id=locate_student_id,
        )

        formatted_items = [
            CourseRosterItemResponse(
                id=enrollment.id,
                enrollment_id=enrollment.id,
                student_id=enrollment.student_id,
                course_id=enrollment.course_id,
                price_at_enrollment=enrollment.price_at_enrollment,
                color_hex=enrollment.color_hex,
                enrolled_at=enrollment.enrolled_at,
                status=enrollment.status,
                student=RosterStudentIdentity(
                    id=enrollment.student.id,
                    first_name=enrollment.student.first_name,
                    last_name=enrollment.student.last_name,
                    email=enrollment.student.email,
                    phone=enrollment.student.phone,
                    photo_path=enrollment.student.photo_path,
                    thumbnail_path=enrollment.student.thumbnail_path,
                ),
            )
            for enrollment in roster_data.items
        ]

        return CourseRosterResponse(
            items=formatted_items,
            total=roster_data.total,
            page=roster_data.page,
            page_size=roster_data.page_size,
            total_pages=roster_data.total_pages,
            active_count=roster_data.active_count,
            located_page=roster_data.located_page,
            located_index=roster_data.located_index,
        )

    async def get_roster_location(
        self,
        course_id: int,
        student_id: int,
        current_user: User,
        page_size: int = 20,
        search: Optional[str] = None,
        status_filter: Optional[EnrollmentStatus] = None,
        sort: RosterSortOrder = RosterSortOrder.NAME_ASC,
    ) -> RosterLocationResponse:
        course = await self.course_repo.get_by_id(course_id)
        if not course or course.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )

        if current_user.role == UserRole.SUPERADMIN:
            pass
        elif current_user.role == UserRole.MENTOR:
            if course.mentor_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to view enrollments for this course"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view course roster"
            )

        location = await self.enrollment_repo.get_roster_location(
            course_id=course_id,
            student_id=student_id,
            page_size=page_size,
            search=search,
            status=status_filter,
            sort=sort,
        )
        if not location:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student is not enrolled in this course"
            )

        enrollment = location.item
        student_user = enrollment.student
        formatted_item = CourseRosterItemResponse(
            id=enrollment.id,
            enrollment_id=enrollment.id,
            student_id=enrollment.student_id,
            course_id=enrollment.course_id,
            price_at_enrollment=enrollment.price_at_enrollment,
            color_hex=enrollment.color_hex,
            enrolled_at=enrollment.enrolled_at,
            status=enrollment.status,
            student=RosterStudentIdentity(
                id=student_user.id,
                first_name=student_user.first_name,
                last_name=student_user.last_name,
                email=student_user.email,
                phone=student_user.phone,
                photo_path=student_user.photo_path,
                thumbnail_path=student_user.thumbnail_path,
            ),
        )

        return RosterLocationResponse(
            student_id=location.student_id,
            enrollment_id=location.enrollment_id,
            page=location.page,
            index=location.index,
            total=location.total,
            item=formatted_item,
        )

    async def get_eligible_candidates(
        self,
        course_id: int,
        current_user: User,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
    ) -> PaginatedResponse[EligibleCandidateResponse]:
        if current_user.role != UserRole.SUPERADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only superadmins can view candidate eligibility"
            )

        course = await self.course_repo.get_by_id(course_id)
        if not course or course.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        if course.status != CourseStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Course is archived/inactive"
            )

        candidates_data = await self.enrollment_repo.get_eligible_candidates(
            course_id=course_id,
            page=page,
            page_size=page_size,
            search=search,
        )

        formatted_candidates = [
            EligibleCandidateResponse(
                id=u.id,
                first_name=u.first_name,
                last_name=u.last_name,
                email=u.email,
                phone=u.phone,
                photo_path=u.photo_path,
                thumbnail_path=u.thumbnail_path,
            )
            for u in candidates_data.items
        ]

        return PaginatedResponse[EligibleCandidateResponse](
            items=formatted_candidates,
            total=candidates_data.total,
            page=candidates_data.page,
            page_size=candidates_data.page_size,
            total_pages=candidates_data.total_pages,
        )
