from collections.abc import Sequence

from alembic import op


revision: str = "e029a01b34e5"
down_revision: str = "d025a01b34e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE outbox_event_kind ADD VALUE IF NOT EXISTS 'exam_result_notification'")
        op.execute("ALTER TYPE outbox_event_kind ADD VALUE IF NOT EXISTS 'document_notification'")


def downgrade() -> None:
    return None
