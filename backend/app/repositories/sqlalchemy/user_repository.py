from datetime import date
from typing import Any, Dict, List, Optional
from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.selectable import Exists
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.repositories.interfaces.user_repository import (
    StudentCourseRawRecord,
    StudentTotalsRawRecord,
    UserRepository,
)
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


from collections import defaultdict
from app.core.scoring import score_percentage
from app.models.course_schedule import CourseSchedule
from app.schemas.schedule import CourseScheduleRuleDTO


class SQLAlchemyUserRepository(SQLAlchemyBaseRepository[User], UserRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(User, session)

    async def get_by_email(self, email: str) -> Optional[User]:
        query = select(User).filter(User.email == email, User.is_deleted == False)
        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_by_id_for_authentication(self, user_id: int) -> Optional[User]:
        query: Select[tuple[User]] = (
            select(User)
            .where(User.id == user_id)
            .execution_options(populate_existing=True)
        )
        result: Result[tuple[User]] = await self.session.execute(query)
        return result.scalars().first()

    async def get_by_id_for_update(self, user_id: int) -> Optional[User]:
        query: Select[tuple[User]] = (
            select(User)
            .where(User.id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        result: Result[tuple[User]] = await self.session.execute(query)
        return result.scalars().first()

    async def get_by_email_for_update(self, email: str) -> Optional[User]:
        query: Select[tuple[User]] = (
            select(User)
            .where(User.email == email, User.is_deleted.is_(False))
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        result: Result[tuple[User]] = await self.session.execute(query)
        return result.scalars().first()

    async def get_students_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        mentor_id: int | None = None,
    ) -> dict:
        query: Select[tuple[User]] = select(User).where(
            User.role == UserRole.STUDENT,
            User.is_deleted.is_(False),
        ).order_by(User.id)
        if mentor_id is not None:
            owned_course_enrollment: Exists = (
                select(Enrollment.id)
                .join(Course, Enrollment.course_id == Course.id)
                .where(
                    Enrollment.student_id == User.id,
                    Enrollment.is_deleted.is_(False),
                    Course.is_deleted.is_(False),
                    Course.mentor_id == mentor_id,
                )
                .correlate(User)
                .exists()
            )
            query = query.where(owned_course_enrollment)
        if search:
            search_pattern = f"%{search}%"
            query = query.where(
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
            func.count(case(((JournalStudentSummary.max_period_score > 0), 1)))
        ).filter(
            JournalStudentSummary.student_id == student_id
        )

        stats_result = await self.session.execute(stats_query)
        avg_score_raw, attendance_count_raw, total_lessons_raw, summaries_count_raw, max_score_count_raw = stats_result.one()

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
                func.count(JournalStudentSummary.id),
                func.count(case(((JournalStudentSummary.max_period_score > 0), 1)))
            ).join(
                Journal, JournalStudentSummary.journal_id == Journal.id
            ).filter(
                JournalStudentSummary.student_id == student_id,
                Journal.course_id.in_(course_ids)
            ).group_by(Journal.course_id)
            student_course_res = await self.session.execute(student_course_query)
            student_course_map = {}
            for cid, avg_val, att_cnt, tot_les, s_cnt, p_graded in student_course_res.all():
                att_int = int(att_cnt) if att_cnt is not None else 0
                tot_int = int(tot_les) if tot_les is not None else 0
                s_int = int(s_cnt) if s_cnt is not None else 0
                p_int = int(p_graded) if p_graded is not None else 0
                student_course_map[cid] = {
                    "avg": round(float(avg_val), 1) if avg_val is not None else 0.0,
                    "attendance_count": att_int,
                    "total_lessons": tot_int,
                    "periods_graded": p_int,
                }
                raw_courses[cid] = StudentCourseRawRecord(
                    avg_score_raw=float(avg_val) if avg_val is not None else None,
                    attendance_count=att_int,
                    total_lessons=tot_int,
                    summaries_count=s_int,
                    periods_with_max_score_count=p_int,
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

        profile_summary_counts_query = select(
            func.count(JournalStudentSummary.id),
            func.count(case((JournalStudentSummary.max_period_score > 0, JournalStudentSummary.id))),
            func.count(case((JournalStudentSummary.max_period_score <= 0, JournalStudentSummary.id))),
            func.avg(case(
                (JournalStudentSummary.max_period_score > 0,
                 (JournalStudentSummary.sum_score * 100.0) / JournalStudentSummary.max_period_score),
                else_=None
            ))
        ).join(
            Journal, JournalStudentSummary.journal_id == Journal.id
        ).join(Course, Journal.course_id == Course.id).filter(
            Course.mentor_id == mentor_id
        )
        profile_summary_counts_result: Any = await self.session.execute(profile_summary_counts_query)
        summary_count: int
        defined_ratio_count: int
        undefined_ratio_count: int
        defined_ratios_mean: Any
        summary_count, defined_ratio_count, undefined_ratio_count, defined_ratios_mean = profile_summary_counts_result.one()

        return {
            "active_courses": active_courses,
            "active_students_count": active_students_count,
            "avg_score": round(float(avg_score), 2) if avg_score is not None else 0.0,
            "avg_score_grading_state": "unknown" if summary_count else "missing",
            "avg_score_provenance": "unknown",
            "avg_score_basis": "all_summaries_on_courses_currently_assigned_including_soft_deleted_and_archived",
            "avg_score_summary_count": summary_count,
            "avg_score_defined_ratio_count": defined_ratio_count,
            "avg_score_undefined_ratio_count": undefined_ratio_count,
            "avg_score_defined_ratios_mean": float(defined_ratios_mean) if defined_ratios_mean is not None else None
        }

    async def get_mentor_analytics(self, mentor_id: int) -> Dict[str, Any]:
        active_courses_result: Any = await self.session.execute(select(func.count(Course.id)).filter(
            Course.mentor_id == mentor_id,
            Course.status == CourseStatus.ACTIVE,
            Course.is_deleted == False
        ))
        active_courses_count: int = active_courses_result.scalar() or 0

        students_result: Any = await self.session.execute(select(
            func.count(func.distinct(Enrollment.student_id))
        ).join(Course).filter(
            Course.mentor_id == mentor_id,
            Enrollment.is_deleted == False
        ))
        total_students_count: int = students_result.scalar() or 0

        score_result: Any = await self.session.execute(select(
            func.avg(JournalStudentSummary.sum_score),
            func.count(JournalStudentSummary.id)
        ).join(
            Journal, JournalStudentSummary.journal_id == Journal.id
        ).join(Course, Journal.course_id == Course.id).filter(
            Course.mentor_id == mentor_id,
            Course.is_deleted == False
        ))
        average_score: Any
        summary_count: int
        average_score, summary_count = score_result.one()

        return {
            "active_courses_count": active_courses_count,
            "active_courses_population": "active_non_deleted_courses",
            "total_students_count": total_students_count,
            "total_students_population": "non_deleted_enrollments_on_assigned_courses_all_statuses_including_soft_deleted_courses",
            "average_student_score": float(average_score) if average_score is not None else 0.0,
            "average_student_score_grading_state": "unknown" if summary_count else "missing",
            "average_student_score_provenance": "unknown",
            "average_student_score_basis": "all_summaries_on_non_deleted_courses_including_archived_raw_points",
            "average_student_score_summary_count": summary_count
        }

