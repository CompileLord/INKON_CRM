from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.models.journal import Journal
from app.models.enrollment import Enrollment
from app.models.notification_log import NotificationLog, NotificationType
from app.services.notification_service import NotificationService
from app.tests.conftest import TestingSessionLocal


class DeliveryFixture:
    notification_date: date = date(2026, 10, 19)

    @classmethod
    async def reserve(cls, service: NotificationService, score: int | None = None) -> tuple[int, int]:
        queued: list[tuple[int, int]] = []

        async def enqueue(notification_id: int, revision: int) -> None:
            queued.append((notification_id, revision))

        await service.queue_notification(
            recipient="998877",
            notification_type=NotificationType.EXAM_RESULT,
            related_entity_id=41,
            notification_date=cls.notification_date,
            enqueue_func=enqueue,
            score_val=score,
            delivery_text="message" if score is None else "new",
            revision_requested=score is not None,
        )
        assert len(queued) == 1
        return queued[0]

    @classmethod
    async def load(cls) -> NotificationLog:
        async with TestingSessionLocal() as session:
            return (await session.execute(select(NotificationLog))).scalar_one()

    @classmethod
    async def legacy_source(cls, db_session: AsyncSession, test_student: User, test_mentor: User) -> Journal:
        from decimal import Decimal
        from app.models.course import Course, CourseExamType, CourseStatus
        from app.models.journal import Journal, JournalPeriodType
        from app.models.journal_student_summary import JournalStudentSummary

        test_student.parent_telegram_chat_id = 998877
        db_session.add(test_student)
        course: Course = Course(
            title="Legacy source",
            description="Synthetic",
            start_date=date(2026, 10, 1),
            end_date=date(2026, 10, 31),
            exam_type=CourseExamType.WEEKLY,
            price=Decimal("100.00"),
            mentor_id=test_mentor.id,
            status=CourseStatus.ACTIVE,
        )
        db_session.add(course)
        await db_session.flush()
        journal: Journal = Journal(
            course_id=course.id,
            period_label="Week 1",
            period_start=date(2026, 10, 1),
            period_end=date(2026, 10, 7),
            period_type=JournalPeriodType.WEEK,
        )
        db_session.add(journal)
        await db_session.flush()
        summary: JournalStudentSummary = JournalStudentSummary(
            student_id=test_student.id, journal_id=journal.id, sum_score=10, max_period_score=100
        )
        db_session.add(summary)
        await db_session.commit()
        return journal

    @classmethod
    async def reminder_source(cls, db_session: AsyncSession, test_student: User, test_mentor: User) -> Enrollment:
        from decimal import Decimal
        from app.models.course import Course, CourseExamType, CourseStatus
        from app.models.enrollment import Enrollment, EnrollmentStatus
        from app.models.charge import Charge

        test_student.payment_day_of_month = 21
        test_student.parent_telegram_chat_id = 998877
        db_session.add(test_student)
        course: Course = Course(
            title="Delivery course",
            description="Synthetic",
            start_date=date(2026, 10, 1),
            end_date=date(2026, 10, 31),
            exam_type=CourseExamType.WEEKLY,
            price=Decimal("100.00"),
            mentor_id=test_mentor.id,
            status=CourseStatus.ACTIVE,
        )
        db_session.add(course)
        await db_session.flush()
        enrollment: Enrollment = Enrollment(
            student_id=test_student.id,
            course_id=course.id,
            price_at_enrollment=Decimal("100.00"),
            color_hex="#0000FF",
            status=EnrollmentStatus.ACTIVE,
        )
        db_session.add(enrollment)
        await db_session.flush()
        charge: Charge = Charge(student_id=test_student.id, enrollment_id=enrollment.id, sequence_no=1, amount=Decimal("100.00"), due_date=cls.notification_date + timedelta(days=1))
        db_session.add(charge)
        await db_session.commit()

        return enrollment
