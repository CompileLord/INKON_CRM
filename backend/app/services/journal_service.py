from app.services.journal_transaction import JournalCommandTransaction as JournalCommandTransaction
from datetime import date, datetime, timezone
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy import select, or_, false
from sqlalchemy.orm.exc import StaleDataError as StaleObjectError
from app.db.session import sanitize_html
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.course import Course, CourseStatus
from app.models.user import User, UserRole
from app.core.config import settings
from app.repositories.sqlalchemy.exam_result_notification_repository import SQLAlchemyExamResultNotificationRepository
from app.services.exam_result_scheduling_service import ExamResultSchedulingService
from app.services.sum_calculation_service import SumCalculationService
from app.core.scoring import ScoringPolicy
from app.core.school_calendar import SchoolCalendar
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.course_schedule import CourseSchedule


from app.services.journal_query_service import JournalQueryService, get_lesson_dates


class JournalService(JournalQueryService):
    async def reject_invalid_cells(self, journal: Journal, entries_updates: list) -> None:
        schedules_result = await self.db.execute(select(CourseSchedule).filter(CourseSchedule.course_id == journal.course_id))
        lesson_dates: set[date] = set(get_lesson_dates(journal.period_start, journal.period_end, list(schedules_result.scalars().all())))
        requested_student_ids: set[int] = {update.student_id for update in entries_updates}
        known_result = await self.db.execute(select(User.id).filter(User.id.in_(requested_student_ids)))
        known_student_ids: set[int] = set(known_result.scalars().all())
        enrolled_result = await self.db.execute(select(Enrollment.student_id).filter(
            Enrollment.course_id == journal.course_id,
            Enrollment.student_id.in_(requested_student_ids),
            Enrollment.is_deleted.is_(False),
            Enrollment.status == EnrollmentStatus.ACTIVE,
        ))
        enrolled_student_ids: set[int] = set(enrolled_result.scalars().all())
        today: date = SchoolCalendar.today()
        rejected_cells: list[dict] = []
        for update in entries_updates:
            code: str | None = None
            if update.student_id not in known_student_ids:
                code = "unknown_student"
            elif update.student_id not in enrolled_student_ids:
                code = "student_not_enrolled"
            elif update.lesson_date not in lesson_dates:
                code = "invalid_lesson_date"
            elif update.lesson_date > today:
                code = "future_lesson"
            if code is not None:
                rejected_cells.append({"student_id": update.student_id, "lesson_date": update.lesson_date.isoformat(), "code": code})
        if rejected_cells:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "code": rejected_cells[0]["code"],
                    "message": "Some journal cells cannot be updated",
                    "cells": rejected_cells,
                },
            )

    @staticmethod
    def authorize_mutation(course: Course, current_user: User) -> None:
        if current_user.role == UserRole.SUPERADMIN:
            return
        if current_user.role != UserRole.MENTOR or course.mentor_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
        if course.status == CourseStatus.ARCHIVED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot update archived course")

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

        self.authorize_mutation(course, current_user)

        if not entries_updates:
            return {"applied": [], "conflicts": [], "summaries": []}

        await self.reject_invalid_cells(journal, entries_updates)

        student_ids = list(set(u.student_id for u in entries_updates))
        dates = list(set(u.lesson_date for u in entries_updates))

        entry_query = select(JournalEntry).filter(
            JournalEntry.journal_id == journal_id,
            JournalEntry.student_id.in_(student_ids),
            JournalEntry.lesson_date.in_(dates)
        )
        entry_result = await self.db.execute(entry_query)
        entries = list(entry_result.scalars().all())
        entries_map = {(e.student_id, e.lesson_date): e for e in entries}

        from app.services.audit_service import AuditService
        audit_service = AuditService(self.db)

        applied_entries = []
        conflicts = []
        updated_student_ids = set()

        for update_item in entries_updates:
            entry = entries_map.get((update_item.student_id, update_item.lesson_date))
            if not entry:
                conflicts.append({
                    "student_id": update_item.student_id,
                    "lesson_date": update_item.lesson_date,
                    "submitted_version": update_item.version,
                    "current": None
                })
                continue

            target_attendance = True if update_item.score > 0 else update_item.attendance

            if (
                entry.is_graded is True
                and entry.attendance == target_attendance
                and entry.score == update_item.score
                and entry.comment == update_item.comment
            ):
                applied_entries.append(entry)
                continue

            if entry.version != update_item.version:
                conflicts.append({
                    "student_id": update_item.student_id,
                    "lesson_date": update_item.lesson_date,
                    "submitted_version": update_item.version,
                    "current": {
                        "student_id": entry.student_id,
                        "lesson_date": entry.lesson_date,
                        "attendance": entry.attendance,
                        "score": entry.score,
                        "comment": entry.comment,
                        "is_graded": entry.is_graded is True,
                        "version": entry.version
                    }
                })
                continue

            changes = {}
            if entry.is_graded is not True:
                changes["is_graded"] = (entry.is_graded, True)
            if entry.attendance != target_attendance:
                changes["attendance"] = (entry.attendance, target_attendance)
            if entry.score != update_item.score:
                changes["score"] = (entry.score, update_item.score)
            if entry.comment != update_item.comment:
                changes["comment"] = (entry.comment, update_item.comment)

            if changes:
                sanitized_comment: str | None = sanitize_html(update_item.comment) if update_item.comment is not None else None
                entry_values_changed: bool = (
                    entry.is_graded is not True
                    or entry.attendance != target_attendance
                    or entry.score != update_item.score
                    or entry.comment != sanitized_comment
                )
                entry.is_graded = True
                entry.attendance = target_attendance
                entry.score = update_item.score
                entry.comment = sanitized_comment
                if entry_values_changed:
                    entry.version += 1

                await audit_service.log(
                    user_id=current_user.id,
                    action="update",
                    entity_type="journal_entry",
                    entity_id=entry.id,
                    changes=changes
                )

            updated_student_ids.add(update_item.student_id)
            applied_entries.append(entry)

        if conflicts and not applied_entries:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Conflict: The journal entries have been updated by another user. Please refresh and try again."
            )

        if updated_student_ids:
            await self.db.flush()

        if updated_student_ids:
            sum_service = SumCalculationService(self.db)
            await sum_service.recalculate_journal(journal_id, updated_student_ids)

        summaries_query = select(JournalStudentSummary).filter(
            JournalStudentSummary.journal_id == journal_id,
            JournalStudentSummary.student_id.in_(student_ids)
        )
        summaries_result = await self.db.execute(summaries_query)
        summaries_list = list(summaries_result.scalars().all())

        applied_data = [
            {
                "student_id": e.student_id,
                "lesson_date": e.lesson_date,
                "attendance": e.attendance,
                "score": e.score,
                "comment": e.comment,
                "is_graded": e.is_graded is True,
                "version": e.version
            }
            for e in applied_entries
        ]

        return {
            "applied": applied_data,
            "conflicts": conflicts,
            "summaries": summaries_list
        }

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

        self.authorize_mutation(course, current_user)

        if exam_score < 0 or bonus_score < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Scores cannot be negative"
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

        if exam_score > journal.exam_max_score:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "code": "exam_exceeds_maximum",
                    "message": f"Exam score cannot exceed journal maximum of {journal.exam_max_score}",
                    "maximum": journal.exam_max_score,
                }
            )

        bonus_maximum: int = ScoringPolicy.resolve_bonus_max_score(journal.bonus_max_score)
        if bonus_score > bonus_maximum and bonus_score != summary.bonus_score:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "code": "bonus_exceeds_maximum",
                    "message": f"Bonus score cannot exceed journal maximum of {bonus_maximum}",
                    "maximum": bonus_maximum,
                }
            )

        previous_exam_score: int = summary.exam_score
        previous_bonus_score: int = summary.bonus_score
        previous_grading: bool | None = summary.is_graded
        summary.is_graded = True
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

        from app.services.audit_service import AuditService
        grading_changes: dict[str, tuple[object, object]] = {}
        if previous_grading is not True:
            grading_changes["is_graded"] = (previous_grading, True)
        if previous_exam_score != exam_score:
            grading_changes["exam_score"] = (previous_exam_score, exam_score)
        if previous_bonus_score != bonus_score:
            grading_changes["bonus_score"] = (previous_bonus_score, bonus_score)
        await AuditService(self.db).log(current_user.id, "update", "journal_student_summary", summary.id, grading_changes)
        sum_service = SumCalculationService(self.db)
        await sum_service.recalculate(journal_id, student_id)

        scheduling_service: ExamResultSchedulingService = ExamResultSchedulingService(
            SQLAlchemyExamResultNotificationRepository(self.db),
            settings.EXAM_RESULT_NOTIFICATION_DELAY_SECONDS,
        )
        await scheduling_service.register_exam_score_edit(
            student_id,
            journal_id,
            previous_exam_score,
            exam_score,
            datetime.now(timezone.utc),
        )

        await self.db.refresh(summary)
        return summary

    async def update_exam_max_score(
        self,
        journal_id: int,
        exam_max_score: Optional[int],
        bonus_max_score: Optional[int],
        current_user: User
    ) -> dict:
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

        self.authorize_mutation(course, current_user)

        old_exam_max_score: int = journal.exam_max_score
        old_bonus_max_score: int = ScoringPolicy.resolve_bonus_max_score(journal.bonus_max_score)
        new_exam_max_score: int = old_exam_max_score if exam_max_score is None else exam_max_score
        new_bonus_max_score: int = old_bonus_max_score if bonus_max_score is None else bonus_max_score

        if not (0 <= new_exam_max_score <= ScoringPolicy.EXAM_MAX_SCORE_LIMIT):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Exam max score must be between 0 and {ScoringPolicy.EXAM_MAX_SCORE_LIMIT}"
            )

        if not (0 <= new_bonus_max_score <= ScoringPolicy.BONUS_MAX_SCORE_LIMIT):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bonus max score must be between 0 and {ScoringPolicy.BONUS_MAX_SCORE_LIMIT}"
            )

        higher_scores_query = select(JournalStudentSummary).filter(
            JournalStudentSummary.journal_id == journal_id,
            or_(
                JournalStudentSummary.exam_score > new_exam_max_score if new_exam_max_score != old_exam_max_score else false(),
                JournalStudentSummary.bonus_score > new_bonus_max_score if new_bonus_max_score != old_bonus_max_score else false(),
            )
        )
        higher_result = await self.db.execute(higher_scores_query)
        higher_summaries = list(higher_result.scalars().all())

        if higher_summaries:
            student_ids = [s.student_id for s in higher_summaries]
            users_result = await self.db.execute(select(User).filter(User.id.in_(student_ids)))
            users = list(users_result.scalars().all())
            student_names = [f"{u.first_name} {u.last_name}" for u in users]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot lower the maximum to exam {new_exam_max_score} / bonus {new_bonus_max_score}: student(s) {', '.join(student_names)} already have higher scores"
            )

        journal.exam_max_score = new_exam_max_score
        journal.bonus_max_score = new_bonus_max_score

        sum_service = SumCalculationService(self.db)
        await sum_service.recalculate_journal(journal_id)

        from app.services.audit_service import AuditService
        audit_service = AuditService(self.db)
        await audit_service.log(
            user_id=current_user.id,
            action="update",
            entity_type="journal",
            entity_id=journal.id,
            changes={
                "exam_max_score": (old_exam_max_score, new_exam_max_score),
                "bonus_max_score": (old_bonus_max_score, new_bonus_max_score),
            }
        )

        await self.db.flush()
        await self.db.refresh(journal)

        summaries_query = select(JournalStudentSummary).filter(
            JournalStudentSummary.journal_id == journal_id
        )
        summaries_result = await self.db.execute(summaries_query)
        summaries = list(summaries_result.scalars().all())

        return {
            "journal": journal,
            "summaries": summaries
        }
