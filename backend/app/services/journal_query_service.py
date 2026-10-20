from collections import defaultdict
from datetime import date, timedelta
from typing import Any, List
from fastapi import HTTPException, status
from sqlalchemy import Row, Select, select, func, case
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Subquery
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.course import Course, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.core.scoring import ScoringPolicy
from app.repositories.interfaces.journal_repository import JournalClassStatistics, JournalRepository
from app.repositories.sqlalchemy.journal_repository import SQLAlchemyJournalRepository
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


class JournalQueryService:
    def __init__(self, db: AsyncSession, journal_repository: JournalRepository | None = None) -> None:
        self.db: AsyncSession = db
        self.journal_repository: JournalRepository = journal_repository or SQLAlchemyJournalRepository(db)

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

        entry_counts_stmt: Select[Any] = select(
            JournalEntry.journal_id,
            func.count(JournalEntry.id)
        ).join(Journal, Journal.id == JournalEntry.journal_id).filter(
            JournalEntry.journal_id.in_(journal_ids),
            JournalEntry.is_graded.is_(True),
            Journal.period_start <= date.today(),
        ).group_by(JournalEntry.journal_id)
        entry_counts_res = await self.db.execute(entry_counts_stmt)
        entry_counts_map = dict(entry_counts_res.all())

        pct_expr = case((JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score), else_=None)

        summary_avg_stmt: Select[Any] = select(
            JournalStudentSummary.journal_id,
            func.avg(pct_expr),
            func.avg(JournalStudentSummary.sum_score)
        ).join(Journal, Journal.id == JournalStudentSummary.journal_id).filter(
            JournalStudentSummary.journal_id.in_(journal_ids),
            JournalStudentSummary.is_graded.is_(True),
            Journal.period_start <= date.today(),
        ).group_by(JournalStudentSummary.journal_id)
        summary_avg_res = await self.db.execute(summary_avg_stmt)
        summary_avg_rows = list(summary_avg_res.all())
        summary_avg_map = {row[0]: row[1] for row in summary_avg_rows}
        summary_avg_score_map = {row[0]: row[2] for row in summary_avg_rows}

        today = date.today()
        results = []
        for j in journals:
            lesson_dates = get_lesson_dates(j.period_start, j.period_end, schedules)
            lesson_count = len(lesson_dates)
            cells_expected = student_count * lesson_count
            cells_filled = entry_counts_map.get(j.id, 0)
            raw_avg = summary_avg_map.get(j.id)
            avg_percentage = round(float(raw_avg), 1) if raw_avg is not None else None
            raw_avg_score = summary_avg_score_map.get(j.id)
            avg_score = round(float(raw_avg_score), 1) if raw_avg_score is not None else None

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
                bonus_max_score=j.bonus_max_score,
                student_count=student_count,
                lesson_count=lesson_count,
                cells_expected=cells_expected,
                cells_filled=cells_filled,
                avg_percentage=avg_percentage,
                avg_score=avg_score,
                state=state,
            ))
        return results

    async def get_course_journal_metrics(self, course_id: int) -> CourseJournalMetricsResponse:
        AT_RISK_THRESHOLD = 60

        journals_agg = await self.get_course_journals_aggregated(course_id)
        periods_total = sum(j.state != "upcoming" for j in journals_agg)
        periods_complete = sum(1 for j in journals_agg if j.state == "complete")

        journal_ids = [j.id for j in journals_agg if j.state != "upcoming"]
        if not journal_ids:
            return CourseJournalMetricsResponse(
                class_avg_percentage=0.0,
                attendance_rate=0.0,
                periods_total=0,
                periods_complete=0,
                at_risk_count=0,
                at_risk_threshold=AT_RISK_THRESHOLD,
            )

        pct_expr = case((JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score), else_=None)

        summary_totals_stmt: Select[Any] = select(
            func.avg(pct_expr),
            func.sum(JournalStudentSummary.attendance_count),
            func.sum(JournalStudentSummary.total_lessons),
            func.avg(JournalStudentSummary.sum_score),
            func.avg(JournalStudentSummary.max_period_score)
        ).filter(JournalStudentSummary.journal_id.in_(journal_ids), JournalStudentSummary.is_graded.is_(True))
        summary_res = await self.db.execute(summary_totals_stmt)
        avg_pct, sum_att, sum_lessons, avg_score_raw, avg_max_score_raw = summary_res.first() or (0.0, 0, 0, None, None)

        class_avg_percentage = round(float(avg_pct), 1) if avg_pct is not None else 0.0
        class_avg_score = round(float(avg_score_raw), 1) if avg_score_raw is not None else 0.0
        class_avg_max_score = round(float(avg_max_score_raw), 1) if avg_max_score_raw is not None else 0.0

        attendance_rate = 0.0
        if sum_lessons and sum_lessons > 0 and sum_att is not None:
            attendance_rate = round((float(sum_att) / float(sum_lessons)) * 100.0, 1)

        student_avg_stmt: Select[Any] = select(
            JournalStudentSummary.student_id,
            func.avg(pct_expr)
        ).filter(
            JournalStudentSummary.journal_id.in_(journal_ids),
            JournalStudentSummary.is_graded.is_(True),
        ).group_by(JournalStudentSummary.student_id)
        student_avg_res = await self.db.execute(student_avg_stmt)
        at_risk_count = 0
        for student_id, st_avg in student_avg_res.all():
            if st_avg is not None and float(st_avg) < AT_RISK_THRESHOLD:
                at_risk_count += 1

        return CourseJournalMetricsResponse(
            class_avg_percentage=class_avg_percentage,
            class_avg_score=class_avg_score,
            class_avg_max_score=class_avg_max_score,
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

    async def get_class_journal(self, journal_id: int, current_user: User) -> dict:
        if current_user.role != UserRole.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        payload: dict = await self.get_journal(journal_id, current_user, include_all_students=True)
        students_view: List[dict] = []
        for student_record in payload["students"]:
            is_self: bool = student_record["student_id"] == current_user.id
            entries_view: List[dict] = [
                entry_record
                if is_self
                else {**entry_record, "comment": None, "has_comment": False}
                for entry_record in student_record["entries"]
            ]
            students_view.append({
                "student_id": student_record["student_id"],
                "first_name": student_record["first_name"],
                "last_name": student_record["last_name"],
                "color_hex": student_record["color_hex"],
                "is_self": is_self,
                "entries": entries_view,
                "summary": student_record["summary"],
            })
        students_view.sort(key=lambda record: not record["is_self"])
        return {**payload, "students": students_view}

    async def get_journal(self, journal_id: int, current_user: User, include_all_students: bool = False) -> dict:
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

        if current_user.role == UserRole.STUDENT and not include_all_students:
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
                    "percentage": ScoringPolicy.percentage(summary.sum_score, summary.max_period_score),
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
            "bonus_max_score": ScoringPolicy.resolve_bonus_max_score(journal.bonus_max_score),
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

            statistics: JournalClassStatistics = await self.journal_repository.get_class_statistics(journal_id, current_user.id)

            result_dict["class_size"] = class_size
            result_dict["class_avg_percentage"] = statistics.average_percentage
            result_dict["class_avg_score"] = statistics.average_score
            result_dict["my_rank"] = statistics.student_rank

        return result_dict
