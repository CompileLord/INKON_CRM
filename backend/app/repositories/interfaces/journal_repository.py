from dataclasses import dataclass
from typing_extensions import Protocol
from app.models.journal import Journal
from app.repositories.interfaces.base_repository import BaseRepository


@dataclass(frozen=True)
class JournalClassStatistics:
    average_percentage: float
    average_score: float
    student_rank: int


class JournalRepository(BaseRepository[Journal], Protocol):
    async def get_class_statistics(self, journal_id: int, student_id: int) -> JournalClassStatistics:
        ...
