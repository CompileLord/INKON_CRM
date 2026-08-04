from collections import defaultdict
from datetime import date, timedelta
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, func, case
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
from app.core.scoring import MAX_BONUS_SCORE, EXAM_MAX_SCORE_LIMIT, score_percentage
from app.schemas.journal import JournalResponse, CourseJournalMetricsResponse, GradingQueueItemResponse


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

    async def get_course_journals_aggregated(self, course_id: int) -> List[JournalResponse]:
        journals_stmt = select(Journal).filter(Journal.course_id == course_id).order_by(Journal.period_start.asc())
        journals_res = await self.db.execute(journals_stmt)
        journals = list(journals_res.scalars().all())
        if not journals:
            return []

        schedules_stmt = select(CourseSchedule).filter(CourseSchedule.course_id == course_id)
        schedules_res = await self.db.execute(schedules_stmt)
        schedules = list(schedules_res.scalars().all())

        enrolled_count_stmt = select(func.count(Enrollment.id)).filter(
            Enrollment.course_id == course_id,
            Enrollment.is_deleted == False
        )
        enrolled_res = await self.db.execute(enrolled_count_stmt)
        student_count = enrolled_res.scalar() or 0

        journal_ids = [j.id for j in journals]

        entry_counts_stmt = select(
            JournalEntry.journal_id,
            func.count(JournalEntry.id)
        ).filter(
            JournalEntry.journal_id.in_(journal_ids)
        ).group_by(JournalEntry.journal_id)
        entry_counts_res = await self.db.execute(entry_counts_stmt)
        entry_counts_map = dict(entry_counts_res.all())

        pct_expr = case((JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score), else_=0.0)

        summary_avg_stmt = select(
            JournalStudentSummary.journal_id,
            func.avg(pct_expr)
        ).filter(
            JournalStudentSummary.journal_id.in_(journal_ids)
        ).group_by(JournalStudentSummary.journal_id)
        summary_avg_res = await self.db.execute(summary_avg_stmt)
        summary_avg_map = dict(summary_avg_res.all())

        today = date.today()
        results = []
        for j in journals:
            lesson_dates = get_lesson_dates(j.period_start, j.period_end, schedules)
            lesson_count = len(lesson_dates)
            cells_expected = student_count * lesson_count
            cells_filled = entry_counts_map.get(j.id, 0)
            raw_avg = summary_avg_map.get(j.id)
            avg_percentage = round(float(raw_avg), 1) if raw_avg is not None else None

            if j.period_start > today:
                state = "upcoming"
            elif cells_filled == 0:
                state = "empty"
            elif cells_expected > 0 and cells_filled >= cells_expected:
                state = "complete"
            else:
                state = "partial"

            results.append(JournalResponse(
                id=j.id,
                course_id=j.course_id,
                period_label=j.period_label,
                period_start=j.period_start,
                period_end=j.period_end,
                period_type=j.period_type,
                exam_max_score=j.exam_max_score,
                student_count=student_count,
                lesson_count=lesson_count,
                cells_expected=cells_expected,
                cells_filled=cells_filled,
                avg_percentage=avg_percentage,
                state=state,
            ))
        return results

    async def get_course_journal_metrics(self, course_id: int) -> CourseJournalMetricsResponse:
        AT_RISK_THRESHOLD = 60

        journals_agg = await self.get_course_journals_aggregated(course_id)
        periods_total = len(journals_agg)
        periods_complete = sum(1 for j in journals_agg if j.state == "complete")

        journal_ids = [j.id for j in journals_agg]
        if not journal_ids:
            return CourseJournalMetricsResponse(
                class_avg_percentage=0.0,
                attendance_rate=0.0,
                periods_total=0,
                periods_complete=0,
                at_risk_count=0,
                at_risk_threshold=AT_RISK_THRESHOLD,
            )

        pct_expr = case((JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score), else_=0.0)

        summary_totals_stmt = select(
            func.avg(pct_expr),
            func.sum(JournalStudentSummary.attendance_count),
            func.sum(JournalStudentSummary.total_lessons)
        ).filter(JournalStudentSummary.journal_id.in_(journal_ids))
        summary_res = await self.db.execute(summary_totals_stmt)
        avg_pct, sum_att, sum_lessons = summary_res.first() or (0.0, 0, 0)

        class_avg_percentage = round(float(avg_pct), 1) if avg_pct is not None else 0.0

        attendance_rate = 0.0
        if sum_lessons and sum_lessons > 0 and sum_att is not None:
            attendance_rate = round((float(sum_att) / float(sum_lessons)) * 100.0, 1)

        student_avg_stmt = select(
            JournalStudentSummary.student_id,
            func.avg(pct_expr)
        ).filter(
            JournalStudentSummary.journal_id.in_(journal_ids)
        ).group_by(JournalStudentSummary.student_id)
        student_avg_res = await self.db.execute(student_avg_stmt)
        at_risk_count = 0
        for student_id, st_avg in student_avg_res.all():
            if st_avg is not None and float(st_avg) < AT_RISK_THRESHOLD:
                at_risk_count += 1

        return CourseJournalMetricsResponse(
            class_avg_percentage=class_avg_percentage,
            attendance_rate=attendance_rate,
            periods_total=periods_total,
            periods_complete=periods_complete,
            at_risk_count=at_risk_count,
            at_risk_threshold=AT_RISK_THRESHOLD,
        )

    async def get_mentor_grading_queue(self, mentor_id: int) -> List[GradingQueueItemResponse]:
        courses_stmt = select(Course).filter(
            Course.mentor_id == mentor_id,
            Course.status == CourseStatus.ACTIVE,
            Course.is_deleted == False
        )
        courses_res = await self.db.execute(courses_stmt)
        courses = list(courses_res.scalars().all())

        today = date.today()
        queue: List[GradingQueueItemResponse] = []

        for course in courses:
            journals = await self.get_course_journals_aggregated(course.id)
            for j in journals:
                if j.state in ("empty", "partial") and j.period_start <= today:
                    is_current = j.period_start <= today <= j.period_end
                    queue.append(GradingQueueItemResponse(
                        journal_id=j.id,
                        course_id=course.id,
                        course_title=course.title,
                        period_label=j.period_label,
                        period_start=j.period_start,
                        period_end=j.period_end,
                        state=j.state,
                        cells_filled=j.cells_filled,
                        cells_expected=j.cells_expected,
                        is_current=is_current,
                    ))

        queue.sort(key=lambda item: (0 if item.is_current else 1, -item.period_end.toordinal()))
        return queue

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

        student_ids = [s_user.id for s_user, _ in students_list]

        all_entries = []
        all_summaries = []
        if student_ids:
            all_entries_query = select(JournalEntry).filter(
                JournalEntry.journal_id == journal_id,
                JournalEntry.student_id.in_(student_ids)
            ).order_by(JournalEntry.student_id, JournalEntry.lesson_date)
            all_entries_result = await self.db.execute(all_entries_query)
            all_entries = list(all_entries_result.scalars().all())

            all_summaries_query = select(JournalStudentSummary).filter(
                JournalStudentSummary.journal_id == journal_id,
                JournalStudentSummary.student_id.in_(student_ids)
            )
            all_summaries_result = await self.db.execute(all_summaries_query)
            all_summaries = list(all_summaries_result.scalars().all())
        entries_by_student = defaultdict(list)
        for entry in all_entries:
            entries_by_student[entry.student_id].append(entry)

        summaries_by_student = {s.student_id: s for s in all_summaries}

        students_data = []
        for s_user, color_hex in students_list:
            entries = entries_by_student.get(s_user.id, [])

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

            summary = summaries_by_student.get(s_user.id)

            summary_data = None
            if summary:
                summary_data = {
                    "id": summary.id,
                    "journal_id": summary.journal_id,
                    "student_id": summary.student_id,
                    "homework_score": summary.homework_score,
                    "attendance_score": summary.attendance_score,
                    "exam_score": summary.exam_score,
                    "bonus_score": summary.bonus_score,
                    "sum_score": summary.sum_score,
                    "max_period_score": summary.max_period_score,
                    "percentage": score_percentage(summary.sum_score, summary.max_period_score),
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

        result_dict = {
            "journal_id": journal.id,
            "course_id": journal.course_id,
            "period_label": journal.period_label,
            "period_start": journal.period_start,
            "period_end": journal.period_end,
            "period_type": journal.period_type,
            "exam_max_score": journal.exam_max_score,
            "lesson_dates": lesson_dates,
            "students": students_data
        }

        if current_user.role == UserRole.STUDENT:
            all_course_enrollments_query = select(func.count(Enrollment.id)).filter(
                Enrollment.course_id == course.id,
                Enrollment.is_deleted == False
            )
            class_size_res = await self.db.execute(all_course_enrollments_query)
            class_size = class_size_res.scalar() or 0

            period_summaries_query = select(JournalStudentSummary).filter(
                JournalStudentSummary.journal_id == journal_id
            )
            period_summaries_res = await self.db.execute(period_summaries_query)
            period_summaries = list(period_summaries_res.scalars().all())

            if period_summaries:
                valid_sums = [score_percentage(s.sum_score, s.max_period_score) for s in period_summaries if s.max_period_score > 0]
                class_avg_percentage = round(sum(valid_sums) / len(valid_sums), 1) if valid_sums else 0.0

                student_pcts = {s.student_id: score_percentage(s.sum_score, s.max_period_score) for s in period_summaries}
                sorted_student_ids = sorted(student_pcts.keys(), key=lambda sid: student_pcts[sid], reverse=True)
                my_rank = (sorted_student_ids.index(current_user.id) + 1) if current_user.id in sorted_student_ids else (len(sorted_student_ids) + 1)
            else:
                class_avg_percentage = 0.0
                my_rank = 1

            result_dict["class_size"] = class_size
            result_dict["class_avg_percentage"] = class_avg_percentage
            result_dict["my_rank"] = my_rank

        return result_dict

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

            target_attendance = True if update_item.score > 0 else update_item.attendance

            changes = {}
            if entry.attendance != target_attendance:
                changes["attendance"] = (entry.attendance, target_attendance)
            if entry.score != update_item.score:
                changes["score"] = (entry.score, update_item.score)
            if entry.comment != update_item.comment:
                changes["comment"] = (entry.comment, update_item.comment)

            if changes:
                entry.attendance = target_attendance
                entry.score = update_item.score
                entry.comment = update_item.comment

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

        try:
            await self.db.flush()
        except StaleObjectError:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Conflict: The journal entries have been updated by another user. Please refresh and try again."
            )

        if updated_student_ids:
            sum_service = SumCalculationService(self.db)
            await sum_service.recalculate_journal(journal_id)

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

        from app.core.redis import enqueue_job
        try:
            await enqueue_job("send_exam_result_notification_task", student_id, journal_id)
        except Exception:
            pass

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
