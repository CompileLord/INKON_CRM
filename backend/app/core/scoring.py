from app.models.course import CourseExamType

MAX_HOMEWORK_SCORE_PER_LESSON: int = 5
ATTENDANCE_POINT_PER_LESSON: int = 1
MAX_BONUS_SCORE: int = 20
EXAM_MAX_SCORE_LIMIT: int = 100

# Matches the journals.exam_max_score column default; used when a journal's own
# weight cannot be read.
DEFAULT_JOURNAL_EXAM_MAX_SCORE: int = 70

DEFAULT_EXAM_MAX_SCORE: dict[CourseExamType, int] = {
    CourseExamType.WEEKLY: 70,
    CourseExamType.MONTHLY: 60,
}


def default_exam_max_score(exam_type: CourseExamType | str) -> int:
    if isinstance(exam_type, str):
        try:
            exam_type = CourseExamType(exam_type)
        except ValueError:
            return DEFAULT_JOURNAL_EXAM_MAX_SCORE
    return DEFAULT_EXAM_MAX_SCORE.get(exam_type, DEFAULT_JOURNAL_EXAM_MAX_SCORE)


def max_period_score(total_lessons: int, exam_max_score: int) -> int:
    return total_lessons * (MAX_HOMEWORK_SCORE_PER_LESSON + ATTENDANCE_POINT_PER_LESSON) + exam_max_score


def score_percentage(sum_score: float | int | None, max_period_score_val: float | int | None) -> float:
    sum_val = float(sum_score or 0.0)
    max_val = float(max_period_score_val or 0.0)
    if max_val <= 0.0:
        return 0.0
    return round((sum_val / max_val) * 100.0, 2)
