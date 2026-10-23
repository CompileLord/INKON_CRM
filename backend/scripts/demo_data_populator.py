import logging
from datetime import date, datetime, time, timezone
from decimal import Decimal
from pathlib import Path
from typing import List, Dict, Any
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from app.models.user import User, UserRole
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.course_mentor_history import CourseMentorHistory
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.payment import PaymentMethod
from app.core.config import settings
from scripts.reset_guard import ResetGuardError
from app.core.security import hash_password
from app.core.scoring import ScoringPolicy
from app.services.enrollment_service import EnrollmentService
from app.services.finance_service import FinanceService
from app.services.sum_calculation_service import SumCalculationService


from app.core.school_calendar import SchoolCalendar
from scripts.demo_gradebook_scorer import DemoGradebookScorer
from scripts.demo_seed_assets import TAJIK_STUDENTS, save_course_photo, save_mentor_avatar
from scripts.demo_seed_recorder import DemoSeedRecorder
from scripts.demo_seed_report import DemoSeedReport
from scripts.demo_student_contacts import DemoStudentContactPlan, DemoStudentContacts

logger: logging.Logger = logging.getLogger(__name__)


class DemoDataPopulator:
    @staticmethod
    def require_emailless_users_enabled() -> None:
        if not settings.ALLOW_EMAILLESS_USERS:
            raise ResetGuardError("Demo students require ALLOW_EMAILLESS_USERS=true; enable it only in disposable development environments.")

    @staticmethod
    async def populate_demo_data(
        session_factory: async_sessionmaker[AsyncSession],
        storage_root: Path,
        staged_assets: Dict[str, bytes],
        administrator_password: str,
        demo_password: str,
        report: DemoSeedReport | None = None,
    ) -> None:
        DemoDataPopulator.require_emailless_users_enabled()
        seed_report: DemoSeedReport = report if report is not None else DemoSeedReport()
        password_hash_default: str = hash_password(demo_password)

        async with session_factory() as session:

            admin_user: User = User(
                email="superadmin@mail.com",
                password_hash=hash_password(administrator_password),
                first_name="SuperAdmin",
                last_name="System",
                role=UserRole.SUPERADMIN,
                phone="+992900000000",
                must_set_password=False
            )
            session.add(admin_user)

            accountant_user: User = User(
                email="accountant@test.com",
                password_hash=password_hash_default,
                first_name="Zarina",
                last_name="Karimova",
                role=UserRole.ACCOUNTANT,
                phone="+992900000099",
                must_set_password=False
            )
            session.add(accountant_user)

            mentor_sukhrob: User = User(
                email="sukhrob.hakimov@imkon.tj",
                password_hash=password_hash_default,
                first_name="Sukhrob",
                last_name="Hakimov",
                role=UserRole.MENTOR,
                phone="+992900000001",
                must_set_password=False
            )
            mentor_gulnora: User = User(
                email="gulnora.saidova@imkon.tj",
                password_hash=password_hash_default,
                first_name="Gulnora",
                last_name="Saidova",
                role=UserRole.MENTOR,
                phone="+992900000002",
                must_set_password=False
            )
            mentor_farhod: User = User(
                email="farhod.ziyoyev@imkon.tj",
                password_hash=password_hash_default,
                first_name="Farhod",
                last_name="Ziyoyev",
                role=UserRole.MENTOR,
                phone="+992900000003",
                must_set_password=False
            )
            session.add_all([mentor_sukhrob, mentor_gulnora, mentor_farhod])
            await session.flush()

            for mentor in [mentor_sukhrob, mentor_gulnora, mentor_farhod]:
                img_bytes: bytes = staged_assets[f"mentor:{mentor.email}"]
                photo_url, thumb_url = save_mentor_avatar(mentor.id, img_bytes, storage_root)
                mentor.photo_path = photo_url
                mentor.thumbnail_path = thumb_url

            student_users: List[User] = []
            for idx, (first_name, last_name, email, phone) in enumerate(TAJIK_STUDENTS, start=1):
                contacts: DemoStudentContacts = DemoStudentContactPlan.for_student(idx, email, phone)
                student: User = User(
                    email=contacts.email,
                    password_hash=password_hash_default,
                    first_name=first_name,
                    last_name=last_name,
                    role=UserRole.STUDENT,
                    phone=contacts.phone,
                    payment_day_of_month=(idx % 20) + 1,
                    parent_phone=contacts.parent_phone,
                    must_set_password=False
                )
                session.add(student)
                student_users.append(student)

            await session.flush()
            DemoSeedRecorder.record_credentials(
                seed_report, [admin_user, accountant_user, mentor_sukhrob, mentor_gulnora, mentor_farhod], student_users,
            )
            await DemoSeedRecorder.issue_parent_link_codes(session, seed_report, student_users)
            logger.info(f"Seeded users: 1 Admin, 1 Accountant, 3 Mentors (with real photos), {len(student_users)} Students.")

            course_definitions: List[Dict[str, Any]] = [
                {
                    "id": 1,
                    "title": "English Elementary (Jun-Aug 2026)",
                    "description": "General English Elementary group covering essential grammar, vocabulary, listening, and speaking skills.",
                    "start_date": date(2026, 6, 1),
                    "end_date": date(2026, 8, 31),
                    "exam_type": CourseExamType.MONTHLY,
                    "price": Decimal("500.00"),
                    "mentor_id": mentor_gulnora.id,
                    "schedules": [
                        {"day_of_week": 0, "time_start": time(9, 0), "time_end": time(11, 0)},
                        {"day_of_week": 2, "time_start": time(9, 0), "time_end": time(11, 0)},
                        {"day_of_week": 4, "time_start": time(9, 0), "time_end": time(11, 0)}
                    ],
                    "student_slice": slice(0, 8)
                },
                {
                    "id": 2,
                    "title": "German A1 Beginner (Jun-Aug 2026)",
                    "description": "Introductory 3-month German language program for beginners with monthly exams and conversational practice.",
                    "start_date": date(2026, 6, 1),
                    "end_date": date(2026, 8, 31),
                    "exam_type": CourseExamType.MONTHLY,
                    "price": Decimal("550.00"),
                    "mentor_id": mentor_farhod.id,
                    "schedules": [
                        {"day_of_week": 1, "time_start": time(14, 0), "time_end": time(16, 0)},
                        {"day_of_week": 3, "time_start": time(14, 0), "time_end": time(16, 0)},
                        {"day_of_week": 5, "time_start": time(14, 0), "time_end": time(16, 0)}
                    ],
                    "student_slice": slice(8, 16)
                },
                {
                    "id": 3,
                    "title": "Python Backend Development (Aug 2026)",
                    "description": "Intensive 1-month Python backend programming course with weekly practical exams, FastAPI, and database design.",
                    "start_date": date(2026, 8, 1),
                    "end_date": date(2026, 8, 31),
                    "exam_type": CourseExamType.WEEKLY,
                    "price": Decimal("700.00"),
                    "mentor_id": mentor_sukhrob.id,
                    "schedules": [
                        {"day_of_week": 0, "time_start": time(18, 0), "time_end": time(20, 0)},
                        {"day_of_week": 1, "time_start": time(18, 0), "time_end": time(20, 0)},
                        {"day_of_week": 2, "time_start": time(18, 0), "time_end": time(20, 0)},
                        {"day_of_week": 3, "time_start": time(18, 0), "time_end": time(20, 0)},
                        {"day_of_week": 4, "time_start": time(18, 0), "time_end": time(20, 0)},
                        {"day_of_week": 5, "time_start": time(18, 0), "time_end": time(20, 0)}
                    ],
                    "student_slice": slice(16, 24)
                },
                {
                    "id": 4,
                    "title": "Web Frontend Development (Aug 2026)",
                    "description": "Modern frontend web development course covering HTML5, CSS3, Tailwind, JavaScript, and React framework.",
                    "start_date": date(2026, 8, 1),
                    "end_date": date(2026, 8, 31),
                    "exam_type": CourseExamType.WEEKLY,
                    "price": Decimal("750.00"),
                    "mentor_id": mentor_sukhrob.id,
                    "schedules": [
                        {"day_of_week": 0, "time_start": time(18, 0), "time_end": time(20, 0)},
                        {"day_of_week": 1, "time_start": time(18, 0), "time_end": time(20, 0)},
                        {"day_of_week": 2, "time_start": time(18, 0), "time_end": time(20, 0)},
                        {"day_of_week": 3, "time_start": time(18, 0), "time_end": time(20, 0)},
                        {"day_of_week": 4, "time_start": time(18, 0), "time_end": time(20, 0)},
                        {"day_of_week": 5, "time_start": time(18, 0), "time_end": time(20, 0)}
                    ],
                    "student_slice": slice(24, 32)
                }
            ]

            created_course_ids: Dict[int, int] = {}
            enrollment_service: EnrollmentService = EnrollmentService(session)

            for cdef in course_definitions:
                img_bytes: bytes = staged_assets[f"course:{cdef['id']}"]

                course: Course = Course(
                    title=cdef["title"],
                    description=cdef["description"],
                    start_date=cdef["start_date"],
                    end_date=cdef["end_date"],
                    exam_type=cdef["exam_type"],
                    price=cdef["price"],
                    mentor_id=cdef["mentor_id"],
                    status=CourseStatus.ACTIVE
                )
                session.add(course)
                await session.flush()
                course.photo_path = save_course_photo(course.id, img_bytes, storage_root)
                created_course_ids[cdef["id"]] = course.id

                for sched_data in cdef["schedules"]:
                    sched: CourseSchedule = CourseSchedule(
                        course_id=course.id,
                        day_of_week=sched_data["day_of_week"],
                        time_start=sched_data["time_start"],
                        time_end=sched_data["time_end"]
                    )
                    session.add(sched)

                mentor_hist: CourseMentorHistory = CourseMentorHistory(
                    course_id=course.id,
                    mentor_id=course.mentor_id,
                    assigned_from=datetime.now(timezone.utc),
                    assigned_to=None
                )
                session.add(mentor_hist)
                await session.flush()

                from app.services.journal_generation_service import JournalGenerationService
                journal_gen: JournalGenerationService = JournalGenerationService(session)
                await journal_gen.generate_journals(course)

                assigned_students: List[User] = student_users[cdef["student_slice"]]
                for student in assigned_students:
                    await enrollment_service.enroll_student(
                        student_id=student.id,
                        course_id=course.id,
                        current_user=admin_user
                    )

                logger.info(f"Course '{course.title}' created with real photo and {len(assigned_students)} enrolled students.")

            await session.commit()

        async with session_factory() as session:
            logger.info("Populating gradebook entries and journal summaries...")
            sum_service: SumCalculationService = SumCalculationService(session)
            today: date = SchoolCalendar.today()

            journals_res = await session.execute(select(Journal))
            journals: List[Journal] = list(journals_res.scalars().all())

            for journal in journals:
                entries_res = await session.execute(
                    select(JournalEntry).filter(JournalEntry.journal_id == journal.id)
                )
                entries: List[JournalEntry] = list(entries_res.scalars().all())

                entries_by_student: Dict[int, List[JournalEntry]] = {}
                for entry in entries:
                    entries_by_student.setdefault(entry.student_id, []).append(entry)

                sample_student_entries: List[JournalEntry] = next(iter(entries_by_student.values()), [])
                lesson_count: int = len(sample_student_entries)
                hw_att_max: int = lesson_count * (ScoringPolicy.MAX_HOMEWORK_SCORE_PER_LESSON + ScoringPolicy.ATTENDANCE_POINT_PER_LESSON)

                target_exam_max: int = max(0, 100 - hw_att_max - ScoringPolicy.DEFAULT_BONUS_MAX_SCORE)
                journal.exam_max_score = target_exam_max

                for student_id, student_entries in entries_by_student.items():
                    DemoGradebookScorer.score_entries(student_id, student_entries, today)

                summaries_res = await session.execute(
                    select(JournalStudentSummary).filter(JournalStudentSummary.journal_id == journal.id)
                )
                summaries: List[JournalStudentSummary] = list(summaries_res.scalars().all())

                for summary in summaries:
                    DemoGradebookScorer.score_summary(summary, journal, today)
                    await sum_service.recalculate(summary.journal_id, summary.student_id)

            await session.commit()
            logger.info("Gradebook entries and summaries updated successfully following 100-point period target rules.")

        async with session_factory() as session:
            logger.info("Seeding financial payments...")
            finance_service: FinanceService = FinanceService(session)

            admin_res = await session.execute(select(User).filter(User.role == UserRole.SUPERADMIN))
            admin_user = admin_res.scalars().first()

            for cdef in course_definitions:
                course_id: int = created_course_ids[cdef["id"]]
                assigned_students: List[User] = student_users[cdef["student_slice"]]

                for idx, student in enumerate(assigned_students):
                    paid_at: datetime = datetime(2026, 8, 2, 10, 0, 0, tzinfo=timezone.utc)
                    method: PaymentMethod = PaymentMethod.CASH if idx % 2 == 0 else PaymentMethod.TRANSFER

                    if idx < 4:
                        amount: Decimal = cdef["price"]
                        comment: str = "Full course tuition payment"
                    elif idx < 7:
                        amount: Decimal = cdef["price"] / Decimal("2.0")
                        comment: str = "First installment payment"
                    else:
                        continue

                    await finance_service.create_payment(
                        student_id=student.id,
                        course_id=course_id,
                        amount=amount,
                        paid_at=paid_at,
                        method=method,
                        comment=comment,
                        current_user=admin_user
                    )

            await session.commit()
            logger.info("Financial payments seeded successfully.")

            sequence_rows = await session.execute(text("""
                SELECT
                    t.relname AS table_name,
                    c.attname AS column_name,
                    s.relname AS sequence_name
                FROM pg_class s
                JOIN pg_depend d ON d.objid = s.oid
                JOIN pg_class t ON d.refobjid = t.oid
                JOIN pg_attribute c ON (d.refobjid, d.refobjsubid) = (c.attrelid, c.attnum)
                WHERE s.relkind = 'S'
                ORDER BY t.relname;
            """))
            for table_name, column_name, sequence_name in sequence_rows.fetchall():
                max_res = await session.execute(text(f'SELECT MAX("{column_name}") FROM "{table_name}"'))
                max_val = max_res.scalar()
                if max_val is not None and max_val > 0:
                    await session.execute(text(f"SELECT setval('{sequence_name}', {max_val}, true)"))
                else:
                    await session.execute(text(f"SELECT setval('{sequence_name}', 1, false)"))
            await session.commit()
            logger.info("Database sequences synchronized successfully.")
