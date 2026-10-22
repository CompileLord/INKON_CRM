from typing import TypedDict
from typing_extensions import Protocol
from app.models.document import Document
from app.models.user import UserRole
from app.models.journal_student_summary import JournalStudentSummary
from app.repositories.interfaces.base_repository import BaseRepository, RepositoryPage


class DocumentFilters(TypedDict, total=False):
    owner_type: str
    owner_id: int
    journal_id: int


class DocumentRepository(BaseRepository[Document], Protocol):
    async def list_documents(
        self, filters: DocumentFilters, viewer_id: int, viewer_role: UserRole,
        page: int, page_size: int,
    ) -> RepositoryPage[Document]:
        ...

    async def get_visible_document(self, document_id: int, viewer_id: int, viewer_role: UserRole) -> Document | None:
        ...

    async def mentor_has_student(self, mentor_id: int, student_id: int) -> bool:
        ...

    async def get_journal_summary(self, journal_id: int, student_id: int) -> JournalStudentSummary | None:
        ...
