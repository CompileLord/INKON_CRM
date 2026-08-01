import asyncio
import sys
import logging
from sqlalchemy import text
from app.db.session import engine, AsyncSessionLocal
from app.db.base import Base
import app.models.user
import app.models.course
import app.models.course_schedule
import app.models.course_mentor_history
import app.models.enrollment
import app.models.journal
import app.models.journal_entry
import app.models.journal_student_summary
import app.models.payment
import app.models.document
import app.models.notification_log
import app.models.audit_log
import app.models.refresh_token
from app.models.user import User, UserRole
from app.core.security import hash_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TABLES = [
    "refresh_tokens",
    "audit_logs",
    "notification_logs",
    "documents",
    "payments",
    "journal_student_summaries",
    "journal_entries",
    "journals",
    "enrollments",
    "course_mentor_history",
    "course_schedules",
    "courses",
    "users"
]

async def clean_database():
    logger.info("Cleaning database completely...")

    async with engine.begin() as conn:
        for tbl in TABLES:
            await conn.execute(text(f"TRUNCATE TABLE {tbl} RESTART IDENTITY CASCADE;"))

    logger.info("Database truncated successfully.")

    # Seed default superadmin user
    async with AsyncSessionLocal() as session:
        admin = User(
            email="admin@test.com",
            password_hash=hash_password("password123"),
            first_name="Admin",
            last_name="Super",
            role=UserRole.SUPERADMIN,
            must_set_password=False
        )
        session.add(admin)
        await session.commit()
        logger.info("Default SuperAdmin seeded successfully: admin@test.com / password123")

if __name__ == "__main__":
    try:
        asyncio.run(clean_database())
        print("DATABASE CLEANED AND RE-SEEDED SUCCESSFULLY!")
    except Exception as e:
        logger.error(f"Error cleaning database: {e}")
        sys.exit(1)
