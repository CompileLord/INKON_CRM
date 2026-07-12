from typing import Any, Dict, List, Optional
from typing_extensions import Protocol
from app.models.user import User
from app.repositories.interfaces.base_repository import BaseRepository


class UserRepository(BaseRepository[User], Protocol):
    async def get_by_email(self, email: str) -> Optional[User]:
        ...

    async def get_students_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> dict:
        ...

    async def get_mentors_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> dict:
        ...

    async def get_student_profile_stats(self, student_id: int) -> Dict[str, Any]:
        ...

    async def get_mentor_profile_stats(self, mentor_id: int) -> Dict[str, Any]:
        ...
