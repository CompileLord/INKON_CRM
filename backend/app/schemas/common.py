import re
from datetime import date
from decimal import Decimal
from typing import Annotated, ClassVar, Generic, List, Self, TypeAlias, TypeVar
from pydantic import BaseModel, Field, model_validator


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


PositiveMoney: TypeAlias = Annotated[Decimal, Field(gt=0, le=Decimal("99999999.99"), max_digits=10, decimal_places=2, allow_inf_nan=False)]


class InstallmentPriceInput(BaseModel):
    model_config = {"extra": "forbid"}
    price: PositiveMoney
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_positive_installments(self) -> Self:
        installment_count: int = max(1, (self.end_date.year - self.start_date.year) * 12 + self.end_date.month - self.start_date.month + 1)
        if int(self.price * 100) < installment_count:
            raise ValueError("Course price must cover at least one cent per monthly installment")
        return self


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
