from datetime import date
from typing import Any, Dict, List, Optional
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.repositories.interfaces.user_repository import StudentCourseRawRecord, StudentTotalsRawRecord
from collections import defaultdict
from app.core.scoring import ScoringPolicy
from app.models.course_schedule import CourseSchedule
from app.schemas.schedule import CourseScheduleRuleDTO


class SQLAlchemyStudentPerformanceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session: AsyncSession = session

    async def get_student_profile_stats(self, student_id: int) -> Dict[str, Any]:
        enrollments_query = select(Enrollment, Course).join(
            Course, Enrollment.course_id == Course.id
        ).filter(
            Enrollment.student_id == student_id,
            Enrollment.is_deleted == False,
            Course.is_deleted == False
        )
        enrollments_result = await self.session.execute(enrollments_query)
        enrollment_pairs = list(enrollments_result.all())

        active_course_count = sum(
            1 for e, c in enrollment_pairs
            if e.status == EnrollmentStatus.ACTIVE and c.status == CourseStatus.ACTIVE
        )
        archived_course_count = len(enrollment_pairs) - active_course_count
        course_ids = [c.id for _, c in enrollment_pairs]

        stats_query = select(
            func.avg(
                case(
                    ((JournalStudentSummary.max_period_score > 0), (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score)
                )
            ),
            func.sum(JournalStudentSummary.attendance_count),
            func.sum(JournalStudentSummary.total_lessons),
            func.count(JournalStudentSummary.id),
            func.count(case(((JournalStudentSummary.max_period_score > 0), 1))),
            func.coalesce(func.sum(JournalStudentSummary.sum_score), 0),
            func.coalesce(func.sum(JournalStudentSummary.max_period_score), 0),
        ).filter(
            JournalStudentSummary.student_id == student_id
        )

        stats_result = await self.session.execute(stats_query)
        avg_score_raw, attendance_count_raw, total_lessons_raw, summaries_count_raw, max_score_count_raw, total_score_raw, total_max_score_raw = stats_result.one()

        period_summaries_count = int(summaries_count_raw) if summaries_count_raw is not None else 0
        periods_with_max_score_count = int(max_score_count_raw) if max_score_count_raw is not None else 0
        total_lessons = int(total_lessons_raw) if total_lessons_raw is not None else 0
        attendance_count = int(attendance_count_raw) if attendance_count_raw is not None else 0
        absences = total_lessons - attendance_count

        legacy_avg_score = round(float(avg_score_raw), 1) if avg_score_raw is not None else 0.0
        legacy_attendance_percentage = (
            round((attendance_count * 100.0 / total_lessons), 1)
            if total_lessons > 0
            else 100.0
        )

        totals = {
            "avg_percentage": legacy_avg_score,
            "total_score": int(total_score_raw),
            "total_max_score": int(total_max_score_raw),
            "attendance_percentage": legacy_attendance_percentage,
            "absences": absences,
            "total_lessons": total_lessons,
            "active_course_count": active_course_count,
            "archived_course_count": archived_course_count,
        }

        raw_totals = StudentTotalsRawRecord(
            avg_score_raw=float(avg_score_raw) if avg_score_raw is not None else None,
            attendance_count=attendance_count,
            total_lessons=total_lessons,
            summaries_count=period_summaries_count,
            periods_with_max_score_count=periods_with_max_score_count,
            total_score=int(total_score_raw),
            total_max_score=int(total_max_score_raw),
        )

        courses_data = []
        raw_courses: Dict[int, StudentCourseRawRecord] = {}

        if course_ids:
            journals_count_query = select(
                Journal.course_id,
                func.count(Journal.id)
            ).filter(
                Journal.course_id.in_(course_ids)
            ).group_by(Journal.course_id)
            journals_count_res = await self.session.execute(journals_count_query)
            periods_total_map = dict(journals_count_res.all())

            class_size_query = select(
                Enrollment.course_id,
                func.count(func.distinct(Enrollment.student_id))
            ).filter(
                Enrollment.course_id.in_(course_ids),
                Enrollment.is_deleted == False
            ).group_by(Enrollment.course_id)
            class_size_res = await self.session.execute(class_size_query)
            class_size_map = dict(class_size_res.all())

            class_avg_query = select(
                Journal.course_id,
                func.avg(
                    case(
                        ((JournalStudentSummary.max_period_score > 0), (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score)
                    )
                ),
                func.sum(JournalStudentSummary.sum_score) * 1.0 / func.nullif(func.count(func.distinct(JournalStudentSummary.student_id)), 0)
            ).join(
                Journal, JournalStudentSummary.journal_id == Journal.id
            ).filter(
                Journal.course_id.in_(course_ids)
            ).group_by(Journal.course_id)
            class_avg_res = await self.session.execute(class_avg_query)
            class_avg_rows = list(class_avg_res.all())
            class_avg_map = {cid: round(float(avg_val), 1) for cid, avg_val, _ in class_avg_rows if avg_val is not None}
            class_avg_score_map = {cid: round(float(avg_total), 1) for cid, _, avg_total in class_avg_rows if avg_total is not None}

            student_course_query = select(
                Journal.course_id,
                func.avg(
                    case(
                        ((JournalStudentSummary.max_period_score > 0), (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score)
                    )
                ),
                func.sum(JournalStudentSummary.attendance_count),
                func.sum(JournalStudentSummary.total_lessons),
                func.count(JournalStudentSummary.id),
                func.count(case(((JournalStudentSummary.max_period_score > 0), 1))),
                func.coalesce(func.sum(JournalStudentSummary.sum_score), 0),
                func.coalesce(func.sum(JournalStudentSummary.max_period_score), 0),
            ).join(
                Journal, JournalStudentSummary.journal_id == Journal.id
            ).filter(
                JournalStudentSummary.student_id == student_id,
                Journal.course_id.in_(course_ids)
            ).group_by(Journal.course_id)
            student_course_res = await self.session.execute(student_course_query)
            student_course_map = {}
            for cid, avg_val, att_cnt, tot_les, s_cnt, p_graded, score_total, max_total in student_course_res.all():
                att_int = int(att_cnt) if att_cnt is not None else 0
                tot_int = int(tot_les) if tot_les is not None else 0
                s_int = int(s_cnt) if s_cnt is not None else 0
                p_int = int(p_graded) if p_graded is not None else 0
                student_course_map[cid] = {
                    "avg": round(float(avg_val), 1) if avg_val is not None else 0.0,
                    "attendance_count": att_int,
                    "total_lessons": tot_int,
                    "periods_graded": p_int,
                    "total_score": int(score_total),
                    "total_max_score": int(max_total),
                }
                raw_courses[cid] = StudentCourseRawRecord(
                    avg_score_raw=float(avg_val) if avg_val is not None else None,
                    attendance_count=att_int,
                    total_lessons=tot_int,
                    summaries_count=s_int,
                    periods_with_max_score_count=p_int,
                    total_score=int(score_total),
                    total_max_score=int(max_total),
                )

            schedules_query = select(
                CourseSchedule.course_id,
                CourseSchedule.day_of_week,
                CourseSchedule.time_start,
            ).filter(CourseSchedule.course_id.in_(course_ids))
            schedules_res = await self.session.execute(schedules_query)
            schedules_by_course = defaultdict(list)
            for cid, dow, t_start in schedules_res.all():
                schedules_by_course[cid].append(
                    CourseScheduleRuleDTO(day_of_week=dow, time_start=t_start)
                )

            rank_map = {}
            for cid in course_ids:
                rank_query = select(
                    JournalStudentSummary.student_id,
                    func.avg(
                        case(
                            (JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
                            else_=0.0
                        )
                    )
                ).join(
                    Journal, JournalStudentSummary.journal_id == Journal.id
                ).filter(
                    Journal.course_id == cid
                ).group_by(
                    JournalStudentSummary.student_id
                ).order_by(
                    func.avg(
                        case(
                            (JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
                            else_=0.0
                        )
                    ).desc()
                )
                rank_res = await self.session.execute(rank_query)
                ranked_students = [row[0] for row in rank_res.all()]
                rank_map[cid] = (ranked_students.index(student_id) + 1) if student_id in ranked_students else (len(ranked_students) + 1)

            for enrollment, course in enrollment_pairs:
                is_active = (enrollment.status == EnrollmentStatus.ACTIVE and course.status == CourseStatus.ACTIVE)
                bucket = "active" if is_active else "archive"
                st_info = student_course_map.get(
                    course.id,
                    {
                        "avg": 0.0,
                        "attendance_count": 0,
                        "total_lessons": 0,
                        "periods_graded": 0,
                        "total_score": 0,
                        "total_max_score": 0,
                    }
                )
                c_tot = st_info["total_lessons"]
                c_att = st_info["attendance_count"]
                c_abs = c_tot - c_att
                c_att_pct = round((c_att * 100.0 / c_tot), 1) if c_tot > 0 else 100.0

                courses_data.append({
                    "course": course,
                    "enrollment_status": enrollment.status.value if hasattr(enrollment.status, "value") else str(enrollment.status),
                    "bucket": bucket,
                    "my_avg_percentage": st_info["avg"],
                    "my_total_score": st_info["total_score"],
                    "my_total_max_score": st_info["total_max_score"],
                    "class_avg_score": class_avg_score_map.get(course.id, 0.0),
                    "attendance_percentage": c_att_pct,
                    "absences": c_abs,
                    "periods_total": periods_total_map.get(course.id, 0),
                    "periods_graded": st_info["periods_graded"],
                    "my_rank": rank_map.get(course.id, 1),
                    "class_size": class_size_map.get(course.id, 0),
                    "class_avg_percentage": class_avg_map.get(course.id, 0.0),
                    "schedules": schedules_by_course.get(course.id, []),
                    "next_lesson_at": None,
                })

        return {
            "totals": totals,
            "courses": courses_data,
            "avg_score": legacy_avg_score,
            "absences": absences,
            "total_lessons": total_lessons,
            "raw_totals": raw_totals,
            "raw_courses": raw_courses,
        }

    async def get_student_journals(
        self,
        student_id: int,
        course_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        enrollment_query = select(Enrollment.course_id).filter(
            Enrollment.student_id == student_id,
            Enrollment.is_deleted == False
        )
        if course_id is not None:
            enrollment_query = enrollment_query.filter(Enrollment.course_id == course_id)

        enrollment_res = await self.session.execute(enrollment_query)
        enrolled_course_ids = list(enrollment_res.scalars().all())
        if not enrolled_course_ids:
            return []

        journals_query = select(Journal, Course).join(
            Course, Journal.course_id == Course.id
        ).filter(
            Journal.course_id.in_(enrolled_course_ids)
        ).order_by(Journal.period_start.desc())

        journals_res = await self.session.execute(journals_query)
        journal_course_pairs = list(journals_res.all())
        if not journal_course_pairs:
            return []

        journal_ids = [j.id for j, _ in journal_course_pairs]
        summaries_query = select(JournalStudentSummary).filter(
            JournalStudentSummary.student_id == student_id,
            JournalStudentSummary.journal_id.in_(journal_ids)
        )
        summaries_res = await self.session.execute(summaries_query)
        summaries_map = {s.journal_id: s for s in summaries_res.scalars().all()}

        today = date.today()
        results = []
        for journal, course in journal_course_pairs:
            summary = summaries_map.get(journal.id)
            if journal.period_start > today:
                state = "upcoming"
            elif summary and summary.max_period_score > 0:
                state = "graded"
            else:
                state = "in_progress"

            homework_score = float(summary.homework_score) if summary else 0.0
            attendance_score = float(summary.attendance_score) if summary else 0.0
            exam_score = float(summary.exam_score) if summary else 0.0
            bonus_score = float(summary.bonus_score) if summary else 0.0
            sum_score = float(summary.sum_score) if summary else 0.0
            max_period_score = float(summary.max_period_score) if summary else 0.0
            percentage = ScoringPolicy.percentage(sum_score, max_period_score) if summary else 0.0
            attendance_count = summary.attendance_count if summary else 0
            total_lessons = summary.total_lessons if summary else 0

            results.append({
                "journal_id": journal.id,
                "course_id": course.id,
                "course_title": course.title,
                "period_label": journal.period_label,
                "period_start": journal.period_start,
                "period_end": journal.period_end,
                "homework_score": homework_score,
                "attendance_score": attendance_score,
                "exam_score": exam_score,
                "bonus_score": bonus_score,
                "sum_score": sum_score,
                "max_period_score": max_period_score,
                "percentage": percentage,
                "attendance_count": attendance_count,
                "total_lessons": total_lessons,
                "state": state
            })

        return results
