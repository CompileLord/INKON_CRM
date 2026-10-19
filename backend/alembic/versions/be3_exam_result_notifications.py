from alembic import op
import sqlalchemy as sa

revision: str = "be3a1b2c3d4e"
down_revision: str = "be2a1b2c3d4e"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    op.create_table(
        "exam_result_notifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("journal_id", sa.Integer(), sa.ForeignKey("journals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("lease_owner", sa.String(64), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("send_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "uq_exam_result_notifications_pending_student_journal",
        "exam_result_notifications",
        ["student_id", "journal_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index(
        "ix_exam_result_notifications_status_due_at",
        "exam_result_notifications",
        ["status", "due_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_exam_result_notifications_status_due_at", table_name="exam_result_notifications")
    op.drop_index("uq_exam_result_notifications_pending_student_journal", table_name="exam_result_notifications")
    op.drop_table("exam_result_notifications")
