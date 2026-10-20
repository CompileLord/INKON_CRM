from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement
from app.models.course import Course
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.document import Document
from app.repositories.interfaces.document_repository import DocumentRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyDocumentRepository(SQLAlchemyBaseRepository[Document], DocumentRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Document, session)

    def student_is_enrolled_with_mentor(self, mentor_id: int) -> ColumnElement[bool]:
        return Document.owner_id.in_(self._students_enrolled_with_mentor(mentor_id))

    async def mentor_has_student(self, mentor_id: int, student_id: int) -> bool:
        query: Select[tuple[bool]] = select(
            self._students_enrolled_with_mentor(mentor_id)
            .where(Enrollment.student_id == student_id)
            .exists()
        )
        return bool(await self.session.scalar(query))

    def _students_enrolled_with_mentor(self, mentor_id: int) -> Select[tuple[int]]:
        return (
            select(Enrollment.student_id)
            .join(Course, Enrollment.course_id == Course.id)
            .where(
                Enrollment.status == EnrollmentStatus.ACTIVE,
                Enrollment.is_deleted.is_(False),
                Course.mentor_id == mentor_id,
                Course.is_deleted.is_(False),
            )
        )
