from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "fa17c2e9b041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbox_event_kind') THEN
                    CREATE TYPE outbox_event_kind AS ENUM ('verification_email', 'password_reset_email');
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbox_event_status') THEN
                    CREATE TYPE outbox_event_status AS ENUM ('pending', 'claimed', 'delivered', 'failed', 'expired');
                END IF;
            END$$;
            """
        )
    )

    op.create_table(
        "outbox_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column(
            "kind",
            sa.Enum("verification_email", "password_reset_email", name="outbox_event_kind", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "claimed", "delivered", "failed", "expired", name="outbox_event_status", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("recipient_email", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("encrypted_payload", sa.Text(), nullable=True),
        sa.Column("correlation_key", sa.String(255), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("lease_owner", sa.String(255), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.text("now()"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(500), nullable=True),
    )

    op.create_index(
        "ix_outbox_events_status_next_attempt_at",
        "outbox_events",
        ["status", "next_attempt_at"],
    )
    op.create_index(
        "ix_outbox_events_correlation_key",
        "outbox_events",
        ["correlation_key"],
    )


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(sa.text("LOCK TABLE outbox_events IN ACCESS EXCLUSIVE MODE"))
    pending_count: int = connection.scalar(
        sa.text("SELECT count(*) FROM outbox_events WHERE status IN ('pending', 'claimed')")
    ) or 0
    if pending_count > 0:
        raise RuntimeError(
            f"Cannot downgrade outbox migration: {pending_count} pending or claimed mail intent(s) remain unprocessed"
        )
    op.drop_index("ix_outbox_events_correlation_key", table_name="outbox_events")
    op.drop_index("ix_outbox_events_status_next_attempt_at", table_name="outbox_events")
    op.drop_table("outbox_events")
    op.execute("DROP TYPE IF EXISTS outbox_event_status")
    op.execute("DROP TYPE IF EXISTS outbox_event_kind")
