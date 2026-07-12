from datetime import date, timedelta
import calendar
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.course import Course, CourseExamType
from app.models.journal import Journal, JournalPeriodType


class JournalGenerationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def generate_journals(self, course: Course) -> List[Journal]:
        journals: List[Journal] = []
        start_date = course.start_date
        end_date = course.end_date

        if course.exam_type == CourseExamType.WEEKLY:
            curr_start = start_date
            week_idx = 1
            while curr_start <= end_date:
                curr_end = min(end_date, curr_start + timedelta(days=6))
                journal = Journal(
                    course_id=course.id,
                    period_label=f"Week {week_idx}",
                    period_start=curr_start,
                    period_end=curr_end,
                    period_type=JournalPeriodType.WEEK
                )
                self.db.add(journal)
                journals.append(journal)
                curr_start = curr_end + timedelta(days=1)
                week_idx += 1
        elif course.exam_type == CourseExamType.MONTHLY:
            curr_year = start_date.year
            curr_month = start_date.month
            month_idx = 1
            while True:
                _, last_day = calendar.monthrange(curr_year, curr_month)
                period_start = max(start_date, date(curr_year, curr_month, 1))
                period_end = min(end_date, date(curr_year, curr_month, last_day))

                journal = Journal(
                    course_id=course.id,
                    period_label=f"Month {month_idx}",
                    period_start=period_start,
                    period_end=period_end,
                    period_type=JournalPeriodType.MONTH
                )
                self.db.add(journal)
                journals.append(journal)

                if period_end >= end_date:
                    break

                if curr_month == 12:
                    curr_month = 1
                    curr_year += 1
                else:
                    curr_month += 1
                month_idx += 1

        await self.db.flush()
        return journals
