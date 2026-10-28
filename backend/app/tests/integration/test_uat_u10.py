import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Set, Tuple

import pytest
import pytest_asyncio
from httpx import AsyncClient, Response
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.charge import Charge

from app.core.security import create_access_token
from app.main import app
from app.models.user import User
from app.tests.integration.test_finance import _setup_student_course

PAYMENTS_URL: str = "/api/v1/finance/payments/"
COURSES_URL: str = "/api/v1/courses/"
HUGE_IDENTIFIER: str = "99999999999999999999"


def bearer(user: User) -> Dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


class PaymentScenario:
    def __init__(self, client: AsyncClient, admin: User, accountant: User, mentor: User) -> None:
        self.client: AsyncClient = client
        self.admin: User = admin
        self.accountant: User = accountant
        self.mentor: User = mentor
        self.student_id: int = 0
        self.course_id: int = 0

    async def prepare(self) -> "PaymentScenario":
        self.student_id, self.course_id = await _setup_student_course(
            self.client, bearer(self.admin), self.mentor.id, email="u10@example.com", price="500.00"
        )
        return self

    async def pay(self, amount: Any, paid_at: str | None = None, comment: str | None = None) -> Response:
        payload: Dict[str, Any] = {
            "student_id": self.student_id,
            "course_id": self.course_id,
            "amount": amount,
            "paid_at": paid_at or datetime.now(timezone.utc).isoformat(),
            "method": "cash",
        }
        if comment is not None:
            payload["comment"] = comment
        return await self.client.post(PAYMENTS_URL, json=payload, headers=bearer(self.accountant))

    async def pay_raw(self, raw_body: str) -> Response:
        headers: Dict[str, str] = {**bearer(self.accountant), "Content-Type": "application/json"}
        return await self.client.post(PAYMENTS_URL, content=raw_body, headers=headers)


@pytest_asyncio.fixture
async def scenario(client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User) -> PaymentScenario:
    return await PaymentScenario(client, test_admin, test_accountant, test_mentor).prepare()


@pytest.mark.asyncio
@pytest.mark.parametrize("amount", ["NaN", "nan", "Infinity", "-Infinity", "1e3", "1E+3", "12.345", " 12.5 ", "0", "-5.00", "1,5", "", "0x10", "100000000.00"])
async def test_money_rejects_non_plain_decimals_string(scenario: PaymentScenario, amount: str) -> None:
    response: Response = await scenario.pay(amount)
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/json")


@pytest.mark.asyncio
@pytest.mark.parametrize("raw_amount", ["NaN", "Infinity", "-Infinity", "1E400", "12.345", "0.001"])
async def test_money_rejects_non_plain_decimals_json_number(scenario: PaymentScenario, raw_amount: str) -> None:
    now: str = datetime.now(timezone.utc).isoformat()
    body: str = (
        f'{{"student_id": {scenario.student_id}, "course_id": {scenario.course_id}, '
        f'"amount": {raw_amount}, "paid_at": "{now}", "method": "cash"}}'
    )
    response: Response = await scenario.pay_raw(body)
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/json")


@pytest.mark.asyncio
@pytest.mark.parametrize("amount, expected", [("100", "100.00"), ("12.5", "12.50"), ("0.01", "0.01"), (12.5, "12.50"), (7, "7.00"), ("99999999.99", "99999999.99")])
async def test_money_accepts_plain_decimals_and_serializes_two_places(scenario: PaymentScenario, amount: Any, expected: str, db_session: AsyncSession) -> None:
    if expected == "99999999.99":
        await db_session.execute(update(Charge).where(Charge.student_id == scenario.student_id).values(amount="99999999.99"))
        await db_session.commit()
    response: Response = await scenario.pay(amount)
    assert response.status_code == 201, response.text
    assert response.json()["amount"] == expected


@pytest.mark.asyncio
async def test_money_validation_covers_refund_discount_adjustment_and_course_price(
    client: AsyncClient, test_admin: User, test_mentor: User
) -> None:
    headers: Dict[str, str] = bearer(test_admin)
    bad_amounts: List[str] = ["NaN", "1e3", "1.234"]
    bad_amount: str
    for bad_amount in bad_amounts:
        refund: Response = await client.post("/api/v1/finance/payments/1/refund", json={"amount": bad_amount, "reason_code": "x"}, headers=headers)
        discount: Response = await client.post("/api/v1/finance/discounts/", json={"student_id": 1, "amount": bad_amount}, headers=headers)
        adjustment: Response = await client.post("/api/v1/finance/adjustments/", json={"student_id": 1, "amount": bad_amount, "reason_code": "x"}, headers=headers)
        course: Response = await client.post(
            COURSES_URL,
            json={
                "title": "Money", "description": "d", "start_date": "2030-01-01", "end_date": "2030-03-01", "exam_type": "weekly",
                "price": bad_amount, "mentor_id": test_mentor.id, "schedules": [{"day_of_week": 1, "time_start": "10:00:00", "time_end": "12:00:00"}],
            },
            headers=headers,
        )
        debts: Response = await client.get(f"/api/v1/finance/debts/?min_debt={bad_amount}", headers=headers)
        response: Response
        for response in (refund, discount, adjustment, course, debts):
            assert response.status_code == 422, (bad_amount, response.request.url, response.text)
            assert response.headers["content-type"].startswith("application/json")


@pytest.mark.asyncio
async def test_payment_date_must_be_timezone_aware(scenario: PaymentScenario) -> None:
    naive: str = (datetime.now(timezone.utc) - timedelta(days=1)).replace(tzinfo=None).isoformat()
    response: Response = await scenario.pay("10.00", paid_at=naive)
    assert response.status_code == 422
    aware: str = (datetime.now(timezone.utc) - timedelta(days=1)).astimezone(timezone(timedelta(hours=5))).isoformat()
    accepted: Response = await scenario.pay("10.00", paid_at=aware)
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["paid_at"].endswith(("+00:00", "Z", "+05:00"))


@pytest.mark.asyncio
async def test_payment_date_in_future_is_rejected_but_small_clock_skew_is_allowed(scenario: PaymentScenario) -> None:
    far_future: str = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    assert (await scenario.pay("10.00", paid_at=far_future)).status_code == 422
    one_hour: str = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    assert (await scenario.pay("10.00", paid_at=one_hour)).status_code == 422
    skew: str = (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat()
    assert (await scenario.pay("10.00", paid_at=skew)).status_code == 201


@pytest.mark.asyncio
async def test_payment_date_before_enrollment_start_beyond_tolerance_is_rejected(scenario: PaymentScenario) -> None:
    decades_ago: str = datetime(1999, 3, 1, tzinfo=timezone.utc).isoformat()
    too_early: Response = await scenario.pay("10.00", paid_at=decades_ago)
    assert too_early.status_code == 422
    assert "enrollment" in json.dumps(too_early.json()).lower()
    nine_days_before_month: str = (datetime.now(timezone.utc).replace(day=1) - timedelta(days=9)).isoformat()
    assert (await scenario.pay("10.00", paid_at=nine_days_before_month)).status_code == 201
    just_inside_tolerance: str = (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()
    assert (await scenario.pay("10.00", paid_at=just_inside_tolerance)).status_code == 422


@pytest.mark.asyncio
async def test_payment_comment_is_limited_to_500_characters(
    scenario: PaymentScenario, client: AsyncClient, test_admin: User
) -> None:
    assert (await scenario.pay("10.00", comment="x" * 500)).status_code == 201
    too_long: Response = await scenario.pay("10.00", comment="x" * 501)
    assert too_long.status_code == 422
    assert (await scenario.pay("10.00", comment="x" * 5000)).status_code == 422
    headers: Dict[str, str] = bearer(test_admin)
    refund: Response = await client.post("/api/v1/finance/payments/1/refund", json={"amount": "1.00", "reason_code": "x", "comment": "y" * 501}, headers=headers)
    void: Response = await client.post("/api/v1/finance/payments/1/void", json={"reason_code": "x", "comment": "y" * 501}, headers=headers)
    discount: Response = await client.post("/api/v1/finance/discounts/", json={"student_id": 1, "amount": "1.00", "comment": "y" * 501}, headers=headers)
    adjustment: Response = await client.post("/api/v1/finance/adjustments/", json={"student_id": 1, "amount": "1.00", "reason_code": "x", "comment": "y" * 501}, headers=headers)
    response: Response
    for response in (refund, void, discount, adjustment):
        assert response.status_code == 422, response.text
        assert "comment" in json.dumps(response.json())


class IntegerPathRoutes:
    HTTP_METHODS: Set[str] = {"get", "post", "put", "patch", "delete"}

    @classmethod
    def collect(cls) -> List[Tuple[str, str, Set[str]]]:
        collected: List[Tuple[str, str, Set[str]]] = []
        schema: Dict[str, Any] = app.openapi()
        path: str
        operations: Dict[str, Any]
        for path, operations in schema["paths"].items():
            method: str
            operation: Dict[str, Any]
            for method, operation in operations.items():
                if method not in cls.HTTP_METHODS:
                    continue
                integer_names: Set[str] = {
                    parameter["name"]
                    for parameter in operation.get("parameters", [])
                    if parameter["in"] == "path" and parameter["schema"].get("type") == "integer" and "maximum" not in parameter["schema"]
                }
                if integer_names:
                    collected.append((method.upper(), path, integer_names))
        return collected

    @classmethod
    def with_huge_identifiers(cls, template: str, integer_names: Set[str]) -> str:
        return re.sub(r"\{([^}]+)\}", lambda match: HUGE_IDENTIFIER if match.group(1) in integer_names else "1", template)


@pytest.mark.asyncio
async def test_out_of_range_integer_path_ids_return_422_json_on_every_router(client: AsyncClient, test_admin: User) -> None:
    cases: List[Tuple[str, str, Set[str]]] = IntegerPathRoutes.collect()
    assert len(cases) > 30
    headers: Dict[str, str] = bearer(test_admin)
    offenders: List[str] = []
    method: str
    path: str
    integer_names: Set[str]
    for method, path, integer_names in cases:
        concrete: str = IntegerPathRoutes.with_huge_identifiers(path, integer_names)
        response: Response = await client.request(method, concrete, headers=headers, json={} if method in {"POST", "PUT", "PATCH"} else None)
        content_type: str = response.headers.get("content-type", "")
        located_on_path: bool = False
        if response.status_code == 422 and content_type.startswith("application/json"):
            located_on_path = any("path" in error.get("loc", []) for error in response.json().get("detail", []) if isinstance(error, dict))
        if not located_on_path:
            offenders.append(f"{method} {concrete} -> {response.status_code} {content_type}")
    assert offenders == []


@pytest.mark.asyncio
async def test_the_nine_reported_endpoints_do_not_crash(client: AsyncClient, test_admin: User) -> None:
    headers: Dict[str, str] = bearer(test_admin)
    targets: List[Tuple[str, str]] = [
        ("GET", f"/api/v1/students/{HUGE_IDENTIFIER}/profile"),
        ("GET", f"/api/v1/courses/{HUGE_IDENTIFIER}"),
        ("GET", f"/api/v1/journals/{HUGE_IDENTIFIER}"),
        ("GET", f"/api/v1/mentors/{HUGE_IDENTIFIER}/profile"),
        ("GET", f"/api/v1/enrollments/courses/{HUGE_IDENTIFIER}/roster"),
        ("GET", f"/api/v1/finance/students/{HUGE_IDENTIFIER}/balance"),
        ("GET", f"/api/v1/finance/payments/{HUGE_IDENTIFIER}/receipt"),
        ("PATCH", f"/api/v1/notifications/{HUGE_IDENTIFIER}/read"),
    ]
    method: str
    url: str
    for method, url in targets:
        response: Response = await client.request(method, url, headers=headers)
        assert response.status_code == 422, (url, response.status_code, response.text)
        assert response.headers["content-type"].startswith("application/json")


@pytest.mark.asyncio
async def test_out_of_range_query_integers_return_422_json(client: AsyncClient, test_admin: User) -> None:
    headers: Dict[str, str] = bearer(test_admin)
    urls: List[str] = [
        f"/api/v1/finance/debts/?student_id={HUGE_IDENTIFIER}",
        f"/api/v1/finance/charges/?student_id={HUGE_IDENTIFIER}",
        f"/api/v1/finance/payments/?student_id={HUGE_IDENTIFIER}",
    ]
    url: str
    for url in urls:
        response: Response = await client.get(url, headers=headers)
        assert response.status_code == 422, (url, response.status_code, response.text)
        assert response.headers["content-type"].startswith("application/json")


@pytest.mark.asyncio
async def test_nul_characters_return_422_json_in_body_query_and_path(client: AsyncClient, test_admin: User) -> None:
    headers: Dict[str, str] = bearer(test_admin)
    patched: Response = await client.patch(
        f"/api/v1/users/{test_admin.id}", content=json.dumps({"last_name": "Bad\u0000Name"}), headers={**headers, "Content-Type": "application/json"}
    )
    assert patched.status_code == 422, patched.text
    assert patched.headers["content-type"].startswith("application/json")
    created: Response = await client.post(
        "/api/v1/users/",
        content='{"email": "nul@example.com", "first_name": "A\\u0000B", "last_name": "C", "role": "student"}',
        headers={**headers, "Content-Type": "application/json"},
    )
    assert created.status_code == 422, created.text
    searched: Response = await client.get("/api/v1/students/?search=ab%00cd", headers=headers)
    assert searched.status_code == 422, searched.text
    assert searched.headers["content-type"].startswith("application/json")
    escaped_backslash: Response = await client.patch(
        f"/api/v1/users/{test_admin.id}", content='{"last_name": "Fine\\\\u0000Name"}', headers={**headers, "Content-Type": "application/json"}
    )
    assert escaped_backslash.status_code == 200, escaped_backslash.text
