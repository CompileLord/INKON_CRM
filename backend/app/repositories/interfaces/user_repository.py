from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from typing_extensions import Protocol
from app.models.user import User
from app.repositories.interfaces.base_repository import BaseRepository


@dataclass(frozen=True)
class StudentTotalsRawRecord:
    avg_score_raw: Optional[float]
    attendance_count: int
    total_lessons: int
    summaries_count: int
    periods_with_max_score_count: int


@dataclass(frozen=True)
class StudentCourseRawRecord:
    avg_score_raw: Optional[float]
    attendance_count: int
    total_lessons: int
    summaries_count: int
    periods_with_max_score_count: int


class UserRepository(BaseRepository[User], Protocol):
    async def get_by_email(self, email: str) -> Optional[User]:
        ...

    async def get_by_id_for_authentication(self, user_id: int) -> Optional[User]:
        ...

    async def get_by_id_for_update(self, user_id: int) -> Optional[User]:
        ...

    async def get_by_email_for_update(self, email: str) -> Optional[User]:
        ...

    async def get_active_superadmins(self) -> List[User]:
        ...

    async def get_students_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        mentor_id: int | None = None,
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

    async def get_mentor_analytics(self, mentor_id: int) -> Dict[str, Any]:
        ...
