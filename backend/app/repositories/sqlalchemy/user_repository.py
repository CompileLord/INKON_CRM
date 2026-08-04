from datetime import date
from typing import Any, Dict, List, Optional
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.repositories.interfaces.user_repository import UserRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


from collections import defaultdict
from app.core.schedule_utils import compute_next_lesson_at
from app.core.scoring import score_percentage
from app.models.course_schedule import CourseSchedule


class SQLAlchemyUserRepository(SQLAlchemyBaseRepository[User], UserRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(User, session)

    async def get_by_email(self, email: str) -> Optional[User]:
        query = select(User).filter(User.email == email, User.is_deleted == False)
        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_students_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> dict:
        query = select(User).filter(User.role == UserRole.STUDENT, User.is_deleted == False)
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                or_(
                    User.first_name.ilike(search_pattern),
                    User.last_name.ilike(search_pattern),
                    User.email.ilike(search_pattern),
                )
            )
        return await self.get_paginated(query, page, page_size)

    async def get_mentors_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> dict:
        query = select(User).filter(User.role == UserRole.MENTOR, User.is_deleted == False)
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                or_(
                    User.first_name.ilike(search_pattern),
                    User.last_name.ilike(search_pattern),
                    User.email.ilike(search_pattern),
                )
            )
        return await self.get_paginated(query, page, page_size)

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

        stats_query = select(
            func.avg(
                case(
                    ((JournalStudentSummary.max_period_score > 0), (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score)
                )
            ),
            func.sum(JournalStudentSummary.attendance_count),
            func.sum(JournalStudentSummary.total_lessons)
        ).filter(JournalStudentSummary.student_id == student_id)

        stats_result = await self.session.execute(stats_query)
        avg_score, attendance_count, total_lessons = stats_result.one()

        avg_score = round(float(avg_score), 1) if avg_score is not None else 0.0
        total_lessons = int(total_lessons) if total_lessons is not None else 0
        attendance_count = int(attendance_count) if attendance_count is not None else 0
        absences = total_lessons - attendance_count
        attendance_percentage = round((attendance_count * 100.0 / total_lessons), 1) if total_lessons > 0 else 100.0

        totals = {
            "avg_percentage": avg_score,
            "attendance_percentage": attendance_percentage,
            "absences": absences,
            "total_lessons": total_lessons,
            "active_course_count": active_course_count,
            "archived_course_count": archived_course_count,
        }

        course_ids = [c.id for _, c in enrollment_pairs]
        courses_data = []

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
                )
            ).join(
                Journal, JournalStudentSummary.journal_id == Journal.id
            ).filter(
                Journal.course_id.in_(course_ids)
            ).group_by(Journal.course_id)
            class_avg_res = await self.session.execute(class_avg_query)
            class_avg_map = {cid: round(float(avg_val), 1) for cid, avg_val in class_avg_res.all() if avg_val is not None}

            student_course_query = select(
                Journal.course_id,
                func.avg(
                    case(
                        ((JournalStudentSummary.max_period_score > 0), (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score)
                    )
                ),
                func.sum(JournalStudentSummary.attendance_count),
                func.sum(JournalStudentSummary.total_lessons),
                func.count(case(((JournalStudentSummary.max_period_score > 0), 1)))
            ).join(
                Journal, JournalStudentSummary.journal_id == Journal.id
            ).filter(
                JournalStudentSummary.student_id == student_id,
                Journal.course_id.in_(course_ids)
            ).group_by(Journal.course_id)
            student_course_res = await self.session.execute(student_course_query)
            student_course_map = {
                cid: {
                    "avg": round(float(avg_val), 1) if avg_val is not None else 0.0,
                    "attendance_count": int(att_cnt) if att_cnt is not None else 0,
                    "total_lessons": int(tot_les) if tot_les is not None else 0,
                    "periods_graded": int(p_graded) if p_graded is not None else 0,
                }
                for cid, avg_val, att_cnt, tot_les, p_graded in student_course_res.all()
            }

            schedules_query = select(CourseSchedule).filter(CourseSchedule.course_id.in_(course_ids))
            schedules_res = await self.session.execute(schedules_query)
            schedules_by_course = defaultdict(list)
            for s in schedules_res.scalars().all():
                schedules_by_course[s.course_id].append(s)

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
                st_info = student_course_map.get(course.id, {"avg": 0.0, "attendance_count": 0, "total_lessons": 0, "periods_graded": 0})
                c_tot = st_info["total_lessons"]
                c_att = st_info["attendance_count"]
                c_abs = c_tot - c_att
                c_att_pct = round((c_att * 100.0 / c_tot), 1) if c_tot > 0 else 100.0
                next_dt = compute_next_lesson_at(schedules_by_course.get(course.id, [])) if is_active else None

                courses_data.append({
                    "course": course,
                    "enrollment_status": enrollment.status.value if hasattr(enrollment.status, "value") else str(enrollment.status),
                    "bucket": bucket,
                    "my_avg_percentage": st_info["avg"],
                    "attendance_percentage": c_att_pct,
                    "absences": c_abs,
                    "periods_total": periods_total_map.get(course.id, 0),
                    "periods_graded": st_info["periods_graded"],
                    "my_rank": rank_map.get(course.id, 1),
                    "class_size": class_size_map.get(course.id, 0),
                    "class_avg_percentage": class_avg_map.get(course.id, 0.0),
                    "next_lesson_at": next_dt
                })

        return {
            "totals": totals,
            "courses": courses_data,
            "avg_score": avg_score,
            "absences": absences,
            "total_lessons": total_lessons
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
            percentage = score_percentage(sum_score, max_period_score) if summary else 0.0
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

    async def get_mentor_profile_stats(self, mentor_id: int) -> Dict[str, Any]:
        courses_query = select(Course).filter(
            Course.mentor_id == mentor_id,
            Course.status == CourseStatus.ACTIVE,
            Course.is_deleted == False
        )
        courses_result = await self.session.execute(courses_query)
        active_courses = list(courses_result.scalars().all())

        active_students_query = select(func.count(func.distinct(Enrollment.student_id))).join(Course).filter(
            Course.mentor_id == mentor_id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
            Enrollment.is_deleted == False
        )
        active_students_result = await self.session.execute(active_students_query)
        active_students_count = active_students_result.scalar() or 0

        avg_score_query = select(
            func.avg(
                case(
                    (JournalStudentSummary.max_period_score > 0, (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
                    else_=0.0
                )
            )
        ).join(
            Journal, JournalStudentSummary.journal_id == Journal.id
        ).join(Course, Journal.course_id == Course.id).filter(
            Course.mentor_id == mentor_id
        )
        avg_score_result = await self.session.execute(avg_score_query)
        avg_score = avg_score_result.scalar()

        return {
            "active_courses": active_courses,
            "active_students_count": active_students_count,
            "avg_score": round(float(avg_score), 2) if avg_score is not None else 0.0
        }

