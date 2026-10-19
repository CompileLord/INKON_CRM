from app.services.journal_transaction import JournalCommandTransaction as JournalCommandTransaction
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy import select
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
from app.core.scoring import MAX_BONUS_SCORE, EXAM_MAX_SCORE_LIMIT


from app.services.journal_query_service import JournalQueryService, get_lesson_dates


class JournalService(JournalQueryService):
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

        if not entries_updates:
            return {"applied": [], "conflicts": [], "summaries": []}

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
                entry.attendance == target_attendance
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
                        "version": entry.version
                    }
                })
                continue

            changes = {}
            if entry.attendance != target_attendance:
                changes["attendance"] = (entry.attendance, target_attendance)
            if entry.score != update_item.score:
                changes["score"] = (entry.score, update_item.score)
            if entry.comment != update_item.comment:
                changes["comment"] = (entry.comment, update_item.comment)

            if changes:
                sanitized_comment: str | None = sanitize_html(update_item.comment) if update_item.comment is not None else None
                entry_values_changed: bool = (
                    entry.attendance != target_attendance
                    or entry.score != update_item.score
                    or entry.comment != sanitized_comment
                )
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

        if exam_score > journal.exam_max_score:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Exam score cannot exceed journal maximum of {journal.exam_max_score}"
            )

        if bonus_score > MAX_BONUS_SCORE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bonus score cannot exceed {MAX_BONUS_SCORE}"
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

        previous_exam_score: int = summary.exam_score
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
        exam_max_score: int,
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

        if not (0 <= exam_max_score <= EXAM_MAX_SCORE_LIMIT):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Exam max score must be between 0 and {EXAM_MAX_SCORE_LIMIT}"
            )

        higher_scores_query = select(JournalStudentSummary).filter(
            JournalStudentSummary.journal_id == journal_id,
            JournalStudentSummary.exam_score > exam_max_score
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
                detail=f"Cannot lower exam max score to {exam_max_score}: student(s) {', '.join(student_names)} already have higher exam scores"
            )

        old_exam_max_score = journal.exam_max_score
        journal.exam_max_score = exam_max_score

        sum_service = SumCalculationService(self.db)
        await sum_service.recalculate_journal(journal_id)

        from app.services.audit_service import AuditService
        audit_service = AuditService(self.db)
        await audit_service.log(
            user_id=current_user.id,
            action="update",
            entity_type="journal",
            entity_id=journal.id,
            changes={"exam_max_score": (old_exam_max_score, exam_max_score)}
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
