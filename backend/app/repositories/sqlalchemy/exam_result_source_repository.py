from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.course import Course
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.telegram_link import TelegramChatPreference
from app.models.user import User
from app.repositories.interfaces.exam_result_notification_repository import ExamResultSource


class SQLAlchemyExamResultSourceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session: AsyncSession = session

    async def load_source(self, student_id: int, journal_id: int) -> Optional[ExamResultSource]:
        statement = (
            select(
                JournalStudentSummary,
                User.first_name,
                User.last_name,
                User.is_deleted,
                User.parent_telegram_chat_id,
                TelegramChatPreference.language,
                Course.title,
                Course.is_deleted,
                Journal.period_label,
                Journal.exam_max_score,
            )
            .join(User, User.id == JournalStudentSummary.student_id)
            .join(Journal, Journal.id == JournalStudentSummary.journal_id)
            .join(Course, Course.id == Journal.course_id)
            .outerjoin(TelegramChatPreference, TelegramChatPreference.chat_id == User.parent_telegram_chat_id)
            .where(
                JournalStudentSummary.student_id == student_id,
                JournalStudentSummary.journal_id == journal_id,
            )
        )
        row = (await self._session.execute(statement)).first()
        if row is None:
            return None
        summary: JournalStudentSummary = row[0]
        return ExamResultSource(
            student_name=f"{row[1]} {row[2]}".strip(),
            student_deleted=row[3],
            parent_chat_id=row[4],
            parent_language=row[5],
            course_title=row[6],
            course_deleted=row[7],
            period_label=row[8],
            exam_score=summary.exam_score,
            exam_max_score=row[9],
            sum_score=summary.sum_score,
            max_period_score=summary.max_period_score,
            attendance_count=summary.attendance_count,
            total_lessons=summary.total_lessons,
        )
