from dataclasses import dataclass
from typing_extensions import Protocol
from app.models.journal import Journal


@dataclass(frozen=True)
class JournalCellLookup:
    schedule_weekdays: tuple[int, ...]
    known_student_ids: frozenset[int]
    enrolled_student_ids: frozenset[int]


class JournalCellLookupRepository(Protocol):
    async def lookup(self, journal: Journal, student_ids: frozenset[int]) -> JournalCellLookup:
        ...
