"""Add performance indexes

Revision ID: a1b2c3d4e5f6
Revises: c592774b16d3
Create Date: 2026-07-12 12:20:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'c592774b16d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add composite indexes for hot query paths."""
    # Journal entries: used in journal retrieval (batch-loaded by journal_id + student_id)
    op.create_index(
        'ix_journal_entries_journal_student',
        'journal_entries',
        ['journal_id', 'student_id']
    )

    # Journal student summaries: lookups always by (journal_id, student_id), should be unique
    op.create_index(
        'ix_journal_student_summary_journal_student',
        'journal_student_summaries',
        ['journal_id', 'student_id'],
        unique=True
    )

    # Enrollments: enrollment checks, journal views filter by course + student + is_deleted
    op.create_index(
        'ix_enrollments_course_student_deleted',
        'enrollments',
        ['course_id', 'student_id', 'is_deleted']
    )

    # Enrollments: student profile aggregation filters by student + is_deleted
    op.create_index(
        'ix_enrollments_student_deleted',
        'enrollments',
        ['student_id', 'is_deleted']
    )

    # Payments: debt calculation joins on (student_id, course_id)
    op.create_index(
        'ix_payments_student_course',
        'payments',
        ['student_id', 'course_id']
    )

    # Payments: analytics date filtering
    op.create_index(
        'ix_payments_paid_at',
        'payments',
        ['paid_at']
    )

    # Courses: listing filters by status + is_deleted
    op.create_index(
        'ix_courses_status_deleted',
        'courses',
        ['status', 'is_deleted']
    )

    # Courses: mentor course filtering
    op.create_index(
        'ix_courses_mentor_id',
        'courses',
        ['mentor_id']
    )

    # Notification logs: idempotency unique constraint
    op.create_index(
        'ix_notification_logs_idempotency',
        'notification_logs',
        ['recipient', 'type', 'related_entity_id', 'notification_date'],
        unique=True
    )


def downgrade() -> None:
    """Remove performance indexes."""
    op.drop_index('ix_notification_logs_idempotency', table_name='notification_logs')
    op.drop_index('ix_courses_mentor_id', table_name='courses')
    op.drop_index('ix_courses_status_deleted', table_name='courses')
    op.drop_index('ix_payments_paid_at', table_name='payments')
    op.drop_index('ix_payments_student_course', table_name='payments')
    op.drop_index('ix_enrollments_student_deleted', table_name='enrollments')
    op.drop_index('ix_enrollments_course_student_deleted', table_name='enrollments')
    op.drop_index('ix_journal_student_summary_journal_student', table_name='journal_student_summaries')
    op.drop_index('ix_journal_entries_journal_student', table_name='journal_entries')
