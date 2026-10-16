from app.repositories.interfaces.user_repository import UserRepository
from app.schemas.user import MentorAnalyticsResponse


class MentorAnalyticsService:
    def __init__(self, user_repository: UserRepository) -> None:
        self.user_repository = user_repository

    async def get_mentor_analytics(self, mentor_id: int) -> MentorAnalyticsResponse:
        return MentorAnalyticsResponse(**await self.user_repository.get_mentor_analytics(mentor_id))
