from datetime import date
from typing_extensions import Protocol


class FutureLessonCountsRepository(Protocol):
    async def for_student_by_course(self, student_id: int, today: date) -> dict[int, tuple[int, int]]:
        ...

    async def for_journals(self, journal_ids: list[int], today: date) -> tuple[int, int]:
        ...
