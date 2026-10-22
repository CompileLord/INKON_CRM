from typing import cast
from sqlalchemy import Select, and_, or_, select, true, false
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement
from app.models.course import Course
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.document import Document, DocumentOwnerType
from app.models.user import UserRole
from app.models.journal_student_summary import JournalStudentSummary
from app.repositories.interfaces.base_repository import RepositoryPage
from app.repositories.interfaces.document_repository import DocumentRepository, DocumentFilters
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

    def _visibility_filter(self, viewer_id: int, viewer_role: UserRole) -> ColumnElement[bool]:
        if viewer_role == UserRole.STUDENT:
            return and_(Document.owner_type == DocumentOwnerType.STUDENT, Document.owner_id == viewer_id)
        if viewer_role == UserRole.MENTOR:
            return or_(
                and_(Document.owner_type == DocumentOwnerType.STUDENT, self.student_is_enrolled_with_mentor(viewer_id)),
                and_(Document.owner_type == DocumentOwnerType.MENTOR, Document.owner_id == viewer_id),
            )
        return true() if viewer_role == UserRole.SUPERADMIN else false()

    async def list_documents(
        self, filters: DocumentFilters, viewer_id: int, viewer_role: UserRole,
        page: int, page_size: int,
    ) -> RepositoryPage[Document]:
        query: Select[tuple[Document]] = select(Document).where(
            Document.is_deleted.is_(False), self._visibility_filter(viewer_id, viewer_role),
        )
        if filters.get("owner_type"):
            query = query.where(Document.owner_type == filters["owner_type"])
        if filters.get("owner_id"):
            query = query.where(Document.owner_id == filters["owner_id"])
        if filters.get("journal_id"):
            query = query.where(Document.journal_id == filters["journal_id"])
        return cast(RepositoryPage[Document], await self.get_paginated(query.order_by(Document.id.desc()), page, page_size))

    async def get_visible_document(self, document_id: int, viewer_id: int, viewer_role: UserRole) -> Document | None:
        query: Select[tuple[Document]] = select(Document).where(
            Document.id == document_id, Document.is_deleted.is_(False),
            self._visibility_filter(viewer_id, viewer_role),
        )
        return (await self.session.execute(query)).scalars().first()

    async def get_journal_summary(self, journal_id: int, student_id: int) -> JournalStudentSummary | None:
        query: Select[tuple[JournalStudentSummary]] = select(JournalStudentSummary).where(
            JournalStudentSummary.journal_id == journal_id, JournalStudentSummary.student_id == student_id,
        )
        return (await self.session.execute(query)).scalars().first()
