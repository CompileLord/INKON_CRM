from sqlalchemy import ColumnElement, case
from app.models.journal_student_summary import JournalStudentSummary


class StudentCourseProgressQuery:
    @staticmethod
    def is_graded_condition() -> ColumnElement[bool]:
        return JournalStudentSummary.is_graded.is_(True)

    @staticmethod
    def percentage_expr() -> ColumnElement[float | None]:
        return case(
            (
                (JournalStudentSummary.is_graded.is_(True)) & (JournalStudentSummary.max_period_score > 0),
                JournalStudentSummary.sum_score * 100.0 / JournalStudentSummary.max_period_score,
            ),
            else_=None,
        )

    @staticmethod
    def is_summary_graded(is_graded: bool | None) -> bool:
        return is_graded is True
