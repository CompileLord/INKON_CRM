"""Journal scoring redesign: attendance score, exam weight per journal, bounded bonus and exam scores.

Note: Clamped exam/bonus values during upgrade are non-recoverable on downgrade.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, Sequence[str], None] = 'b7c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'journals',
        sa.Column('exam_max_score', sa.Integer(), server_default='70', nullable=False)
    )
    op.execute("UPDATE journals SET exam_max_score = 60 WHERE period_type = 'month'")

    op.add_column(
        'journal_student_summaries',
        sa.Column('homework_score', sa.Integer(), server_default='0', nullable=False)
    )
    op.add_column(
        'journal_student_summaries',
        sa.Column('attendance_score', sa.Integer(), server_default='0', nullable=False)
    )
    op.add_column(
        'journal_student_summaries',
        sa.Column('max_period_score', sa.Integer(), server_default='0', nullable=False)
    )

    op.execute("""
        UPDATE journal_student_summaries
        SET homework_score = sum_score - exam_score - bonus_score,
            attendance_score = attendance_count
    """)

    op.execute("UPDATE journal_student_summaries SET bonus_score = 20 WHERE bonus_score > 20")
    op.execute("""
        UPDATE journal_student_summaries s
        SET exam_score = j.exam_max_score
        FROM journals j
        WHERE j.id = s.journal_id AND s.exam_score > j.exam_max_score
    """)

    op.execute("""
        UPDATE journal_student_summaries s
        SET max_period_score = s.total_lessons * 6 + j.exam_max_score,
            sum_score = s.homework_score + s.attendance_score + s.exam_score + s.bonus_score
        FROM journals j
        WHERE j.id = s.journal_id
    """)

    op.create_check_constraint(
        'check_exam_max_score_range',
        'journals',
        'exam_max_score >= 0 AND exam_max_score <= 100'
    )
    op.create_check_constraint(
        'check_bonus_score_range',
        'journal_student_summaries',
        'bonus_score >= 0 AND bonus_score <= 20'
    )


def downgrade() -> None:
    op.drop_constraint('check_bonus_score_range', 'journal_student_summaries', type_='check')
    op.drop_constraint('check_exam_max_score_range', 'journals', type_='check')

    op.execute("""
        UPDATE journal_student_summaries
        SET sum_score = homework_score + exam_score + bonus_score
    """)

    op.drop_column('journal_student_summaries', 'max_period_score')
    op.drop_column('journal_student_summaries', 'attendance_score')
    op.drop_column('journal_student_summaries', 'homework_score')
    op.drop_column('journals', 'exam_max_score')
