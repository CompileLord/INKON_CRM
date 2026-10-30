import argparse
import asyncio
import logging
import os
import sys

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.repositories.interfaces.admin_contact_repository import AdminContact
from app.repositories.sqlalchemy.admin_contact_repository import SQLAlchemyAdminContactRepository
from app.services.backup_alert_service import AlertDeliveryReport, BackupAlertService
from app.services.email_service import EmailService
from app.services.sms.sender import PayomchiSmsSender, SmsSender


class NotifyAdminsCommand:
    @staticmethod
    async def load_admin_contacts() -> list[AdminContact]:
        session: AsyncSession
        async with AsyncSessionLocal() as session:
            return await SQLAlchemyAdminContactRepository(session).list_superadmin_contacts()

    @classmethod
    async def run(cls, subject: str, message: str) -> int:
        sms_sender: SmsSender | None = PayomchiSmsSender() if settings.SMS_API_KEY else None
        service: BackupAlertService = BackupAlertService(
            admin_contact_loader=cls.load_admin_contacts,
            email_sender=EmailService(),
            sms_sender=sms_sender,
            fallback_email=os.environ.get("BACKUP_ALERT_EMAIL"),
            fallback_phone=os.environ.get("BACKUP_ALERT_PHONE"),
        )
        try:
            report: AlertDeliveryReport = await service.notify(subject, message)
        finally:
            if isinstance(sms_sender, PayomchiSmsSender):
                await sms_sender.aclose()
        if report.succeeded:
            print(f"Alert delivered through {report.delivered_count} channel(s)")
            return 0
        print(f"ALERT DELIVERY FAILED: {', '.join(report.failures)}", file=sys.stderr)
        return 1

    @classmethod
    def main(cls) -> None:
        parser: argparse.ArgumentParser = argparse.ArgumentParser(description="Alert superadmins about a failed host job")
        parser.add_argument("--subject", required=True)
        parser.add_argument("--message", required=True)
        arguments: argparse.Namespace = parser.parse_args()
        logging.basicConfig(level=logging.INFO, stream=sys.stderr)
        try:
            exit_code: int = asyncio.run(cls.run(arguments.subject, arguments.message))
        except Exception as error:
            print(f"ALERT DELIVERY FAILED: {type(error).__name__}", file=sys.stderr)
            exit_code = 1
        raise SystemExit(exit_code)


if __name__ == "__main__":
    NotifyAdminsCommand.main()
