from app.models.course import CourseExamType

MAX_HOMEWORK_SCORE_PER_LESSON: int = 5
ATTENDANCE_POINT_PER_LESSON: int = 1
MAX_BONUS_SCORE: int = 20
EXAM_MAX_SCORE_LIMIT: int = 100
DEFAULT_EXAM_MAX_SCORE: dict[CourseExamType, int] = {
    CourseExamType.WEEKLY: 70,
    CourseExamType.MONTHLY: 60,
}


def default_exam_max_score(exam_type: CourseExamType | str) -> int:
    if isinstance(exam_type, str):
        try:
            exam_type = CourseExamType(exam_type)
        except ValueError:
            return 70
    return DEFAULT_EXAM_MAX_SCORE.get(exam_type, 70)


def max_period_score(total_lessons: int, exam_max_score: int) -> int:
    return total_lessons * (MAX_HOMEWORK_SCORE_PER_LESSON + ATTENDANCE_POINT_PER_LESSON) + exam_max_score


def score_percentage(sum_score: int, max_period_score_val: int) -> float:
    if max_period_score_val <= 0:
        return 0.0
    return round((sum_score / max_period_score_val) * 100.0, 2)
