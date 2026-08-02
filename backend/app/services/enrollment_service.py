from datetime import date, timedelta
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.scoring import max_period_score
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.course import Course, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.enrollment_repository import SQLAlchemyEnrollmentRepository
from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository

PALETTE: List[str] = [
    "#E53E3E", "#319795", "#3182CE", "#D69E2E", "#D53F8C",
    "#805AD5", "#DD6B20", "#38A169", "#00B5D8", "#B83280",
    "#4C51BF", "#C05621", "#2B6CB0", "#2F855A", "#9B2C2C",
    "#2C7A7B", "#6B46C1", "#975A16", "#702459", "#1A365D"
]


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
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.enrollment_repo = SQLAlchemyEnrollmentRepository(db)
        self.course_repo = SQLAlchemyCourseRepository(db)
        self.user_repo = SQLAlchemyUserRepository(db)

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
        self.db.add(enrollment)
        await self.db.flush()

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

        self.db.add_all(entries_to_add)
        self.db.add_all(summaries_to_add)

        await self.db.flush()

        # Generate financial charge schedule for enrollment
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

        # Cancel unbilled future open charges upon withdrawal. Charges already
        # due stay as debt.
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
        return await self.enrollment_repo.get_paginated(query, page, page_size)
