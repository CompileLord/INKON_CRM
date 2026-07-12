from datetime import date, timedelta
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
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
    "#FF5733", "#33FF57", "#3357FF", "#F3FF33", "#FF33F3",
    "#33FFF0", "#FFAF33", "#AF33FF", "#33FFAF", "#FF3333",
    "#3399FF", "#99FF33", "#FF3399", "#33FF99", "#9933FF",
    "#FF9933", "#33FFCC", "#CC33FF", "#FF33CC", "#33CCFF"
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
            Enrollment.student_id == student_id,
            Enrollment.is_deleted == False
        )
        count_result = await self.db.execute(count_query)
        count_existing_enrollments = count_result.scalar() or 0
        color_hex = PALETTE[count_existing_enrollments % 20]

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

        for journal in journals:
            lesson_dates = get_lesson_dates(journal.period_start, journal.period_end, schedules)
            for l_date in lesson_dates:
                entry = JournalEntry(
                    journal_id=journal.id,
                    student_id=student_id,
                    lesson_date=l_date,
                    attendance=False,
                    score=0,
                    comment=None,
                    version=1
                )
                self.db.add(entry)

            summary = JournalStudentSummary(
                journal_id=journal.id,
                student_id=student_id,
                exam_score=0,
                bonus_score=0,
                sum_score=0,
                attendance_count=0,
                total_lessons=len(lesson_dates),
                version=1
            )
            self.db.add(summary)

        await self.db.flush()
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
