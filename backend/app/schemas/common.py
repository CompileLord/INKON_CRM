import re
from datetime import date
from decimal import Decimal
from typing import Annotated, ClassVar, Generic, List, TypeAlias, TypeVar
from pydantic import BaseModel, Field
from app.schemas.money import PositiveMoney


class CanonicalPhonePolicy:
    input_pattern: ClassVar[str] = r"^\+[1-9][0-9]{1,14}$"
    historical_pattern: ClassVar[str] = r"\+?[1-9][0-9]{1,14}"

    @classmethod
    def normalize_historical(cls, value: str) -> str | None:
        if re.fullmatch(cls.historical_pattern, value) is None:
            return None
        return value if value.startswith("+") else f"+{value}"

    @classmethod
    def are_equivalent(cls, stored_value: str | None, incoming_value: str | None) -> bool:
        if stored_value is None or incoming_value is None:
            return stored_value is None and incoming_value is None
        canonical_stored_value: str | None = cls.normalize_historical(stored_value)
        canonical_incoming_value: str | None = cls.normalize_historical(incoming_value)
        return canonical_stored_value is not None and canonical_stored_value == canonical_incoming_value


CanonicalPhone: TypeAlias = Annotated[str, Field(pattern=CanonicalPhonePolicy.input_pattern)]




class InstallmentPriceInput(BaseModel):
    model_config = {"extra": "forbid"}
    price: PositiveMoney
    start_date: date
    end_date: date

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
