from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "rwp64_roster_index"
down_revision: str = "rwp45_refresh_retention"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_NAME: str = "ix_enrollments_course_student_live"


def upgrade() -> None:
    with op.get_context().autocommit_block():
        if not op.get_context().as_sql:
            valid: bool | None = op.get_bind().execute(
                sa.text("SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:index_name)"),
                {"index_name": INDEX_NAME},
            ).scalar_one_or_none()
            if valid is False:
                op.drop_index(
                    INDEX_NAME,
                    table_name="enrollments",
                    postgresql_concurrently=True,
                    if_exists=True,
                )
        op.create_index(
            INDEX_NAME,
            "enrollments",
            ["course_id", "student_id"],
            postgresql_where=sa.text("is_deleted = false"),
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            INDEX_NAME,
            table_name="enrollments",
            postgresql_concurrently=True,
            if_exists=True,
        )
