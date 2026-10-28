from dataclasses import dataclass
from datetime import date
from typing import Dict, List, Optional, Sequence
from typing_extensions import Protocol
from app.models.course import Course
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment
from app.models.journal import Journal
from app.repositories.interfaces.base_repository import BaseRepository, RepositoryPage
from app.models.user import UserRole
from app.schemas.course_list import CourseSortOrder


@dataclass(frozen=True)
class CourseJournalProgress:
    current_period_label: str | None
    last_graded_lesson_date: date | None
    ungraded_lessons_count: int


class CourseRepository(BaseRepository[Course], Protocol):
    async def get_courses_page(
        self, filters: dict, page: int, page_size: int, user_id: int, role: UserRole,
        search: str | None = None, sort: CourseSortOrder = CourseSortOrder.CREATED_AT_DESC,
    ) -> RepositoryPage[Course]: ...

    async def get_journal_progress(self, course_ids: Sequence[int], today: date) -> dict[int, CourseJournalProgress]: ...

    async def get_by_id_for_update(self, course_id: int) -> Optional[Course]: ...

    async def get_copy_source_enrollments(self, course_id: int, limit: int) -> list[Enrollment]: ...

    async def get_course_journals(self, course_id: int) -> list[Journal]: ...

    async def get_course_schedules(self, course_id: int) -> list[CourseSchedule]: ...

    async def get_active_courses(self, skip: int = 0, limit: int = 100) -> List[Course]:
        ...

    async def get_expired_courses(self, skip: int = 0, limit: int = 100) -> List[Course]:
        ...

    async def count_active_students_by_course(self, course_ids: Sequence[int]) -> Dict[int, int]: ...
