from sqlalchemy import Select, select
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.repositories.interfaces.admin_contact_repository import AdminContact, AdminContactRepository


class SQLAlchemyAdminContactRepository(AdminContactRepository):
    def __init__(self, session: AsyncSession) -> None:
        self.session: AsyncSession = session

    async def list_superadmin_contacts(self) -> list[AdminContact]:
        query: Select[tuple[str | None, str | None]] = (
            select(User.email, User.phone)
            .where(User.role == UserRole.SUPERADMIN.value, User.is_deleted.is_(False))
            .order_by(User.id)
        )
        result: Result[tuple[str | None, str | None]] = await self.session.execute(query)
        return [AdminContact(email=email, phone=phone) for email, phone in result.all()]
