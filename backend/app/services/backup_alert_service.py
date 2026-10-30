import logging
import uuid
from dataclasses import dataclass, field
from typing import Awaitable, Callable
from typing_extensions import Protocol

from app.repositories.interfaces.admin_contact_repository import AdminContact
from app.services.sms.sender import ProviderPhoneFormatter, SmsSender

logger: logging.Logger = logging.getLogger("backup_alert")

SMS_MAXIMUM_CHARACTERS: int = 300


class AlertEmailSender(Protocol):
    async def send_email(self, to_email: str, subject: str, body: str, force_transport: bool = False) -> None:
        ...


AdminContactLoader = Callable[[], Awaitable[list[AdminContact]]]


@dataclass(frozen=True)
class AlertRecipients:
    emails: list[str]
    phones: list[str]


@dataclass
class AlertDeliveryReport:
    delivered_count: int = 0
    failures: list[str] = field(default_factory=list)

    @property
    def succeeded(self) -> bool:
        return self.delivered_count > 0


class BackupAlertService:
    def __init__(
        self,
        admin_contact_loader: AdminContactLoader,
        email_sender: AlertEmailSender,
        sms_sender: SmsSender | None,
        fallback_email: str | None,
        fallback_phone: str | None,
    ) -> None:
        self._admin_contact_loader: AdminContactLoader = admin_contact_loader
        self._email_sender: AlertEmailSender = email_sender
        self._sms_sender: SmsSender | None = sms_sender
        self._fallback_email: str | None = fallback_email or None
        self._fallback_phone: str | None = fallback_phone or None
        self._phone_formatter: ProviderPhoneFormatter = ProviderPhoneFormatter()

    async def notify(self, subject: str, message: str) -> AlertDeliveryReport:
        report: AlertDeliveryReport = AlertDeliveryReport()
        admin_recipients: AlertRecipients = await self._load_admin_recipients(report)
        await self._deliver(admin_recipients, subject, message, report)
        if report.succeeded:
            return report
        fallback_recipients: AlertRecipients = AlertRecipients(
            emails=[self._fallback_email] if self._fallback_email else [],
            phones=[self._fallback_phone] if self._fallback_phone else [],
        )
        if not fallback_recipients.emails and not fallback_recipients.phones:
            report.failures.append("no_recipient_available")
            return report
        await self._deliver(fallback_recipients, subject, message, report)
        return report

    async def _load_admin_recipients(self, report: AlertDeliveryReport) -> AlertRecipients:
        try:
            contacts: list[AdminContact] = await self._admin_contact_loader()
        except Exception as error:
            report.failures.append(f"admin_lookup_failed:{type(error).__name__}")
            logger.error("Admin lookup failed (%s); using fallback recipients", type(error).__name__)
            return AlertRecipients(emails=[], phones=[])
        emails: list[str] = []
        phones: list[str] = []
        for contact in contacts:
            if contact.email and contact.email.lower() not in (address.lower() for address in emails):
                emails.append(contact.email)
            if contact.phone and contact.phone not in phones:
                phones.append(contact.phone)
        return AlertRecipients(emails=emails, phones=phones)

    async def _deliver(
        self,
        recipients: AlertRecipients,
        subject: str,
        message: str,
        report: AlertDeliveryReport,
    ) -> None:
        for email in recipients.emails:
            try:
                await self._email_sender.send_email(email, subject, message, force_transport=True)
                report.delivered_count += 1
            except Exception as error:
                report.failures.append(f"email_failed:{type(error).__name__}")
                logger.error("Alert email failed (%s)", type(error).__name__)
        if self._sms_sender is None:
            return
        sms_text: str = f"{subject}\n{message}"[:SMS_MAXIMUM_CHARACTERS]
        for phone in recipients.phones:
            if not self._phone_formatter.is_deliverable(phone):
                report.failures.append("sms_invalid_phone")
                continue
            try:
                await self._sms_sender.send(phone, sms_text, f"backup-alert-{uuid.uuid4().hex}")
                report.delivered_count += 1
            except Exception as error:
                report.failures.append(f"sms_failed:{type(error).__name__}")
                logger.error("Alert SMS failed (%s)", type(error).__name__)
