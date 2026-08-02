from decimal import Decimal
from typing import List
from pydantic import BaseModel, Field


class AgingBuckets(BaseModel):
    d0_30: Decimal = Field(Decimal("0.00"))
    d31_60: Decimal = Field(Decimal("0.00"))
    d61_90: Decimal = Field(Decimal("0.00"))
    d90_plus: Decimal = Field(Decimal("0.00"))


class DebtorPreviewItem(BaseModel):
    student_id: int
    first_name: str
    last_name: str
    email: str
    debt: Decimal


class DetailedAnalyticsResponse(BaseModel):
    # Total value of all charges on active enrollments, including future ones.
    gross_contract_value: Decimal
    # Charges that have come due (lifetime).
    billed_to_date: Decimal
    # Charges falling due inside the requested window.
    billed_in_period: Decimal
    # billed_to_date less what has been settled — the real receivable.
    net_receivable: Decimal
    # Cash taken less cash refunded, bucketed in Dushanbe local time.
    collected_in_period: Decimal
    outstanding_credit: Decimal
    aging: AgingBuckets
    unpaid_students_count: int
    # collected_in_period / billed_in_period — like-for-like.
    collection_rate: Decimal
    debtors_preview: List[DebtorPreviewItem]
