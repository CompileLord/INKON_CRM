from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from app.models.audit_log import AuditAction, AuditLog
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.user import User
from app.tests.conftest import TestingSessionLocal

AUDIT_URL: str = "/api/v1/audit-log/"


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


def _entry(
    user_id: int | None,
    action: AuditAction,
    entity_type: str,
    entity_id: int,
    field_name: str,
    created_at: datetime,
    new_value: str | None = "x",
) -> AuditLog:
    return AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        field_name=field_name,
        old_value=None,
        new_value=new_value,
        created_at=created_at,
    )


@pytest.fixture
async def seeded_course_id(test_admin: User, test_mentor: User) -> int:
    async with TestingSessionLocal() as session:
        course = Course(
            title="Audit Algebra",
            description="Course for audit labels",
            start_date=datetime(2026, 9, 1).date(),
            end_date=datetime(2026, 12, 1).date(),
            exam_type=CourseExamType.WEEKLY,
            price=100,
            mentor_id=test_mentor.id,
            status=CourseStatus.ACTIVE,
        )
        session.add(course)
        await session.flush()
        session.add_all(
            [
                _entry(test_admin.id, AuditAction.UPDATE, "course", course.id, "price", datetime(2026, 10, 1, 8, tzinfo=timezone.utc)),
                _entry(test_mentor.id, AuditAction.CREATE, "journal_entry", 7, "score", datetime(2026, 10, 2, 8, tzinfo=timezone.utc)),
                _entry(test_admin.id, AuditAction.DELETE, "journal_entry", 7, "score", datetime(2026, 10, 3, 8, tzinfo=timezone.utc)),
                _entry(None, AuditAction.CREATE, "payment", 5, "amount", datetime(2026, 10, 4, 8, tzinfo=timezone.utc)),
            ]
        )
        await session.commit()
        return course.id


async def _fetch(client: AsyncClient, admin: User, **params: object) -> dict:
    response = await client.get(AUDIT_URL, params=params, headers=_headers(admin))
    assert response.status_code == 200
    return response.json()


@pytest.mark.asyncio
async def test_actor_filter_matches_beyond_first_page(client: AsyncClient, test_admin: User, test_mentor: User, seeded_course_id: int) -> None:
    result = await _fetch(client, test_admin, actor_id=test_mentor.id, page_size=1)

    assert result["total"] == 1
    assert result["items"][0]["actor_name"] == "Mentor One"
    assert result["items"][0]["entity_type"] == "journal_entry"


@pytest.mark.asyncio
async def test_action_and_entity_filters_combine(client: AsyncClient, test_admin: User, seeded_course_id: int) -> None:
    result = await _fetch(client, test_admin, action="delete", entity_type="journal_entry", entity_id=7)
    mismatch = await _fetch(client, test_admin, action="delete", entity_type="payment")

    assert [item["action"] for item in result["items"]] == ["delete"]
    assert mismatch["total"] == 0


@pytest.mark.asyncio
async def test_date_range_is_inclusive_dushanbe_days(client: AsyncClient, test_admin: User, seeded_course_id: int) -> None:
    on_day = await _fetch(client, test_admin, date_from="2026-10-02", date_to="2026-10-02")
    spanning = await _fetch(client, test_admin, date_from="2026-10-02", date_to="2026-10-03")
    late_evening_local = AuditLog(
        user_id=None, action=AuditAction.CREATE, entity_type="late", entity_id=1, field_name="f",
        old_value=None, new_value="x", created_at=datetime(2026, 11, 5, 19, 30, tzinfo=timezone.utc),
    )
    async with TestingSessionLocal() as session:
        session.add(late_evening_local)
        await session.commit()
    next_local_day = await _fetch(client, test_admin, date_from="2026-11-06", date_to="2026-11-06")
    previous_local_day = await _fetch(client, test_admin, date_from="2026-11-05", date_to="2026-11-05")

    assert {item["entity_id"] for item in on_day["items"]} == {7}
    assert on_day["total"] == 1
    assert spanning["total"] == 2
    assert [item["entity_type"] for item in next_local_day["items"]] == ["late"]
    assert previous_local_day["total"] == 0


@pytest.mark.asyncio
async def test_search_scope_is_actor_name_entity_type_and_field(client: AsyncClient, test_admin: User, seeded_course_id: int) -> None:
    by_actor = await _fetch(client, test_admin, search="mentor one")
    by_entity = await _fetch(client, test_admin, search="journal_")
    by_field = await _fetch(client, test_admin, search="AMOUNT")
    literal_percent = await _fetch(client, test_admin, search="%")

    assert by_actor["total"] == 1
    assert by_entity["total"] == 2
    assert by_field["total"] == 1
    assert literal_percent["total"] == 0


@pytest.mark.asyncio
async def test_default_order_is_newest_first_and_totals_are_stable(client: AsyncClient, test_admin: User, seeded_course_id: int) -> None:
    first_page = await _fetch(client, test_admin, page_size=2, page=1)
    second_page = await _fetch(client, test_admin, page_size=2, page=2)

    assert first_page["total"] == second_page["total"] == 4
    assert first_page["total_pages"] == 2
    identifiers = [item["id"] for item in first_page["items"] + second_page["items"]]
    timestamps = [item["created_at"] for item in first_page["items"] + second_page["items"]]
    assert timestamps == sorted(timestamps, reverse=True)
    assert len(set(identifiers)) == 4


@pytest.mark.asyncio
async def test_order_follows_event_time_even_when_ids_disagree(client: AsyncClient, test_admin: User) -> None:
    async with TestingSessionLocal() as session:
        session.add_all(
            [
                _entry(test_admin.id, AuditAction.UPDATE, "course", 1, "price", datetime(2026, 10, 5, 8, tzinfo=timezone.utc), "newer-but-lower-id"),
                _entry(test_admin.id, AuditAction.UPDATE, "course", 1, "price", datetime(2026, 10, 1, 8, tzinfo=timezone.utc), "older-but-higher-id"),
            ]
        )
        await session.commit()

    result = await _fetch(client, test_admin)

    assert [item["new_value"] for item in result["items"]] == ["newer-but-lower-id", "older-but-higher-id"]


@pytest.mark.asyncio
async def test_entity_labels_resolve_course_title_without_extra_rows(client: AsyncClient, test_admin: User, seeded_course_id: int) -> None:
    result = await _fetch(client, test_admin, entity_type="course")

    assert result["total"] == 1
    assert result["items"][0]["entity_label"] == "Audit Algebra"
    assert result["items"][0]["course_id"] == seeded_course_id


@pytest.mark.asyncio
async def test_unresolved_entities_and_null_actor_stay_empty(client: AsyncClient, test_admin: User, seeded_course_id: int) -> None:
    result = await _fetch(client, test_admin, entity_type="payment")

    assert result["items"][0]["actor_name"] is None
    assert result["items"][0]["user_id"] is None
    assert result["items"][0]["entity_label"] is None


@pytest.mark.asyncio
async def test_filter_options_list_only_recorded_actors_and_types(client: AsyncClient, test_admin: User, test_mentor: User, seeded_course_id: int) -> None:
    response = await client.get(f"{AUDIT_URL}filter-options/", headers=_headers(test_admin))

    assert response.status_code == 200
    options = response.json()
    assert {actor["name"] for actor in options["actors"]} == {"Admin Super", "Mentor One"}
    assert options["entity_types"] == ["course", "journal_entry", "payment"]


@pytest.mark.asyncio
async def test_invalid_filters_are_rejected_and_roles_are_guarded(client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User) -> None:
    invalid_action = await client.get(AUDIT_URL, params={"action": "explode"}, headers=_headers(test_admin))
    invalid_date = await client.get(AUDIT_URL, params={"date_from": "not-a-date"}, headers=_headers(test_admin))
    accountant = await client.get(AUDIT_URL, params={"actor_id": 1}, headers=_headers(test_accountant))
    accountant_options = await client.get(f"{AUDIT_URL}filter-options/", headers=_headers(test_accountant))
    mentor_options = await client.get(f"{AUDIT_URL}filter-options/", headers=_headers(test_mentor))

    assert invalid_action.status_code == 422
    assert invalid_date.status_code == 422
    assert accountant.status_code == 403
    assert accountant_options.status_code == 403
    assert mentor_options.status_code == 403


@pytest.mark.asyncio
async def test_real_payment_audit_rows_name_the_student_and_link_the_student(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    from app.tests.integration.test_finance import _setup_student_course

    student_id, course_id = await _setup_student_course(
        client, _headers(test_admin), test_mentor.id, email="audit-label@example.com"
    )
    payment_response = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "100.00",
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "method": "cash",
        },
        headers=_headers(test_accountant),
    )
    assert payment_response.status_code in (200, 201)

    result = await _fetch(client, test_admin, entity_type="payment", entity_id=payment_response.json()["id"])

    assert result["total"] >= 1
    assert {item["entity_label"] for item in result["items"]} == {"S One"}
    assert {item["student_id"] for item in result["items"]} == {student_id}
    assert {item["actor_name"] for item in result["items"]} == {"Accountant One"}
    assert "amount" in {item["field_name"] for item in result["items"]}


EVENTS_URL: str = "/api/v1/audit-log/events/"


async def _events(client: AsyncClient, admin: User, **params: object) -> dict:
    response = await client.get(EVENTS_URL, params=params, headers=_headers(admin))
    assert response.status_code == 200
    return response.json()


async def _seed_grouped_events(admin: User, accountant: User) -> None:
    same_moment = datetime(2026, 10, 10, 8, tzinfo=timezone.utc)
    async with TestingSessionLocal() as session:
        session.add_all(
            [
                _entry(accountant.id, AuditAction.CREATE, "payment", 5, "amount", same_moment, "75.50"),
                _entry(accountant.id, AuditAction.CREATE, "payment", 5, "method", same_moment, "cash"),
                _entry(accountant.id, AuditAction.CREATE, "payment", 5, "student_id", same_moment, "3"),
                _entry(accountant.id, AuditAction.CREATE, "payment", 5, "course_id", same_moment, "999"),
                _entry(accountant.id, AuditAction.VOID, "payment", 5, "reason_code", datetime(2026, 10, 11, 8, tzinfo=timezone.utc), "entry_error"),
                _entry(None, AuditAction.UPDATE, "course", 8, "price", datetime(2026, 10, 12, 8, tzinfo=timezone.utc)),
                _entry(None, AuditAction.UPDATE, "course", 8, "title", datetime(2026, 10, 12, 8, tzinfo=timezone.utc)),
                _entry(admin.id, AuditAction.UPDATE, "course", 8, "price", datetime(2026, 10, 12, 8, tzinfo=timezone.utc)),
            ]
        )
        await session.commit()


@pytest.mark.asyncio
async def test_rows_sharing_actor_action_entity_and_moment_become_one_event(
    client: AsyncClient, test_admin: User, test_accountant: User
) -> None:
    await _seed_grouped_events(test_admin, test_accountant)

    result = await _events(client, test_admin)

    assert result["total"] == 4
    by_action = {(item["action"], item["entity_type"], item["user_id"]): item for item in result["items"]}
    payment_event = by_action[("create", "payment", test_accountant.id)]
    assert [change["field_name"] for change in payment_event["changes"]] == ["amount", "method", "student_id", "course_id"]
    assert by_action[("void", "payment", test_accountant.id)]["changes"][0]["new_value"] == "entry_error"
    assert len(by_action[("update", "course", None)]["changes"]) == 2
    assert len(by_action[("update", "course", test_admin.id)]["changes"]) == 1


@pytest.mark.asyncio
async def test_events_paginate_as_events_not_as_rows(client: AsyncClient, test_admin: User, test_accountant: User) -> None:
    await _seed_grouped_events(test_admin, test_accountant)

    first = await _events(client, test_admin, page_size=1, page=1)
    last = await _events(client, test_admin, page_size=1, page=4)

    assert first["total"] == 4
    assert first["total_pages"] == 4
    assert len(first["items"]) == 1
    assert len(last["items"]) == 1
    assert [item["created_at"] for item in (await _events(client, test_admin))["items"]] == sorted(
        [item["created_at"] for item in (await _events(client, test_admin))["items"]], reverse=True
    )


@pytest.mark.asyncio
async def test_event_search_matches_any_field_but_returns_the_whole_event(
    client: AsyncClient, test_admin: User, test_accountant: User
) -> None:
    await _seed_grouped_events(test_admin, test_accountant)

    result = await _events(client, test_admin, search="method", action="create")

    assert result["total"] == 1
    assert len(result["items"][0]["changes"]) == 4


@pytest.mark.asyncio
async def test_event_names_student_amount_and_course_from_real_records(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    from app.tests.integration.test_finance import _setup_student_course

    student_id, course_id = await _setup_student_course(
        client, _headers(test_admin), test_mentor.id, email="audit-event@example.com"
    )
    payment_response = await client.post(
        "/api/v1/finance/payments/",
        json={"student_id": student_id, "course_id": course_id, "amount": "75.50", "paid_at": datetime.now(timezone.utc).isoformat(), "method": "cash"},
        headers=_headers(test_accountant),
    )
    payment_id = payment_response.json()["id"]
    void_response = await client.post(
        f"/api/v1/finance/payments/{payment_id}/void", json={"reason_code": "entry_error"}, headers=_headers(test_accountant)
    )
    assert void_response.status_code == 200

    result = await _events(client, test_admin, entity_type="payment", entity_id=payment_id)

    assert result["total"] == 2
    events = {item["action"]: item for item in result["items"]}
    created = events["create"]
    assert created["entity_label"] == "S One"
    assert created["student_id"] == student_id
    assert created["amount"] == "75.50"
    assert created["course_id"] == course_id
    assert created["course_title"] == "SQL Basics"
    assert {change["field_name"] for change in created["changes"]} >= {"amount", "method", "student_id", "course_id"}
    assert events["void"]["amount"] == "75.50"
    assert events["void"]["changes"][0]["field_name"] in {"reason_code", "void_entry_id"}


@pytest.mark.asyncio
async def test_events_keep_filters_and_role_guard(client: AsyncClient, test_admin: User, test_accountant: User) -> None:
    await _seed_grouped_events(test_admin, test_accountant)

    by_actor = await _events(client, test_admin, actor_id=test_accountant.id)
    forbidden = await client.get(EVENTS_URL, headers=_headers(test_accountant))

    assert by_actor["total"] == 2
    assert forbidden.status_code == 403
