from datetime import date, timedelta
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError as StaleObjectError
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.course import Course, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.services.sum_calculation_service import SumCalculationService


def get_lesson_dates(period_start: date, period_end: date, schedules: List[CourseSchedule]) -> List[date]:
    schedule_weekdays = {s.day_of_week for s in schedules}
    lesson_dates = []
    curr = period_start
    while curr <= period_end:
        if curr.weekday() in schedule_weekdays:
            lesson_dates.append(curr)
        curr += timedelta(days=1)
    return lesson_dates


class JournalService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_journal(self, journal_id: int, current_user: User) -> dict:
        journal = await self.db.get(Journal, journal_id)
        if not journal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Journal not found"
            )

        course_query = select(Course).filter(Course.id == journal.course_id)
        course_result = await self.db.execute(course_query)
        course = course_result.scalars().first()
        if not course:
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
                    detail="Not enough permissions"
                )
        elif current_user.role == UserRole.STUDENT:
            enrollment_query = select(Enrollment).filter(
                Enrollment.course_id == course.id,
                Enrollment.student_id == current_user.id,
                Enrollment.is_deleted == False
            )
            enrollment_result = await self.db.execute(enrollment_query)
            if enrollment_result.scalars().first() is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not enough permissions"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )

        schedules_query = select(CourseSchedule).filter(CourseSchedule.course_id == course.id)
        schedules_result = await self.db.execute(schedules_query)
        schedules = list(schedules_result.scalars().all())

        lesson_dates = get_lesson_dates(journal.period_start, journal.period_end, schedules)

        if current_user.role == UserRole.STUDENT:
            students_query = select(User, Enrollment.color_hex).join(Enrollment, Enrollment.student_id == User.id).filter(
                User.id == current_user.id,
                Enrollment.course_id == course.id,
                Enrollment.is_deleted == False
            )
        else:
            students_query = select(User, Enrollment.color_hex).join(Enrollment, Enrollment.student_id == User.id).filter(
                Enrollment.course_id == course.id,
                Enrollment.is_deleted == False
            )
        students_result = await self.db.execute(students_query)
        students_list = list(students_result.all())

        students_data = []
        for s_user, color_hex in students_list:
            entries_query = select(JournalEntry).filter(
                JournalEntry.journal_id == journal_id,
                JournalEntry.student_id == s_user.id
            ).order_by(JournalEntry.lesson_date)
            entries_result = await self.db.execute(entries_query)
            entries = list(entries_result.scalars().all())

            entries_data = []
            for entry in entries:
                entries_data.append({
                    "id": entry.id,
                    "lesson_date": entry.lesson_date,
                    "attendance": entry.attendance,
                    "score": entry.score,
                    "comment": entry.comment,
                    "has_comment": entry.comment is not None and len(entry.comment.strip()) > 0,
                    "version": entry.version
                })

            summary_query = select(JournalStudentSummary).filter(
                JournalStudentSummary.journal_id == journal_id,
                JournalStudentSummary.student_id == s_user.id
            )
            summary_result = await self.db.execute(summary_query)
            summary = summary_result.scalars().first()

            summary_data = None
            if summary:
                summary_data = {
                    "id": summary.id,
                    "exam_score": summary.exam_score,
                    "bonus_score": summary.bonus_score,
                    "sum_score": summary.sum_score,
                    "attendance_count": summary.attendance_count,
                    "total_lessons": summary.total_lessons,
                    "version": summary.version
                }

            students_data.append({
                "student_id": s_user.id,
                "first_name": s_user.first_name,
                "last_name": s_user.last_name,
                "email": s_user.email,
                "color_hex": color_hex,
                "entries": entries_data,
                "summary": summary_data
            })

        return {
            "journal_id": journal.id,
            "course_id": journal.course_id,
            "period_label": journal.period_label,
            "period_start": journal.period_start,
            "period_end": journal.period_end,
            "period_type": journal.period_type,
            "lesson_dates": lesson_dates,
            "students": students_data
        }

    async def batch_update_entries(self, journal_id: int, entries_updates: list, current_user: User) -> dict:
        journal = await self.db.get(Journal, journal_id)
        if not journal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Journal not found"
            )

        course_query = select(Course).filter(Course.id == journal.course_id)
        course_result = await self.db.execute(course_query)
        course = course_result.scalars().first()
        if not course:
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
                    detail="Not enough permissions"
                )
            if course.status == CourseStatus.ARCHIVED:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot update archived course"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )

        updated_student_ids = set()
        for update_item in entries_updates:
            if not (0 <= update_item.score <= 5):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Score must be between 0 and 5"
                )

            entry_query = select(JournalEntry).filter(
                JournalEntry.journal_id == journal_id,
                JournalEntry.student_id == update_item.student_id,
                JournalEntry.lesson_date == update_item.lesson_date
            )
            entry_result = await self.db.execute(entry_query)
            entry = entry_result.scalars().first()
            if not entry:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Journal entry not found"
                )

            if entry.version != update_item.version:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Conflict: The journal entries have been updated by another user. Please refresh and try again."
                )

            changes = {}
            if entry.attendance != update_item.attendance:
                changes["attendance"] = (entry.attendance, update_item.attendance)
            if entry.score != update_item.score:
                changes["score"] = (entry.score, update_item.score)
            if entry.comment != update_item.comment:
                changes["comment"] = (entry.comment, update_item.comment)

            entry.attendance = update_item.attendance
            entry.score = update_item.score
            entry.comment = update_item.comment
            updated_student_ids.add(update_item.student_id)

            if changes:
                from app.services.audit_service import AuditService
                audit_service = AuditService(self.db)
                await audit_service.log(
                    user_id=current_user.id,
                    action="update",
                    entity_type="journal_entry",
                    entity_id=entry.id,
                    changes=changes
                )

        try:
            await self.db.flush()
        except StaleObjectError:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Conflict: The journal entries have been updated by another user. Please refresh and try again."
            )

        sum_service = SumCalculationService(self.db)
        for s_id in updated_student_ids:
            await sum_service.recalculate(journal_id, s_id)

        return {"status": "success"}

    async def update_exam_or_bonus(
        self,
        journal_id: int,
        student_id: int,
        exam_score: int,
        bonus_score: int,
        version: int,
        current_user: User
    ) -> JournalStudentSummary:
        journal = await self.db.get(Journal, journal_id)
        if not journal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Journal not found"
            )

        course_query = select(Course).filter(Course.id == journal.course_id)
        course_result = await self.db.execute(course_query)
        course = course_result.scalars().first()
        if not course:
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
                    detail="Not enough permissions"
                )
            if course.status == CourseStatus.ARCHIVED:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot update archived course"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )

        if exam_score < 0 or bonus_score < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Scores cannot be negative"
            )

        if exam_score + bonus_score > 500:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Combined exam and bonus score cannot exceed 500"
            )

        summary_query = select(JournalStudentSummary).filter(
            JournalStudentSummary.journal_id == journal_id,
            JournalStudentSummary.student_id == student_id
        )
        summary_result = await self.db.execute(summary_query)
        summary = summary_result.scalars().first()
        if not summary:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student summary not found"
            )

        if summary.version != version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Conflict: The summary has been updated by another user. Please refresh and try again."
            )

        summary.exam_score = exam_score
        summary.bonus_score = bonus_score

        try:
            await self.db.flush()
        except StaleObjectError:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Conflict: The summary has been updated by another user. Please refresh and try again."
            )

        sum_service = SumCalculationService(self.db)
        await sum_service.recalculate(journal_id, student_id)

        # Enqueue arq task for exam result notification
        from arq import create_pool
        from arq.connections import RedisSettings
        from app.core.config import settings

        if not settings.TESTING:
            try:
                redis_settings = RedisSettings(host=settings.REDIS_HOST, port=settings.REDIS_PORT)
                pool = await create_pool(redis_settings)
                await pool.enqueue_job("send_exam_result_notification_task", student_id, journal_id)
            except Exception:
                pass

        await self.db.refresh(summary)
        return summary
