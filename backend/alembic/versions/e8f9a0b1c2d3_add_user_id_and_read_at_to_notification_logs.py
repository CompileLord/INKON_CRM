"""Add user_id and read_at to notification_logs

Revision ID: e8f9a0b1c2d3
Revises: 7d332ad357b9
Create Date: 2026-07-30 13:03:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8f9a0b1c2d3'
down_revision: Union[str, Sequence[str], None] = '7d332ad357b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('notification_logs', sa.Column('user_id', sa.Integer(), nullable=True))
    op.add_column('notification_logs', sa.Column('read_at', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        'fk_notification_logs_user_id_users',
        'notification_logs',
        'users',
        ['user_id'],
        ['id'],
        ondelete='SET NULL'
    )
    op.create_index('ix_notification_logs_user_id', 'notification_logs', ['user_id'], unique=False)
    op.create_index('ix_notification_logs_read_at', 'notification_logs', ['read_at'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_notification_logs_read_at', table_name='notification_logs')
    op.drop_index('ix_notification_logs_user_id', table_name='notification_logs')
    op.drop_constraint('fk_notification_logs_user_id_users', 'notification_logs', type_='foreignkey')
    op.drop_column('notification_logs', 'read_at')
    op.drop_column('notification_logs', 'user_id')
