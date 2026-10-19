from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "be2a1b2c3d4e"
down_revision: str = "e029a01b34e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("parent_link_code_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "telegram_link_codes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_by_chat_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("code_hash", name="uq_telegram_link_codes_code_hash"),
    )
    op.create_index("ix_telegram_link_codes_student_used", "telegram_link_codes", ["student_id", "used_at"])
    op.create_table(
        "telegram_chat_preferences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("chat_id", sa.BigInteger(), nullable=False),
        sa.Column("language", sa.String(2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("chat_id", name="uq_telegram_chat_preferences_chat_id"),
    )


def downgrade() -> None:
    op.drop_table("telegram_chat_preferences")
    op.drop_index("ix_telegram_link_codes_student_used", table_name="telegram_link_codes")
    op.drop_table("telegram_link_codes")
    op.drop_column("users", "parent_link_code_expires_at")
