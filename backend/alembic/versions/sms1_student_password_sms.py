from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "sms1a7c3e9b2d10"
down_revision: str | None = "fin1a7d3e5b9c10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE outbox_event_kind ADD VALUE IF NOT EXISTS 'student_password_sms'")
    op.add_column("outbox_events", sa.Column("recipient_phone", sa.String(length=20), nullable=True))
    op.add_column("outbox_events", sa.Column("target_user_id", sa.Integer(), nullable=True))
    op.add_column("outbox_events", sa.Column("provider_message_id", sa.String(length=100), nullable=True))
    op.add_column("outbox_events", sa.Column("provider_status", sa.String(length=20), nullable=True))
    op.create_index(
        "ix_outbox_events_kind_target_user_id", "outbox_events", ["kind", "target_user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_outbox_events_kind_target_user_id", table_name="outbox_events")
    op.drop_column("outbox_events", "provider_status")
    op.drop_column("outbox_events", "provider_message_id")
    op.drop_column("outbox_events", "target_user_id")
    op.drop_column("outbox_events", "recipient_phone")
