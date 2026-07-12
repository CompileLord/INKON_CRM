from datetime import datetime, timezone
from typing import Optional, List
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.course import Course, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.course_mentor_history import CourseMentorHistory
from app.models.journal import Journal
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.schemas.course import CourseCreate, CourseUpdate
from app.services.journal_generation_service import JournalGenerationService


class CourseService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.course_repo = SQLAlchemyCourseRepository(db)
        self.user_repo = SQLAlchemyUserRepository(db)

    async def create_course(self, data: CourseCreate, current_user: User) -> Course:
        if data.start_date >= data.end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Start date must be before end_date"
            )

        if not data.schedules:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one schedule item must be present"
            )

        mentor = await self.user_repo.get_by_id(data.mentor_id)
        if not mentor or mentor.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mentor not found"
            )

        course = Course(
            title=data.title,
            description=data.description,
            photo_path=data.photo_path,
            start_date=data.start_date,
            end_date=data.end_date,
            exam_type=data.exam_type,
            price=data.price,
            mentor_id=data.mentor_id,
            status=CourseStatus.ACTIVE
        )
        self.db.add(course)
        await self.db.flush()

        for sched in data.schedules:
            course_schedule = CourseSchedule(
                course_id=course.id,
                day_of_week=sched.day_of_week,
                time_start=sched.time_start,
                time_end=sched.time_end
            )
            self.db.add(course_schedule)
        await self.db.flush()

        journal_gen_service = JournalGenerationService(self.db)
        await journal_gen_service.generate_journals(course)

        history = CourseMentorHistory(
            course_id=course.id,
            mentor_id=course.mentor_id,
            assigned_from=datetime.now(timezone.utc),
            assigned_to=None
        )
        self.db.add(history)
        await self.db.flush()
        await self.db.refresh(course)

        return course

    async def update_course(self, course_id: int, data: CourseUpdate, current_user: User) -> Course:
        course = await self.course_repo.get_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )

        if data.start_date is not None or data.end_date is not None:
            journals_query = select(Journal).filter(Journal.course_id == course_id)
            journals_result = await self.db.execute(journals_query)
            if journals_result.scalars().first() is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot update dates because journals already exist for this course"
                )

        if data.mentor_id is not None and data.mentor_id != course.mentor_id:
            from app.services.audit_service import AuditService
            audit_service = AuditService(self.db)
            await audit_service.log(
                user_id=current_user.id,
                action="update",
                entity_type="course",
                entity_id=course.id,
                changes={"mentor_id": (course.mentor_id, data.mentor_id)}
            )

            new_mentor = await self.user_repo.get_by_id(data.mentor_id)
            if not new_mentor or new_mentor.is_deleted:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Mentor not found"
                )

            history_query = select(CourseMentorHistory).filter(
                CourseMentorHistory.course_id == course_id,
                CourseMentorHistory.assigned_to == None
            )
            history_result = await self.db.execute(history_query)
            current_history = history_result.scalars().first()
            now = datetime.now(timezone.utc)
            if current_history:
                current_history.assigned_to = now

            new_history = CourseMentorHistory(
                course_id=course_id,
                mentor_id=data.mentor_id,
                assigned_from=now,
                assigned_to=None
            )
            self.db.add(new_history)

        if data.title is not None:
            course.title = data.title
        if data.description is not None:
            course.description = data.description
        if data.photo_path is not None:
            course.photo_path = data.photo_path
        if data.start_date is not None:
            course.start_date = data.start_date
        if data.end_date is not None:
            course.end_date = data.end_date
        if data.mentor_id is not None:
            course.mentor_id = data.mentor_id
        if data.status is not None:
            course.status = data.status

        await self.course_repo.update(course)
        await self.db.refresh(course)
        return course

    async def delete_course(self, course_id: int) -> bool:
        course = await self.course_repo.get_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        return await self.course_repo.soft_delete(course_id)

    async def list_courses(
        self,
        filters: dict,
        page: int,
        page_size: int,
        current_user: User
    ) -> dict:
        query = select(Course).filter(Course.is_deleted == False)

        if current_user.role == UserRole.MENTOR:
            query = query.filter(Course.mentor_id == current_user.id)
        elif current_user.role == UserRole.STUDENT:
            query = query.join(Enrollment, Enrollment.course_id == Course.id).filter(
                Enrollment.student_id == current_user.id,
                Enrollment.is_deleted == False
            )

        status_filter = filters.get("status")
        if status_filter:
            query = query.filter(Course.status == status_filter)

        return await self.course_repo.get_paginated(query, page, page_size)

    async def copy_course(self, new_course_data: CourseCreate, source_course_id: int, current_user: User) -> Course:
        from app.models.enrollment import Enrollment, EnrollmentStatus
        from app.services.enrollment_service import EnrollmentService

        new_course = await self.create_course(new_course_data, current_user)

        enroll_query = select(Enrollment).filter(
            Enrollment.course_id == source_course_id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
            Enrollment.is_deleted == False
        )
        enroll_res = await self.db.execute(enroll_query)
        enrollments = enroll_res.scalars().all()

        enroll_service = EnrollmentService(self.db)
        for enrollment in enrollments:
            student_user = await self.user_repo.get_by_id(enrollment.student_id)
            if not student_user or student_user.is_deleted or student_user.role != UserRole.STUDENT:
                continue

            try:
                await enroll_service.enroll_student(
                    student_id=enrollment.student_id,
                    course_id=new_course.id,
                    current_user=current_user
                )
            except HTTPException:
                pass

        await self.db.refresh(new_course)
        return new_course

    async def get_mentor_history(self, course_id: int) -> List[CourseMentorHistory]:
        from sqlalchemy.orm import selectinload
        course = await self.course_repo.get_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )

        query = select(CourseMentorHistory).filter(
            CourseMentorHistory.course_id == course_id
        ).options(selectinload(CourseMentorHistory.mentor)).order_by(CourseMentorHistory.id.asc())
        res = await self.db.execute(query)
        return list(res.scalars().all())
