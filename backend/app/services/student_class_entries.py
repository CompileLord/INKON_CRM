from datetime import date
from typing import Any
from app.core.school_calendar import SchoolCalendar


class StudentClassEntries:
    @staticmethod
    def project(entries: list[dict[str, Any]], is_self: bool) -> list[dict[str, Any]]:
        today: date = SchoolCalendar.today()
        return [
            {
                **entry,
                "attendance": None if entry["lesson_date"] > today else entry["attendance"],
                "comment": entry["comment"] if is_self else None,
                "has_comment": entry["has_comment"] if is_self else False,
            }
            for entry in entries
        ]
