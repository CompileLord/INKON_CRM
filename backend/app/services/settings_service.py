from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.org_settings import OrgSettings
from app.schemas.org_settings import OrgSettingsUpdate


class SettingsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_org_settings(self) -> OrgSettings:
        query = select(OrgSettings).filter(OrgSettings.id == 1)
        result = await self.db.execute(query)
        settings = result.scalars().first()
        if not settings:
            settings = OrgSettings(
                id=1,
                org_name="Учебный центр ИМКОН",
                notify_payments=True,
                notify_debts=True
            )
            self.db.add(settings)
            await self.db.commit()
            await self.db.refresh(settings)
        return settings

    async def update_org_settings(self, data: OrgSettingsUpdate) -> OrgSettings:
        settings = await self.get_org_settings()
        if data.org_name is not None:
            settings.org_name = data.org_name
        if data.notify_payments is not None:
            settings.notify_payments = data.notify_payments
        if data.notify_debts is not None:
            settings.notify_debts = data.notify_debts

        self.db.add(settings)
        await self.db.commit()
        await self.db.refresh(settings)
        return settings
