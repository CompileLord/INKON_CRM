from datetime import datetime, timezone
from typing import Optional, List
from fastapi import HTTPException, status, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.school_calendar import SchoolCalendar
from app.core.schedule_utils import CourseCopyBudgetExceeded, CourseCopyPlan, EnrollmentLessonPlan
from app.repositories.interfaces.course_repository import CourseJournalProgress, CourseRepository
from app.repositories.interfaces.user_repository import UserRepository
from app.models.course import Course, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.course_mentor_history import CourseMentorHistory
from app.models.journal import Journal
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.schemas.course_list import CourseSortOrder
from app.schemas.course import (
    CourseCreate,
    CourseListItemResponse,
    CourseResponse,
    CourseScheduleResponse,
    CourseScheduleTimeUpdate,
    CourseUpdate,
)
from app.services.audit_service import AuditService
from app.services.journal_generation_service import JournalGenerationService
from app.services.storage_lifecycle_service import StorageLifecycleService
from app.services.storage_service import StorageService, get_storage_service
from app.services.bounded_upload_reader import BoundedUploadReader


class CourseService:
    def __init__(
        self, db: AsyncSession, storage: StorageService | None = None,
        course_repo: CourseRepository | None = None, user_repo: UserRepository | None = None,
    ) -> None:
        self.db: AsyncSession = db
        self.course_repo: CourseRepository = course_repo or SQLAlchemyCourseRepository(db)
        self.user_repo: UserRepository = user_repo or SQLAlchemyUserRepository(db)
        self.storage_service: StorageService = storage or get_storage_service()

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
        await AuditService(self.db).log_change(
            current_user.id, "create", "course", course.id, course.title, set(data.model_dump()),
        )
        await self.db.refresh(course)

        return course

    async def update_course(self, course_id: int, data: CourseUpdate, current_user: User) -> Course:
        course = await self.course_repo.get_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )

        audited_fields: set[str] = {"title", "description", "price", "start_date", "end_date", "status", "mentor_id"}
        previous_values: dict[str, object] = {field: getattr(course, field) for field in audited_fields}
        schedule_changes: dict[str, tuple[object, object]] = {}
        if "schedules" in data.model_fields_set:
            schedules: list[CourseSchedule] = await self.course_repo.get_course_schedules(course_id)
            schedules_by_weekday: dict[int, CourseSchedule] = {schedule.day_of_week: schedule for schedule in schedules}
            requested_weekdays: list[int] = [schedule.day_of_week for schedule in data.schedules]
            if len(requested_weekdays) != len(schedules_by_weekday) or set(requested_weekdays) != set(schedules_by_weekday):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "schedule_weekdays_immutable"})
            requested_schedule: CourseScheduleTimeUpdate
            for requested_schedule in data.schedules:
                existing_schedule: CourseSchedule = schedules_by_weekday[requested_schedule.day_of_week]
                field_name: str
                for field_name in ("time_start", "time_end"):
                    old_value: object = getattr(existing_schedule, field_name)
                    new_value: object = getattr(requested_schedule, field_name)
                    if old_value != new_value:
                        schedule_changes[f"schedules.{requested_schedule.day_of_week}.{field_name}"] = (old_value, new_value)
                        setattr(existing_schedule, field_name, new_value)
        if data.start_date is not None or data.end_date is not None:
            journals_query = select(Journal).filter(Journal.course_id == course_id)
            journals_result = await self.db.execute(journals_query)
            if journals_result.scalars().first() is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot update dates because journals already exist for this course"
                )

        if data.mentor_id is not None and data.mentor_id != course.mentor_id:
            new_mentor = await self.user_repo.get_by_id(data.mentor_id)
            if not new_mentor or new_mentor.is_deleted:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Mentor not found"
                )

            history_query = select(CourseMentorHistory).filter(
                CourseMentorHistory.course_id == course_id,
                CourseMentorHistory.assigned_to.is_(None)
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
        if data.start_date is not None:
            course.start_date = data.start_date
        if data.end_date is not None:
            course.end_date = data.end_date
        if data.mentor_id is not None:
            course.mentor_id = data.mentor_id
        if data.status is not None:
            course.status = data.status

        await self.course_repo.update(course)
        await AuditService(self.db).log_change(
            current_user.id, "update", "course", course.id, course.title,
            {**{field: (previous_values[field], getattr(course, field)) for field in previous_values if previous_values[field] != getattr(course, field)}, **schedule_changes},
        )
        await self.db.refresh(course)
        return course

    async def upload_course_image(self, course_id: int, file: UploadFile) -> Course:
        from PIL import Image
        import io
        course: Course | None = await self.course_repo.get_by_id_for_update(course_id)
        if not course or course.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )

        content: bytes = await BoundedUploadReader().read(
            file, 5 * 1024 * 1024, "Image size exceeds the 5MB limit"
        )
        try:
            image: Image.Image = Image.open(io.BytesIO(content))
            image.verify()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid image file"
            )

        image = Image.open(io.BytesIO(content))
        if image.format not in ["PNG", "JPEG", "WEBP"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported image format. PNG, JPEG or WEBP only."
            )

        lifecycle: StorageLifecycleService = StorageLifecycleService(self.db, self.storage_service)
        old_photo: str | None = course.photo_path

        ext: str = image.format.lower()
        if ext == "jpeg":
            ext = "jpg"
        filename: str = f"course_image.{ext}"
        new_path: str
        intent_id: str
        new_path, intent_id = await lifecycle.stage(content, "course", course_id, filename)

        course.photo_path = new_path
        updated_course: Course = await self.course_repo.update(course)
        await lifecycle.adopt(intent_id)
        await lifecycle.delete_after_commit(old_photo)
        await self.db.refresh(updated_course)
        return updated_course

    async def delete_course(self, course_id: int, actor_id: int | None = None) -> bool:
        course = await self.course_repo.get_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        deleted: bool = await self.course_repo.soft_delete(course_id)
        if deleted:
            await AuditService(self.db).log_change(
                actor_id, "delete", "course", course.id, course.title, {"is_deleted"},
            )
        return deleted

    async def list_courses(
        self,
        filters: dict,
        page: int,
        page_size: int,
        current_user: User,
        search: str | None = None,
        sort: CourseSortOrder = CourseSortOrder.CREATED_AT_DESC,
    ) -> dict:
        page_result: dict = await self.course_repo.get_courses_page(
            filters, page, page_size, current_user.id, current_user.role, search, sort,
        )
        courses: List[Course] = page_result["items"]
        student_counts: dict[int, int] = await self.course_repo.count_active_students_by_course(
            [course.id for course in courses]
        )
        journal_progress: dict[int, CourseJournalProgress] = await self.course_repo.get_journal_progress(
            [course.id for course in courses], SchoolCalendar.today(),
        )
        page_result["items"] = [
            CourseListItemResponse(
                **CourseResponse.model_validate(course, from_attributes=True).model_dump(),
                schedules=[
                    CourseScheduleResponse.model_validate(schedule, from_attributes=True)
                    for schedule in course.schedules
                ],
                active_student_count=student_counts.get(course.id, 0),
                **vars(journal_progress.get(course.id, CourseJournalProgress(None, None, 0))),
            )
            for course in courses
        ]
        return page_result

    async def copy_course(self, new_course_data: CourseCreate, source_course_id: int, current_user: User) -> Course:
        from app.services.enrollment_service import EnrollmentService

        source_course: Course | None = await self.course_repo.get_by_id(source_course_id)
        if source_course is None or source_course.is_deleted:
            raise HTTPException(status_code=404, detail="Course not found")
        enrollments: list[Enrollment] = await self.course_repo.get_copy_source_enrollments(
            source_course_id, CourseCopyPlan.maximum_enrollments + 1,
        )
        try:
            copy_plan: CourseCopyPlan = CourseCopyPlan.build(new_course_data, len(enrollments))
        except CourseCopyBudgetExceeded as budget_error:
            raise HTTPException(status_code=422, detail=str(budget_error)) from budget_error
        new_course: Course = await self.create_course(new_course_data, current_user)
        journals: list[Journal] = await self.course_repo.get_course_journals(new_course.id)
        lesson_plan: EnrollmentLessonPlan = EnrollmentLessonPlan.build(new_course.id, journals, copy_plan.lesson_dates)
        enrollment_service: EnrollmentService = EnrollmentService(
            self.db, course_repo=self.course_repo, user_repo=self.user_repo,
        )
        for enrollment in enrollments:
            student_user: User | None = await self.user_repo.get_by_id(enrollment.student_id)
            if student_user is None or student_user.is_deleted or student_user.role != UserRole.STUDENT:
                continue
            await enrollment_service.enroll_student(
                student_id=enrollment.student_id, course_id=new_course.id,
                current_user=current_user, lesson_plan=lesson_plan,
            )
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
