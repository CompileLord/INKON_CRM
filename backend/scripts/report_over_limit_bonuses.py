import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scoring import ScoringPolicy
from app.db.session import AsyncSessionLocal
from app.models.course import Course
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User


@dataclass(frozen=True)
class OverLimitBonus:
    summary_id: int
    journal_id: int
    course_title: str
    period_label: str
    student_id: int
    student_name: str
    bonus_score: int
    bonus_max_score: int


class OverLimitBonusReport:
    def __init__(self, session: AsyncSession) -> None:
        self.session: AsyncSession = session

    async def collect(self) -> list[OverLimitBonus]:
        effective_maximum = func.coalesce(Journal.bonus_max_score, ScoringPolicy.DEFAULT_BONUS_MAX_SCORE)
        statement = (
            select(JournalStudentSummary, Journal, Course, User, effective_maximum)
            .join(Journal, Journal.id == JournalStudentSummary.journal_id)
            .join(Course, Course.id == Journal.course_id)
            .join(User, User.id == JournalStudentSummary.student_id)
            .where(JournalStudentSummary.bonus_score > effective_maximum)
            .order_by(Course.title, Journal.period_start, User.last_name, User.first_name)
        )
        result = await self.session.execute(statement)
        return [
            OverLimitBonus(
                summary_id=summary.id,
                journal_id=journal.id,
                course_title=course.title,
                period_label=journal.period_label,
                student_id=student.id,
                student_name=f"{student.first_name} {student.last_name}",
                bonus_score=summary.bonus_score,
                bonus_max_score=int(maximum),
            )
            for summary, journal, course, student, maximum in result.all()
        ]

    @staticmethod
    def render(rows: list[OverLimitBonus]) -> str:
        if not rows:
            return "No summaries have a bonus above the journal bonus maximum."
        lines: list[str] = ["summary_id\tjournal_id\tcourse\tperiod\tstudent\tbonus\tmaximum"]
        for row in rows:
            lines.append(
                f"{row.summary_id}\t{row.journal_id}\t{row.course_title}\t{row.period_label}\t"
                f"{row.student_name} (#{row.student_id})\t{row.bonus_score}\t{row.bonus_max_score}"
            )
        lines.append(f"{len(rows)} summaries over the limit (not modified).")
        return "\n".join(lines)


async def run_report() -> None:
    async with AsyncSessionLocal() as session:
        rows: list[OverLimitBonus] = await OverLimitBonusReport(session).collect()
    print(OverLimitBonusReport.render(rows))


if __name__ == "__main__":
    asyncio.run(run_report())
