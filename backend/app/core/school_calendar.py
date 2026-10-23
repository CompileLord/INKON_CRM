from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.config import settings


class SchoolCalendar:
    @staticmethod
    def today() -> date:
        return datetime.now(ZoneInfo(settings.TIMEZONE)).date()
