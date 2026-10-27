from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.org_settings import OrgSettings
from app.services.audit_service import AuditService
from app.schemas.org_settings import OrgSettingsUpdate


class SettingsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db: AsyncSession = db

    async def get_org_settings(self) -> OrgSettings:
        query = select(OrgSettings).filter(OrgSettings.id == 1)
        result = await self.db.execute(query)
        settings: OrgSettings | None = result.scalars().first()
        if not settings:
            settings = OrgSettings(
                id=1,
                org_name="Учебный центр ИМКОН",
                notify_payments=True,
                notify_debts=True
            )
            self.db.add(settings)
            await self.db.flush()
            await self.db.refresh(settings)
        return settings

    async def update_org_settings(self, data: OrgSettingsUpdate, actor_id: int | None = None) -> OrgSettings:
        settings: OrgSettings = await self.get_org_settings()
        previous_values: dict[str, object] = {field: getattr(settings, field) for field in data.model_fields_set}
        if data.org_name is not None:
            settings.org_name = data.org_name
        if "address" in data.model_fields_set:
            settings.address = data.address
        if "phone" in data.model_fields_set:
            settings.phone = data.phone
        if data.notify_payments is not None:
            settings.notify_payments = data.notify_payments
        if data.notify_debts is not None:
            settings.notify_debts = data.notify_debts

        await AuditService(self.db).log_change(
            actor_id, "update", "settings", settings.id, settings.org_name,
            {field: (previous_values[field], getattr(settings, field)) for field in previous_values if previous_values[field] != getattr(settings, field)},
        )
        self.db.add(settings)
        await self.db.flush()
        await self.db.refresh(settings)
        return settings
