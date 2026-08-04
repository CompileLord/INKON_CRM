from datetime import date, datetime, time, timedelta, timezone
from typing import List, Optional
from app.models.course_schedule import CourseSchedule


def compute_next_lesson_at(
    schedules: List[CourseSchedule],
    now: Optional[datetime] = None
) -> Optional[datetime]:
    if not schedules:
        return None
    if now is None:
        now = datetime.now()
    
    earliest_next: Optional[datetime] = None
    for day_offset in range(8):
        target_date = (now + timedelta(days=day_offset)).date()
        target_weekday = target_date.weekday()
        for schedule in schedules:
            if schedule.day_of_week == target_weekday:
                lesson_dt = datetime.combine(target_date, schedule.time_start)
                if lesson_dt > now:
                    if earliest_next is None or lesson_dt < earliest_next:
                        earliest_next = lesson_dt
    return earliest_next
