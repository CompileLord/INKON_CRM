from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5c1b0a7e9d21"
down_revision: str = "rwp30_delivery_claims"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "journals",
        sa.Column("bonus_max_score", sa.Integer(), nullable=True, server_default="20"),
    )
    op.create_check_constraint(
        "check_bonus_max_score_range",
        "journals",
        "bonus_max_score IS NULL OR (bonus_max_score >= 0 AND bonus_max_score <= 100)",
    )
    op.drop_constraint("check_bonus_score_range", "journal_student_summaries", type_="check")
    op.create_check_constraint(
        "check_bonus_score_range",
        "journal_student_summaries",
        "bonus_score >= 0 AND bonus_score <= 100",
    )
    op.execute(
        """
        UPDATE journal_student_summaries AS summary
        SET max_period_score = summary.total_lessons * 6 + journal.exam_max_score + COALESCE(journal.bonus_max_score, 20)
        FROM journals AS journal
        WHERE journal.id = summary.journal_id
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE journal_student_summaries AS summary
        SET max_period_score = summary.total_lessons * 6 + journal.exam_max_score
        FROM journals AS journal
        WHERE journal.id = summary.journal_id
        """
    )
    op.drop_constraint("check_bonus_score_range", "journal_student_summaries", type_="check")
    op.execute(
        "ALTER TABLE journal_student_summaries ADD CONSTRAINT check_bonus_score_range "
        "CHECK (bonus_score >= 0 AND bonus_score <= 20) NOT VALID"
    )
    op.drop_constraint("check_bonus_max_score_range", "journals", type_="check")
    op.drop_column("journals", "bonus_max_score")
