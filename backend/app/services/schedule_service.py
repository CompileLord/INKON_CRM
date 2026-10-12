from datetime import date, datetime, timedelta
from typing import Callable, Optional, Sequence
from zoneinfo import ZoneInfo
from app.core.config import settings
from app.schemas.schedule import CourseScheduleRuleDTO, ScheduleRuleProtocol

ScheduleRuleDTO = CourseScheduleRuleDTO


class LessonScheduleService:
    def __init__(
        self,
        timezone_name: str = settings.TIMEZONE,
        clock: Optional[Callable[[], datetime]] = None
    ) -> None:
        self.timezone_name = timezone_name
        self.tz = ZoneInfo(timezone_name)
        self._clock = clock

    def get_current_time(self) -> datetime:
        if self._clock is not None:
            current = self._clock()
            if current.tzinfo is None:
                return current.replace(tzinfo=self.tz)
            return current.astimezone(self.tz)
        return datetime.now(self.tz)

    def calculate_next_lesson_at(
        self,
        start_date: date,
        end_date: date,
        is_active: bool,
        schedules: Sequence[ScheduleRuleProtocol],
        current_time: Optional[datetime] = None,
    ) -> Optional[datetime]:
        if not is_active:
            return None
        if not schedules:
            return None
        if start_date > end_date:
            return None

        now = current_time if current_time is not None else self.get_current_time()
        if now.tzinfo is None:
            now = now.replace(tzinfo=self.tz)
        else:
            now = now.astimezone(self.tz)

        current_date = now.date()
        if current_date > end_date:
            return None

        search_start_date = max(current_date, start_date)
        if search_start_date > end_date:
            return None

        earliest_lesson: Optional[datetime] = None
        for day_offset in range(8):
            candidate_date = search_start_date + timedelta(days=day_offset)
            if candidate_date > end_date:
                break
            candidate_weekday = candidate_date.weekday()
            for schedule in schedules:
                if schedule.day_of_week == candidate_weekday:
                    candidate_dt = datetime.combine(
                        candidate_date,
                        schedule.time_start,
                        tzinfo=self.tz
                    )
                    if candidate_dt > now:
                        if earliest_lesson is None or candidate_dt < earliest_lesson:
                            earliest_lesson = candidate_dt
            if earliest_lesson is not None:
                break

        return earliest_lesson
