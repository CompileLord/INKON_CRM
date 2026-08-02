import asyncio
import os
import shutil
import sys
import logging
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import List, Dict, Any, Tuple
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import text, select
from app.db.session import engine, AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.course_mentor_history import CourseMentorHistory
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.payment import PaymentMethod
from app.core.security import hash_password
from app.core.config import settings
from app.services.course_service import CourseService
from app.services.enrollment_service import EnrollmentService
from app.services.finance_service import FinanceService
from app.services.sum_calculation_service import SumCalculationService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TABLES_TO_TRUNCATE: List[str] = [
    "refresh_tokens",
    "audit_logs",
    "notification_logs",
    "documents",
    "allocations",
    "ledger_entries",
    "charges",
    "payments",
    "journal_student_summaries",
    "journal_entries",
    "journals",
    "enrollments",
    "course_mentor_history",
    "course_schedules",
    "courses",
    "users"
]

TAJIK_STUDENTS: List[Tuple[str, str, str, str]] = [
    ("Somoni", "Rahmonov", "somoni.rahmonov@gmail.com", "+992901110001"),
    ("Anoshirvon", "Rustamov", "anoshirvon.rustamov@gmail.com", "+992901110002"),
    ("Farhod", "Ziyoyev", "farhod.ziyoyev@gmail.com", "+992901110003"),
    ("Nigora", "Nabiyeva", "nigora.nabiyeva@gmail.com", "+992901110004"),
    ("Malika", "Olimova", "malika.olimova@gmail.com", "+992901110005"),
    ("Shahrom", "Hakimov", "shahrom.hakimov@gmail.com", "+992901110006"),
    ("Tahmina", "Qodirova", "tahmina.qodirova@gmail.com", "+992901110007"),
    ("Sherzod", "Toshev", "sherzod.toshev@gmail.com", "+992901110008"),
    
    ("Parviz", "Ismoilov", "parviz.ismoilov@gmail.com", "+992902220001"),
    ("Zarina", "Alimova", "zarina.alimova@gmail.com", "+992902220002"),
    ("Dilshod", "Safarov", "dilshod.safarov@gmail.com", "+992902220003"),
    ("Bahrom", "Karimov", "bahrom.karimov@gmail.com", "+992902220004"),
    ("Jamshed", "Mirzoev", "jamshed.mirzoev@gmail.com", "+992902220005"),
    ("Madina", "Shodiyeva", "madina.shodiyeva@gmail.com", "+992902220006"),
    ("Gulnora", "Asadova", "gulnora.asadova@gmail.com", "+992902220007"),
    ("Sukhrob", "Umarov", "sukhrob.umarov@gmail.com", "+992902220008"),
    
    ("Alisher", "Sharipov", "alisher.sharipov@gmail.com", "+992903330001"),
    ("Khujand", "Kholov", "khujand.kholov@gmail.com", "+992903330002"),
    ("Umed", "Boboev", "umed.boboev@gmail.com", "+992903330003"),
    ("Azam", "Samadov", "azam.samadov@gmail.com", "+992903330004"),
    ("Rustam", "Qodirov", "rustam.qodirov@gmail.com", "+992903330005"),
    ("Parvina", "Sobirova", "parvina.sobirova@gmail.com", "+992903330006"),
    ("Nilufar", "Saidova", "nilufar.saidova@gmail.com", "+992903330007"),
    ("Shabnam", "Toshpulotova", "shabnam.toshpulotova@gmail.com", "+992903330008"),
    
    ("Shahnoza", "Mansurova", "shahnoza.mansurova@gmail.com", "+992904440001"),
    ("Munira", "Rasulova", "munira.rasulova@gmail.com", "+992904440002"),
    ("Manizha", "Davlatova", "manizha.davlatova@gmail.com", "+992904440003"),
    ("Nozima", "Yusupova", "nozima.yusupova@gmail.com", "+992904440004"),
    ("Davron", "Nabiev", "davron.nabiev@gmail.com", "+992904440005"),
    ("Siyovush", "Qosimov", "siyovush.qosimov@gmail.com", "+992904440006"),
    ("Mehrangiz", "Hamidova", "mehrangiz.hamidova@gmail.com", "+992904440007"),
    ("Zarrina", "Boboyeva", "zarrina.boboyeva@gmail.com", "+992904440008"),
]


def generate_course_banner(course_id: int, title: str, subtitle: str, bg_color: Tuple[int, int, int], accent_color: Tuple[int, int, int]) -> str:
    storage_dir: str = os.path.abspath(os.path.join(settings.STORAGE_PATH, "course", str(course_id)))
    os.makedirs(storage_dir, exist_ok=True)
    filename: str = "course_image.jpg"
    file_path: str = os.path.join(storage_dir, filename)

    img: Image.Image = Image.new("RGB", (800, 400), color=bg_color)
    draw: ImageDraw.ImageDraw = ImageDraw.Draw(img)

    for i in range(0, 800, 40):
        draw.line([(i, 0), (i + 200, 400)], fill=(bg_color[0] + 15, bg_color[1] + 15, bg_color[2] + 15), width=20)

    draw.rectangle([30, 30, 770, 370], outline=accent_color, width=4)
    draw.rectangle([40, 40, 760, 360], outline=(255, 255, 255, 80), width=2)

    try:
        font_title = ImageFont.truetype("/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf", 36)
        font_sub = ImageFont.truetype("/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf", 22)
    except Exception:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    draw.text((60, 140), title, fill=(255, 255, 255), font=font_title)
    draw.text((60, 210), subtitle, fill=accent_color, font=font_sub)

    img.save(file_path, "JPEG", quality=95)
    return f"/storage/course/{course_id}/{filename}"


async def clean_database_and_storage() -> None:
    logger.info("Cleaning database tables...")
    async with engine.begin() as conn:
        for tbl in TABLES_TO_TRUNCATE:
            await conn.execute(text(f"TRUNCATE TABLE {tbl} RESTART IDENTITY CASCADE;"))
    
    if os.path.exists(settings.STORAGE_PATH):
        shutil.rmtree(settings.STORAGE_PATH, ignore_errors=True)
    os.makedirs(settings.STORAGE_PATH, exist_ok=True)
    logger.info("Database and storage cleaned successfully.")


async def seed_demo_data() -> None:
    await clean_database_and_storage()

    async with AsyncSessionLocal() as session:
        password_hash_default: str = hash_password("password123")

        admin_user: User = User(
            email="admin@test.com",
            password_hash=password_hash_default,
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

        student_users: List[User] = []
        for idx, (first_name, last_name, email, phone) in enumerate(TAJIK_STUDENTS, start=1):
            student: User = User(
                email=email,
                password_hash=password_hash_default,
                first_name=first_name,
                last_name=last_name,
                role=UserRole.STUDENT,
                phone=phone,
                payment_day_of_month=(idx % 20) + 1,
                parent_phone=f"+99290888{idx:04d}",
                must_set_password=False
            )
            session.add(student)
            student_users.append(student)

        await session.flush()
        logger.info(f"Seeded users: 1 Admin, 1 Accountant, 3 Mentors, {len(student_users)} Students.")

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
                "banner": ("English Elementary", "3-Month Language Course", (24, 76, 120), (245, 158, 11)),
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
                "banner": ("German A1 Beginner", "3-Month Language Course", (124, 45, 18), (251, 191, 36)),
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
                "banner": ("Python Backend Dev", "1-Month Intensive Programming", (20, 83, 45), (52, 211, 153)),
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
                "banner": ("Web Frontend Dev", "1-Month Intensive Programming", (109, 40, 217), (167, 139, 250)),
                "student_slice": slice(24, 32)
            }
        ]

        created_courses: List[Course] = []
        enrollment_service: EnrollmentService = EnrollmentService(session)

        for cdef in course_definitions:
            photo_path: str = generate_course_banner(
                cdef["id"],
                cdef["banner"][0],
                cdef["banner"][1],
                cdef["banner"][2],
                cdef["banner"][3]
            )

            course: Course = Course(
                id=cdef["id"],
                title=cdef["title"],
                description=cdef["description"],
                photo_path=photo_path,
                start_date=cdef["start_date"],
                end_date=cdef["end_date"],
                exam_type=cdef["exam_type"],
                price=cdef["price"],
                mentor_id=cdef["mentor_id"],
                status=CourseStatus.ACTIVE
            )
            session.add(course)
            await session.flush()

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

            created_courses.append(course)
            logger.info(f"Course '{course.title}' created with {len(assigned_students)} enrolled students.")

        await session.commit()

    async with AsyncSessionLocal() as session:
        logger.info("Populating gradebook entries and journal summaries...")
        sum_service: SumCalculationService = SumCalculationService(session)
        
        journals_res = await session.execute(select(Journal))
        journals: List[Journal] = list(journals_res.scalars().all())

        for journal in journals:
            entries_res = await session.execute(
                select(JournalEntry).filter(JournalEntry.journal_id == journal.id)
            )
            entries: List[JournalEntry] = list(entries_res.scalars().all())

            for idx, entry in enumerate(entries):
                entry.attendance = True
                entry.score = 3 + ((entry.student_id + idx) % 3)

            summaries_res = await session.execute(
                select(JournalStudentSummary).filter(JournalStudentSummary.journal_id == journal.id)
            )
            summaries: List[JournalStudentSummary] = list(summaries_res.scalars().all())

            for summary in summaries:
                summary.exam_score = min(journal.exam_max_score, 40 + ((summary.student_id * 3) % 20))
                summary.bonus_score = (summary.student_id % 5)
                await sum_service.recalculate(summary.journal_id, summary.student_id)

        await session.commit()
        logger.info("Gradebook entries and summaries updated successfully.")

    async with AsyncSessionLocal() as session:
        logger.info("Seeding financial payments...")
        finance_service: FinanceService = FinanceService(session)
        
        admin_res = await session.execute(select(User).filter(User.role == UserRole.SUPERADMIN))
        admin_user = admin_res.scalars().first()

        for cdef in course_definitions:
            course_id: int = cdef["id"]
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

if __name__ == "__main__":
    try:
        asyncio.run(seed_demo_data())
        print("DEMO DATA SEEDED SUCCESSFULLY!")
    except Exception as e:
        logger.error(f"Error seeding demo data: {e}")
        sys.exit(1)
