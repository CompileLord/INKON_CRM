from alembic import op
import sqlalchemy as sa

revision: str = 'd025a01b34e5'
down_revision: str = 'd4e5f6a7b8c9'
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    op.create_table('storage_intents',
        sa.Column('id', sa.String(32), primary_key=True),
        sa.Column('object_key', sa.String(255), nullable=False),
        sa.Column('purpose', sa.String(16), nullable=False),
        sa.Column('state', sa.String(16), nullable=False),
        sa.Column('next_attempt_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('lease_token', sa.String(32)),
        sa.Column('lease_expires_at', sa.DateTime(timezone=True)),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('last_error', sa.Text()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_storage_intents_due', 'storage_intents', ['state', 'next_attempt_at'])


def downgrade() -> None:
    op.execute('LOCK TABLE storage_intents IN ACCESS EXCLUSIVE MODE')
    pending: int = op.get_bind().execute(sa.text('SELECT count(*) FROM storage_intents')).scalar_one()
    if pending:
        raise RuntimeError('Storage intents must be drained before downgrade')
    op.drop_index('ix_storage_intents_due', table_name='storage_intents')
    op.drop_table('storage_intents')
