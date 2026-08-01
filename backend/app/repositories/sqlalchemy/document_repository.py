from sqlalchemy.ext.asyncio import AsyncSession
from app.models.document import Document
from app.repositories.interfaces.document_repository import DocumentRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyDocumentRepository(SQLAlchemyBaseRepository[Document], DocumentRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Document, session)
