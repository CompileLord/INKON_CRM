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


def parse_recipient_list(raw_value: str | None, case_insensitive: bool) -> list[str]:
    recipients: list[str] = []
    seen_keys: set[str] = set()
    for entry in (raw_value or "").split(","):
        cleaned_entry: str = entry.strip()
        if not cleaned_entry:
            continue
        key: str = cleaned_entry.lower() if case_insensitive else cleaned_entry
        if key in seen_keys:
            continue
        seen_keys.add(key)
        recipients.append(cleaned_entry)
    return recipients


class BackupAlertService:
    def __init__(
        self,
        admin_contact_loader: AdminContactLoader,
        email_sender: AlertEmailSender,
        sms_sender: SmsSender | None,
        extra_emails: str | None,
        extra_phones: str | None,
    ) -> None:
        self._admin_contact_loader: AdminContactLoader = admin_contact_loader
        self._email_sender: AlertEmailSender = email_sender
        self._sms_sender: SmsSender | None = sms_sender
        self._extra_emails: list[str] = parse_recipient_list(extra_emails, case_insensitive=True)
        self._extra_phones: list[str] = parse_recipient_list(extra_phones, case_insensitive=False)
        self._phone_formatter: ProviderPhoneFormatter = ProviderPhoneFormatter()

    async def notify(self, subject: str, message: str) -> AlertDeliveryReport:
        report: AlertDeliveryReport = AlertDeliveryReport()
        admin_recipients: AlertRecipients = await self._load_admin_recipients(report)
        recipients: AlertRecipients = AlertRecipients(
            emails=self._merge_unique(admin_recipients.emails, self._extra_emails, case_insensitive=True),
            phones=self._merge_unique(admin_recipients.phones, self._extra_phones, case_insensitive=False),
        )
        if not recipients.emails and not recipients.phones:
            report.failures.append("no_recipient_available")
            return report
        await self._deliver(recipients, subject, message, report)
        return report

    @staticmethod
    def _merge_unique(first: list[str], second: list[str], case_insensitive: bool) -> list[str]:
        merged: list[str] = []
        seen_keys: set[str] = set()
        for value in first + second:
            key: str = value.lower() if case_insensitive else value
            if key in seen_keys:
                continue
            seen_keys.add(key)
            merged.append(value)
        return merged

    async def _load_admin_recipients(self, report: AlertDeliveryReport) -> AlertRecipients:
        try:
            contacts: list[AdminContact] = await self._admin_contact_loader()
        except Exception as error:
            report.failures.append(f"admin_lookup_failed:{type(error).__name__}")
            logger.error("Admin lookup failed (%s); notifying configured recipients only", type(error).__name__)
            return AlertRecipients(emails=[], phones=[])
        return AlertRecipients(
            emails=[contact.email for contact in contacts if contact.email],
            phones=[contact.phone for contact in contacts if contact.phone],
        )

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
