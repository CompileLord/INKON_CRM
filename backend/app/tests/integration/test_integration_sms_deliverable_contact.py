import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outbox_event import OutboxEvent
from app.models.user import User
from app.tests.sms_test_support import SmsPasswordTestSupport

SHORT_PHONE: str = "+9929000"
VALID_PHONE: str = "+992900000002"


@pytest.mark.asyncio
async def test_create_with_only_short_student_phone_is_rejected_before_persisting(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    response: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, "short@example.com", SHORT_PHONE, None)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "phone"]
    assert (await db_session.execute(select(User).where(User.email == "short@example.com"))).scalar_one_or_none() is None
    assert await SmsPasswordTestSupport.sms_events(db_session) == []


@pytest.mark.asyncio
async def test_create_with_short_phones_on_both_contacts_is_rejected(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    response: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, "both@example.com", SHORT_PHONE, "+9929001")
    assert response.status_code == 422
    assert await SmsPasswordTestSupport.sms_events(db_session) == []


@pytest.mark.asyncio
async def test_short_student_phone_with_valid_parent_phone_sends_to_parent(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    response: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, "parent@example.com", SHORT_PHONE, VALID_PHONE)
    assert response.status_code == 201
    assert response.json()["password_sms_destination"] == "parent_phone"
    events: list[OutboxEvent] = await SmsPasswordTestSupport.sms_events(db_session, response.json()["id"])
    assert len(events) == 1 and events[0].recipient_phone == VALID_PHONE


@pytest.mark.asyncio
async def test_update_to_only_short_phones_is_rejected_and_keeps_stored_contacts(
    client: AsyncClient, test_admin: User, test_student: User, db_session: AsyncSession
) -> None:
    student_id: int = test_student.id
    test_student.phone = "+992900000001"
    test_student.parent_phone = None
    db_session.add(test_student)
    await db_session.commit()
    response: Response = await client.patch(
        f"/api/v1/users/{student_id}", json={"phone": SHORT_PHONE}, headers=SmsPasswordTestSupport.bearer(test_admin)
    )
    assert response.status_code == 422
    db_session.expire_all()
    stored: User = (await db_session.execute(select(User).where(User.id == student_id))).scalar_one()
    assert stored.phone == "+992900000001"
