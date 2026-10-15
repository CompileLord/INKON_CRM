import json
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Dict, List

import pytest
from httpx import AsyncClient

from app.core.redis import redis_client
from app.core.security import create_access_token
from app.models.user import User
from app.services.finance_service import ANALYTICS_CACHE_KEY_PREFIX, FinanceService
from app.tests.integration.test_finance import _setup_student_course

DEBTS_URL: str = "/api/v1/finance/debts/"
ANALYTICS_URL: str = "/api/v1/finance/analytics/?date_from=2020-01-01&date_to=2099-12-31"
ANALYTICS_CACHE_KEY: str = f"{ANALYTICS_CACHE_KEY_PREFIX}2020-01-01:2099-12-31"
LEGACY_CACHE_KEY: str = "finance:analytics:2020-01-01:2099-12-31"
MONEY_FIELDS: List[str] = [
    "gross_contract_value",
    "billed_to_date",
    "billed_in_period",
    "net_receivable",
    "collected_in_period",
    "outstanding_credit",
]


def bearer(user: User) -> Dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def enroll_students_with_prices(
    client: AsyncClient, admin: User, mentor: User, prices: List[str]
) -> List[int]:
    student_ids: List[int] = []
    for index, price in enumerate(prices):
        student_id, _ = await _setup_student_course(
            client, bearer(admin), mentor.id, email=f"precision{index}@example.com", price=price
        )
        student_ids.append(student_id)
    return student_ids


@pytest.mark.parametrize(
    "amount, expected",
    [
        (Decimal("0.10") + Decimal("0.20"), "0.30"),
        (Decimal("9999999999.99"), "9999999999.99"),
        (Decimal("5"), "5.00"),
        (Decimal("1234.5"), "1234.50"),
    ],
)
def test_money_string_is_exact_with_two_places(amount: Decimal, expected: str) -> None:
    assert FinanceService._money_string(amount) == expected


@pytest.mark.asyncio
async def test_cold_and_cached_analytics_are_identical_exact_strings(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    await enroll_students_with_prices(client, test_admin, test_mentor, ["99999999.99", "300.30", "0.30"])
    headers = bearer(test_accountant)

    cold_response = await client.get(ANALYTICS_URL, headers=headers)
    cached_raw: str = await redis_client.get(ANALYTICS_CACHE_KEY)
    cached_response = await client.get(ANALYTICS_URL, headers=headers)

    assert cold_response.status_code == 200
    assert cached_raw is not None
    assert cached_response.json() == cold_response.json()
    stored: dict = json.loads(cached_raw)
    for field in MONEY_FIELDS:
        assert isinstance(stored[field], str)
        assert stored[field] == cold_response.json()[field]
        assert Decimal(stored[field]) == Decimal(stored[field]).quantize(Decimal("0.01"))
    assert all(isinstance(value, str) for value in stored["aging"].values())
    assert all(isinstance(preview["debt"], str) for preview in stored["debtors_preview"])
    assert isinstance(stored["collection_rate"], str)
    assert Decimal(cold_response.json()["gross_contract_value"]) >= Decimal("100000000.59")


@pytest.mark.asyncio
async def test_legacy_float_cache_entry_is_never_read(
    client: AsyncClient, test_accountant: User
) -> None:
    await redis_client.set(LEGACY_CACHE_KEY, json.dumps({"gross_contract_value": 0.1, "poisoned": True}), ex=600)

    response = await client.get(ANALYTICS_URL, headers=bearer(test_accountant))

    assert response.status_code == 200
    assert "poisoned" not in response.json()
    assert response.json()["gross_contract_value"] != "0.10"
    assert await redis_client.get(ANALYTICS_CACHE_KEY) is not None


@pytest.mark.asyncio
async def test_min_debt_threshold_is_exact_at_the_cent(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    student_ids = await enroll_students_with_prices(client, test_admin, test_mentor, ["300.30"])
    headers = bearer(test_accountant)
    items = (await client.get(DEBTS_URL, headers=headers)).json()["items"]
    debt: Decimal = Decimal(next(i for i in items if i["student"]["id"] == student_ids[0])["debt"])
    assert debt > Decimal("0.01")

    def listed(response_items: list) -> bool:
        return any(i["student"]["id"] == student_ids[0] for i in response_items)

    at_threshold = await client.get(f"{DEBTS_URL}?min_debt={debt}", headers=headers)
    just_above = await client.get(f"{DEBTS_URL}?min_debt={debt + Decimal('0.01')}", headers=headers)
    one_cent_below = await client.get(f"{DEBTS_URL}?min_debt={debt - Decimal('0.01')}", headers=headers)

    assert listed(at_threshold.json()["items"])
    assert not listed(just_above.json()["items"])
    assert listed(one_cent_below.json()["items"])


@pytest.mark.asyncio
@pytest.mark.parametrize("raw_value", ["-0.01", "abc", "1.005", "10000000000.00", "nan"])
async def test_invalid_min_debt_is_rejected_with_422(
    client: AsyncClient, test_accountant: User, raw_value: str
) -> None:
    response = await client.get(f"{DEBTS_URL}?min_debt={raw_value}", headers=bearer(test_accountant))

    assert response.status_code == 422
