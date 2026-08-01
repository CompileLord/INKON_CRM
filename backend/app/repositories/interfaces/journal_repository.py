from typing_extensions import Protocol
from app.models.journal import Journal
from app.repositories.interfaces.base_repository import BaseRepository


class JournalRepository(BaseRepository[Journal], Protocol):
    pass
