from app.models.course import CourseExamType


class ScoringPolicy:
    MAX_HOMEWORK_SCORE_PER_LESSON: int = 5
    ATTENDANCE_POINT_PER_LESSON: int = 1
    DEFAULT_BONUS_MAX_SCORE: int = 20
    BONUS_MAX_SCORE_LIMIT: int = 100
    EXAM_MAX_SCORE_LIMIT: int = 100
    DEFAULT_JOURNAL_EXAM_MAX_SCORE: int = 70
    DEFAULT_EXAM_MAX_SCORE: dict[CourseExamType, int] = {
        CourseExamType.WEEKLY: 70,
        CourseExamType.MONTHLY: 60,
    }

    @classmethod
    def default_exam_max_score(cls, exam_type: CourseExamType | str) -> int:
        if isinstance(exam_type, str):
            try:
                exam_type = CourseExamType(exam_type)
            except ValueError:
                return cls.DEFAULT_JOURNAL_EXAM_MAX_SCORE
        return cls.DEFAULT_EXAM_MAX_SCORE.get(exam_type, cls.DEFAULT_JOURNAL_EXAM_MAX_SCORE)

    @classmethod
    def resolve_bonus_max_score(cls, bonus_max_score: int | None) -> int:
        return cls.DEFAULT_BONUS_MAX_SCORE if bonus_max_score is None else bonus_max_score

    @classmethod
    def max_period_score(cls, scheduled_lessons: int, exam_max_score: int, bonus_max_score: int | None) -> int:
        homework_maximum: int = scheduled_lessons * cls.MAX_HOMEWORK_SCORE_PER_LESSON
        attendance_maximum: int = scheduled_lessons * cls.ATTENDANCE_POINT_PER_LESSON
        return homework_maximum + attendance_maximum + exam_max_score + cls.resolve_bonus_max_score(bonus_max_score)

    @staticmethod
    def percentage(sum_score: float | int | None, max_period_score: float | int | None) -> float:
        sum_value: float = float(sum_score or 0.0)
        max_value: float = float(max_period_score or 0.0)
        if max_value <= 0.0:
            return 0.0
        return round((sum_value / max_value) * 100.0, 2)
