from alembic import op
import sqlalchemy as sa

revision: str = "rwp31_exam_revision"
down_revision: str = "5c1b0a7e9d21"
branch_labels: None = None
depends_on: None = None


class CutoverFingerprint:
    @classmethod
    def expression(cls) -> str:
        values: tuple[str, ...] = (
            "summary.version::text",
            "summary.sum_score::text",
            "summary.max_period_score::text",
            "summary.attendance_count::text",
            "summary.total_lessons::text",
            "journal.period_label",
            "course.title",
            "COALESCE(document.id, 0)::text",
            "COALESCE(document.file_path, '')",
        )
        parts: list[str] = [f"octet_length(convert_to({value}, 'UTF8'))::text || ':' || {value}" for value in values]
        return "'v1:' || md5(" + " || ".join(parts) + ")"


def upgrade() -> None:
    inspector: sa.Inspector = sa.inspect(op.get_bind())
    existing: set[str] = {column["name"] for column in inspector.get_columns("notification_logs")}
    if "revision_fingerprint" not in existing:
        op.add_column("notification_logs", sa.Column("revision_fingerprint", sa.String(35), nullable=True))
    if "source_journal_id" not in existing:
        op.add_column("notification_logs", sa.Column("source_journal_id", sa.Integer(), nullable=True))
    if not inspector.has_table("exam_notification_baselines"):
        op.create_table(
            "exam_notification_baselines",
            sa.Column("recipient", sa.String(255), primary_key=True),
            sa.Column(
                "summary_id",
                sa.Integer(),
                sa.ForeignKey("journal_student_summaries.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("observed_fingerprint", sa.String(35), nullable=True),
            sa.Column("observed_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.execute(
            sa.text(
                "INSERT INTO exam_notification_baselines (recipient, summary_id, observed_fingerprint, observed_at) "
                "SELECT student.parent_telegram_chat_id::text, summary.id, "
                + CutoverFingerprint.expression()
                + ", CURRENT_TIMESTAMP "
                "FROM journal_student_summaries summary "
                "JOIN users student ON student.id = summary.student_id "
                "JOIN journals journal ON journal.id = summary.journal_id "
                "JOIN courses course ON course.id = journal.course_id "
                "LEFT JOIN LATERAL (SELECT id, file_path FROM documents "
                "WHERE owner_type = 'student' AND owner_id = student.id AND journal_id = journal.id AND NOT is_deleted "
                "ORDER BY uploaded_at DESC, id DESC LIMIT 1) document ON true "
                "WHERE student.parent_telegram_chat_id IS NOT NULL AND NOT student.is_deleted AND NOT course.is_deleted "
                "AND EXISTS (SELECT 1 FROM notification_logs legacy "
                "WHERE legacy.type = 'exam_result' AND legacy.related_entity_id = journal.id "
                "AND legacy.recipient = student.parent_telegram_chat_id::text "
                "AND COALESCE(legacy.delivery_state, legacy.status) = 'sent') "
                "ON CONFLICT (recipient, summary_id) DO NOTHING"
            )
        )


def downgrade() -> None:
    return None
