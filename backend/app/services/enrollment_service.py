from datetime import date, timedelta
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.scoring import max_period_score
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
from app.repositories.interfaces.enrollment_repository import EnrollmentRepository
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


def get_lesson_dates(period_start: date, period_end: date, schedules: List[CourseSchedule]) -> List[date]:
    schedule_weekdays = {s.day_of_week for s in schedules}
    lesson_dates = []
    curr = period_start
    while curr <= period_end:
        if curr.weekday() in schedule_weekdays:
            lesson_dates.append(curr)
        curr += timedelta(days=1)
    return lesson_dates


class EnrollmentService:
    def __init__(
        self,
        db: AsyncSession,
        enrollment_repo: Optional[EnrollmentRepository] = None,
        course_repo: Optional[CourseRepository] = None,
        user_repo: Optional[UserRepository] = None,
        conflict_classifier: Optional[EnrollmentConflictClassifier] = None,
    ) -> None:
        self.db = db
        self.enrollment_repo: EnrollmentRepository = enrollment_repo or SQLAlchemyEnrollmentRepository(db)
        self.course_repo: CourseRepository = course_repo or SQLAlchemyCourseRepository(db)
        self.user_repo: UserRepository = user_repo or SQLAlchemyUserRepository(db)
        self.conflict_classifier: EnrollmentConflictClassifier = conflict_classifier or EnrollmentConflictClassifier()

    async def enroll_student(self, student_id: int, course_id: int, current_user: User) -> Enrollment:
        course = await self.course_repo.get_by_id(course_id)
        if not course or course.is_deleted or course.status != CourseStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Course is archived/inactive"
            )

        student = await self.user_repo.get_by_id(student_id)
        if not student or student.is_deleted or student.role != UserRole.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student deactivated/inactive"
            )

        existing_enrollment_query = select(Enrollment).filter(
            Enrollment.student_id == student_id,
            Enrollment.course_id == course_id,
            Enrollment.is_deleted == False
        )
        existing_result = await self.db.execute(existing_enrollment_query)
        if existing_result.scalars().first() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Student is already enrolled in this course"
            )

        count_query = select(func.count(Enrollment.id)).filter(
            Enrollment.course_id == course_id,
            Enrollment.is_deleted == False
        )
        count_result = await self.db.execute(count_query)
        count_existing_enrollments = count_result.scalar() or 0
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

        schedules_query = select(CourseSchedule).filter(CourseSchedule.course_id == course_id)
        schedules_result = await self.db.execute(schedules_query)
        schedules = list(schedules_result.scalars().all())

        journals_query = select(Journal).filter(Journal.course_id == course_id)
        journals_result = await self.db.execute(journals_query)
        journals = list(journals_result.scalars().all())

        entries_to_add = []
        summaries_to_add = []
        for journal in journals:
            lesson_dates = get_lesson_dates(journal.period_start, journal.period_end, schedules)
            for l_date in lesson_dates:
                entries_to_add.append(JournalEntry(
                    journal_id=journal.id,
                    student_id=student_id,
                    lesson_date=l_date,
                    attendance=False,
                    score=0,
                    comment=None,
                    version=1
                ))

            summaries_to_add.append(JournalStudentSummary(
                journal_id=journal.id,
                student_id=student_id,
                homework_score=0,
                attendance_score=0,
                exam_score=0,
                bonus_score=0,
                sum_score=0,
                max_period_score=max_period_score(len(lesson_dates), journal.exam_max_score),
                attendance_count=0,
                total_lessons=len(lesson_dates),
                version=1
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

        from app.services.finance_service import FinanceService
        finance_service = FinanceService(self.db)
        await finance_service.generate_schedule_for_enrollment(enrollment.id)

        await self.db.refresh(enrollment)
        return enrollment

    async def withdraw_student(self, enrollment_id: int) -> Enrollment:
        enrollment = await self.enrollment_repo.get_by_id(enrollment_id)
        if not enrollment or enrollment.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Enrollment not found"
            )
        enrollment.status = EnrollmentStatus.WITHDRAWN
        await self.enrollment_repo.update(enrollment)

        from app.models.charge import Charge, ChargeStatus
        from app.services.finance_service import get_dushanbe_today
        today = get_dushanbe_today()
        cancel_q = select(Charge).filter(
            Charge.enrollment_id == enrollment_id,
            Charge.due_date > today,
            Charge.status == ChargeStatus.OPEN,
            Charge.is_deleted == False
        )
        c_res = await self.db.execute(cancel_q)
        future_charges = list(c_res.scalars().all())
        for fc in future_charges:
            fc.status = ChargeStatus.CANCELLED

        await self.db.refresh(enrollment)
        return enrollment

    async def list_enrollments(
        self,
        filters: dict,
        page: int,
        page_size: int
    ) -> dict:
        query = select(Enrollment).filter(Enrollment.is_deleted == False)
        if "course_id" in filters and filters["course_id"] is not None:
            query = query.filter(Enrollment.course_id == filters["course_id"])
        if "student_id" in filters and filters["student_id"] is not None:
            query = query.filter(Enrollment.student_id == filters["student_id"])
        if "mentor_id" in filters and filters["mentor_id"] is not None:
            query = query.join(Course, Enrollment.course_id == Course.id).filter(Course.mentor_id == filters["mentor_id"])
        return await self.enrollment_repo.get_paginated(query, page, page_size)

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
