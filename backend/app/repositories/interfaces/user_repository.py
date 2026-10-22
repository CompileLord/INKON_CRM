from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from typing_extensions import Protocol
from app.models.user import User
from app.models.course import Course
from app.repositories.interfaces.base_repository import BaseRepository, RepositoryPage


@dataclass(frozen=True)
class StudentTotalsRawRecord:
    avg_score_raw: Optional[float]
    attendance_count: int
    total_lessons: int
    summaries_count: int
    periods_with_max_score_count: int
    total_score: int = 0
    total_max_score: int = 0
    graded_summaries_count: int = 0
    unknown_summaries_count: int = 0


@dataclass(frozen=True)
class StudentCourseRawRecord:
    avg_score_raw: Optional[float]
    attendance_count: int
    total_lessons: int
    summaries_count: int
    periods_with_max_score_count: int
    total_score: int = 0
    total_max_score: int = 0
    graded_summaries_count: int = 0
    unknown_summaries_count: int = 0


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
    ) -> RepositoryPage[User]:
        ...

    async def get_mentors_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> RepositoryPage[User]:
        ...

    async def get_student_profile_stats(self, student_id: int) -> Dict[str, Any]:
        ...

    async def get_student_visible_mentor_courses(self, mentor_id: int, student_id: int) -> list[Course]:
        ...

    async def get_mentor_profile_stats(self, mentor_id: int) -> Dict[str, Any]:
        ...

    async def get_mentor_analytics(self, mentor_id: int) -> Dict[str, Any]:
        ...

    async def mentor_has_student(self, mentor_id: int, student_id: int) -> bool:
        ...
