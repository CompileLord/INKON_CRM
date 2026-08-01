from typing import List
from typing_extensions import Protocol
from app.models.course import Course
from app.repositories.interfaces.base_repository import BaseRepository


class CourseRepository(BaseRepository[Course], Protocol):
    async def get_active_courses(self, skip: int = 0, limit: int = 100) -> List[Course]:
        ...

    async def get_expired_courses(self, skip: int = 0, limit: int = 100) -> List[Course]:
        ...
