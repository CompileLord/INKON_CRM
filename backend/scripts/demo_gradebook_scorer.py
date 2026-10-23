from datetime import date
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary


class DemoGradebookScorer:
    @staticmethod
    def score_entries(student_id: int, student_entries: list[JournalEntry], today: date) -> None:
        performance_profile: int = student_id % 3
        entry_idx: int
        entry: JournalEntry
        for entry_idx, entry in enumerate(student_entries):
            if entry.lesson_date > today:
                continue
            if performance_profile == 0:
                entry.attendance = True
                entry.score = 4 if entry_idx % 4 == 0 else 5
            elif performance_profile == 1:
                entry.attendance = True
                entry.score = 3 if entry_idx % 3 == 0 else 4
            elif entry_idx == 1 or entry_idx == 5:
                entry.attendance = False
                entry.score = 0
            else:
                entry.attendance = True
                entry.score = 2 if entry_idx % 2 == 0 else 3
            entry.is_graded = True

    @staticmethod
    def score_summary(summary: JournalStudentSummary, journal: Journal, today: date) -> None:
        if journal.period_start > today:
            return
        performance_profile: int = summary.student_id % 3
        if performance_profile == 0:
            summary.exam_score = max(0, journal.exam_max_score - (summary.student_id % 3))
            summary.bonus_score = min(5, summary.student_id % 4)
        elif performance_profile == 1:
            summary.exam_score = max(0, int(journal.exam_max_score * 0.8) - (summary.student_id % 4))
            summary.bonus_score = 0
        else:
            summary.exam_score = max(0, int(journal.exam_max_score * 0.6) - (summary.student_id % 5))
            summary.bonus_score = 0
        summary.is_graded = True
