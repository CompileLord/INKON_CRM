from alembic import op
import sqlalchemy as sa

revision: str = "rwp33_grading_state"
down_revision: str = "rwp31_exam_revision"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    inspector: sa.Inspector = sa.inspect(op.get_bind())
    table: str
    for table in ("journal_entries", "journal_student_summaries"):
        columns: set[str] = {column["name"] for column in inspector.get_columns(table)}
        if "is_graded" not in columns:
            op.add_column(table, sa.Column("is_graded", sa.Boolean(), nullable=True))
    op.execute(
        sa.text(
            "UPDATE journal_entries entry SET is_graded=true WHERE entry.is_graded IS NULL AND EXISTS ("
            "SELECT 1 FROM audit_logs audit WHERE audit.entity_type='journal_entry' AND audit.entity_id=entry.id "
            "AND audit.action='update' AND (audit.field_name IN ('score','attendance','comment') OR (audit.field_name='is_graded' AND lower(audit.new_value)='true')))"
        )
    )
    op.execute(
        sa.text(
            "UPDATE journal_student_summaries summary SET is_graded=true WHERE summary.is_graded IS NULL AND ("
            "EXISTS (SELECT 1 FROM journal_entries entry WHERE entry.journal_id=summary.journal_id "
            "AND entry.student_id=summary.student_id AND entry.is_graded IS TRUE) OR EXISTS ("
            "SELECT 1 FROM audit_logs audit WHERE audit.entity_type='journal_student_summary' AND audit.entity_id=summary.id "
            "AND audit.action='update' AND (audit.field_name IN ('exam_score','bonus_score') OR (audit.field_name='is_graded' AND lower(audit.new_value)='true'))))"
        )
    )


def downgrade() -> None:
    return None
