from sqlalchemy.ext.asyncio import AsyncSession
from app.models.journal import Journal
from app.repositories.interfaces.journal_repository import JournalRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyJournalRepository(SQLAlchemyBaseRepository[Journal], JournalRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Journal, session)
