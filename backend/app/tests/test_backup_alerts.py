import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserRole
from app.repositories.interfaces.admin_contact_repository import AdminContact
from app.repositories.sqlalchemy.admin_contact_repository import SQLAlchemyAdminContactRepository
from app.services.backup_alert_service import AlertDeliveryReport, BackupAlertService, parse_recipient_list
from app.services.sms.sender import SmsDeliveryError
from app.tests.factories import create_user
from app.tests.sms_fakes import FakeSmsSender

SUBJECT: str = "[IMKON] imkon-backup.service failed"
MESSAGE: str = "host=vps unit=imkon-backup.service time=2026-10-30T03:00:00Z"


class RecordedEmail:
    def __init__(self, to_email: str, subject: str, body: str, force_transport: bool) -> None:
        self.to_email: str = to_email
        self.subject: str = subject
        self.body: str = body
        self.force_transport: bool = force_transport


class FakeEmailSender:
    def __init__(self, failing_addresses: set[str] | None = None) -> None:
        self.sent: list[RecordedEmail] = []
        self.failing_addresses: set[str] = failing_addresses or set()

    async def send_email(self, to_email: str, subject: str, body: str, force_transport: bool = False) -> None:
        if to_email in self.failing_addresses:
            raise RuntimeError("smtp down")
        self.sent.append(RecordedEmail(to_email, subject, body, force_transport))


def loader_returning(contacts: list[AdminContact]):
    async def load() -> list[AdminContact]:
        return contacts

    return load


async def failing_loader() -> list[AdminContact]:
    raise ConnectionError("database unreachable")


def build_service(
    contacts_loader,
    email_sender: FakeEmailSender,
    sms_sender: FakeSmsSender | None,
    extra_emails: str | None = None,
    extra_phones: str | None = None,
) -> BackupAlertService:
    return BackupAlertService(contacts_loader, email_sender, sms_sender, extra_emails, extra_phones)


@pytest.mark.asyncio
async def test_superadmin_with_email_and_phone_receives_both_channels(db_session: AsyncSession) -> None:
    await create_user(db_session, UserRole.SUPERADMIN, email="boss@example.com", phone="+992900000001")
    email_sender: FakeEmailSender = FakeEmailSender()
    sms_sender: FakeSmsSender = FakeSmsSender()
    contacts: list[AdminContact] = await SQLAlchemyAdminContactRepository(db_session).list_superadmin_contacts()

    report: AlertDeliveryReport = await build_service(loader_returning(contacts), email_sender, sms_sender).notify(SUBJECT, MESSAGE)

    assert report.succeeded and report.delivered_count == 2
    assert [(sent.to_email, sent.force_transport, sent.body) for sent in email_sender.sent] == [("boss@example.com", True, MESSAGE)]
    assert [send.phone_e164 for send in sms_sender.sends] == ["+992900000001"]


@pytest.mark.asyncio
async def test_superadmin_without_phone_receives_email_only(db_session: AsyncSession) -> None:
    await create_user(db_session, UserRole.SUPERADMIN, email="boss@example.com", phone=None)
    email_sender: FakeEmailSender = FakeEmailSender()
    sms_sender: FakeSmsSender = FakeSmsSender()
    contacts: list[AdminContact] = await SQLAlchemyAdminContactRepository(db_session).list_superadmin_contacts()

    report: AlertDeliveryReport = await build_service(loader_returning(contacts), email_sender, sms_sender).notify(SUBJECT, MESSAGE)

    assert report.delivered_count == 1
    assert len(email_sender.sent) == 1
    assert sms_sender.sends == []


@pytest.mark.asyncio
async def test_sms_skipped_when_sms_is_not_configured(db_session: AsyncSession) -> None:
    await create_user(db_session, UserRole.SUPERADMIN, email="boss@example.com", phone="+992900000001")
    email_sender: FakeEmailSender = FakeEmailSender()
    contacts: list[AdminContact] = await SQLAlchemyAdminContactRepository(db_session).list_superadmin_contacts()

    report: AlertDeliveryReport = await build_service(loader_returning(contacts), email_sender, None).notify(SUBJECT, MESSAGE)

    assert report.delivered_count == 1


@pytest.mark.asyncio
async def test_repository_excludes_soft_deleted_and_non_superadmin_users(db_session: AsyncSession) -> None:
    await create_user(db_session, UserRole.SUPERADMIN, email="live@example.com", phone="+992900000001")
    await create_user(db_session, UserRole.SUPERADMIN, email="deleted@example.com", phone="+992900000002", is_deleted=True)
    await create_user(db_session, UserRole.MENTOR, email="mentor@example.com", phone="+992900000003")
    await create_user(db_session, UserRole.ACCOUNTANT, email="accountant@example.com", phone="+992900000004")

    contacts: list[AdminContact] = await SQLAlchemyAdminContactRepository(db_session).list_superadmin_contacts()

    assert contacts == [AdminContact(email="live@example.com", phone="+992900000001")]


def test_parse_recipient_list_trims_and_ignores_empty_entries() -> None:
    assert parse_recipient_list(" a@example.com , ,b@example.com,, ", case_insensitive=True) == ["a@example.com", "b@example.com"]
    assert parse_recipient_list(None, case_insensitive=True) == []
    assert parse_recipient_list("", case_insensitive=False) == []


def test_parse_recipient_list_deduplicates_emails_case_insensitively_and_phones_exactly() -> None:
    assert parse_recipient_list("A@example.com,a@EXAMPLE.com", case_insensitive=True) == ["A@example.com"]
    assert parse_recipient_list("+992900000001,+992900000001,+992900000002", case_insensitive=False) == ["+992900000001", "+992900000002"]


@pytest.mark.asyncio
async def test_extras_are_notified_even_when_admins_succeed() -> None:
    contacts: list[AdminContact] = [AdminContact(email="boss@example.com", phone=None)]
    email_sender: FakeEmailSender = FakeEmailSender()
    sms_sender: FakeSmsSender = FakeSmsSender()
    service: BackupAlertService = build_service(
        loader_returning(contacts), email_sender, sms_sender, "ops@example.com, second@example.com", "+992900000009"
    )

    report: AlertDeliveryReport = await service.notify(SUBJECT, MESSAGE)

    assert report.succeeded and report.delivered_count == 4
    assert [sent.to_email for sent in email_sender.sent] == ["boss@example.com", "ops@example.com", "second@example.com"]
    assert [send.phone_e164 for send in sms_sender.sends] == ["+992900000009"]


@pytest.mark.asyncio
async def test_extras_matching_superadmin_contacts_are_not_notified_twice() -> None:
    contacts: list[AdminContact] = [AdminContact(email="Boss@Example.com", phone="+992900000001")]
    email_sender: FakeEmailSender = FakeEmailSender()
    sms_sender: FakeSmsSender = FakeSmsSender()
    service: BackupAlertService = build_service(
        loader_returning(contacts), email_sender, sms_sender, "boss@example.com,ops@example.com", "+992900000001,+992900000009"
    )

    report: AlertDeliveryReport = await service.notify(SUBJECT, MESSAGE)

    assert report.delivered_count == 4
    assert [sent.to_email for sent in email_sender.sent] == ["Boss@Example.com", "ops@example.com"]
    assert [send.phone_e164 for send in sms_sender.sends] == ["+992900000001", "+992900000009"]


@pytest.mark.asyncio
async def test_no_admin_found_still_notifies_extras() -> None:
    email_sender: FakeEmailSender = FakeEmailSender()
    sms_sender: FakeSmsSender = FakeSmsSender()
    service: BackupAlertService = build_service(loader_returning([]), email_sender, sms_sender, "ops@example.com", "+992900000009")

    report: AlertDeliveryReport = await service.notify(SUBJECT, MESSAGE)

    assert report.succeeded
    assert [sent.to_email for sent in email_sender.sent] == ["ops@example.com"]
    assert [send.phone_e164 for send in sms_sender.sends] == ["+992900000009"]


@pytest.mark.asyncio
async def test_database_failure_still_notifies_extras() -> None:
    email_sender: FakeEmailSender = FakeEmailSender()
    sms_sender: FakeSmsSender = FakeSmsSender()
    service: BackupAlertService = build_service(failing_loader, email_sender, sms_sender, "ops@example.com,second@example.com", "+992900000009")

    report: AlertDeliveryReport = await service.notify(SUBJECT, MESSAGE)

    assert report.succeeded and report.delivered_count == 3
    assert [sent.to_email for sent in email_sender.sent] == ["ops@example.com", "second@example.com"]
    assert [send.phone_e164 for send in sms_sender.sends] == ["+992900000009"]
    assert "admin_lookup_failed:ConnectionError" in report.failures


@pytest.mark.asyncio
async def test_invalid_extra_phone_is_skipped_without_blocking_others() -> None:
    email_sender: FakeEmailSender = FakeEmailSender()
    sms_sender: FakeSmsSender = FakeSmsSender()
    service: BackupAlertService = build_service(loader_returning([]), email_sender, sms_sender, "ops@example.com", "not-a-phone,+992900000009")

    report: AlertDeliveryReport = await service.notify(SUBJECT, MESSAGE)

    assert report.succeeded and report.delivered_count == 2
    assert [send.phone_e164 for send in sms_sender.sends] == ["+992900000009"]
    assert "sms_invalid_phone" in report.failures


@pytest.mark.asyncio
async def test_failing_extra_email_does_not_stop_other_extras() -> None:
    email_sender: FakeEmailSender = FakeEmailSender(failing_addresses={"ops@example.com"})
    service: BackupAlertService = build_service(loader_returning([]), email_sender, None, "ops@example.com,second@example.com")

    report: AlertDeliveryReport = await service.notify(SUBJECT, MESSAGE)

    assert report.succeeded and report.delivered_count == 1
    assert [sent.to_email for sent in email_sender.sent] == ["second@example.com"]


@pytest.mark.asyncio
async def test_no_admin_and_no_extras_reports_failure() -> None:
    report: AlertDeliveryReport = await build_service(loader_returning([]), FakeEmailSender(), FakeSmsSender()).notify(SUBJECT, MESSAGE)

    assert not report.succeeded
    assert "no_recipient_available" in report.failures


@pytest.mark.asyncio
async def test_failing_email_does_not_stop_sms() -> None:
    contacts: list[AdminContact] = [AdminContact(email="boss@example.com", phone="+992900000001")]
    email_sender: FakeEmailSender = FakeEmailSender(failing_addresses={"boss@example.com"})
    sms_sender: FakeSmsSender = FakeSmsSender()

    report: AlertDeliveryReport = await build_service(loader_returning(contacts), email_sender, sms_sender).notify(SUBJECT, MESSAGE)

    assert report.succeeded
    assert [send.phone_e164 for send in sms_sender.sends] == ["+992900000001"]
    assert "email_failed:RuntimeError" in report.failures


@pytest.mark.asyncio
async def test_failing_sms_does_not_stop_email() -> None:
    contacts: list[AdminContact] = [AdminContact(email="boss@example.com", phone="+992900000001")]
    email_sender: FakeEmailSender = FakeEmailSender()
    sms_sender: FakeSmsSender = FakeSmsSender([SmsDeliveryError("provider_http_500", retryable=True)])

    report: AlertDeliveryReport = await build_service(loader_returning(contacts), email_sender, sms_sender).notify(SUBJECT, MESSAGE)

    assert report.succeeded
    assert [sent.to_email for sent in email_sender.sent] == ["boss@example.com"]
    assert "sms_failed:SmsDeliveryError" in report.failures


@pytest.mark.asyncio
async def test_nothing_delivered_reports_failure() -> None:
    contacts: list[AdminContact] = [AdminContact(email="boss@example.com", phone=None)]
    email_sender: FakeEmailSender = FakeEmailSender(failing_addresses={"boss@example.com", "ops@example.com"})

    report: AlertDeliveryReport = await build_service(loader_returning(contacts), email_sender, None, "ops@example.com").notify(SUBJECT, MESSAGE)

    assert not report.succeeded
    assert report.failures == ["email_failed:RuntimeError", "email_failed:RuntimeError"]
