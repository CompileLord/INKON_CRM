import math
import re
from decimal import Decimal
from typing import Annotated, Any, ClassVar, TypeAlias

from pydantic import BeforeValidator, Field, PlainSerializer


class MoneyParser:
    PLAIN_DECIMAL: ClassVar[re.Pattern[str]] = re.compile(r"^(0|[1-9][0-9]*)(\.[0-9]+)?$")
    MAXIMUM: ClassVar[Decimal] = Decimal("99999999.99")
    CENTS: ClassVar[Decimal] = Decimal("0.01")

    @classmethod
    def parse(cls, raw_value: Any) -> Any:
        if isinstance(raw_value, bool):
            raise ValueError("Money must be a plain decimal with at most 2 decimal places")
        if isinstance(raw_value, int):
            text: str = str(raw_value)
        elif isinstance(raw_value, float):
            if not math.isfinite(raw_value):
                raise ValueError("Money must be a finite number")
            text = repr(raw_value)
        elif isinstance(raw_value, Decimal):
            if not raw_value.is_finite():
                raise ValueError("Money must be a finite number")
            text = format(raw_value, "f")
        elif isinstance(raw_value, str):
            text = raw_value
        else:
            return raw_value
        if cls.PLAIN_DECIMAL.fullmatch(text) is None:
            raise ValueError("Money must be a plain decimal with at most 2 decimal places")
        exact_amount: Decimal = Decimal(text)
        rounded_amount: Decimal = exact_amount.quantize(cls.CENTS)
        if rounded_amount != exact_amount:
            raise ValueError("Money must be a plain decimal with at most 2 decimal places")
        return rounded_amount

    @classmethod
    def serialize(cls, amount: Decimal) -> str:
        return format(amount.quantize(cls.CENTS), "f")


MoneyAmount: TypeAlias = Annotated[
    Decimal,
    BeforeValidator(MoneyParser.parse),
    Field(ge=0, le=MoneyParser.MAXIMUM, max_digits=10, decimal_places=2, allow_inf_nan=False),
    PlainSerializer(MoneyParser.serialize, return_type=str, when_used="json"),
]

PositiveMoney: TypeAlias = Annotated[
    Decimal,
    BeforeValidator(MoneyParser.parse),
    Field(gt=0, le=MoneyParser.MAXIMUM, max_digits=10, decimal_places=2, allow_inf_nan=False),
    PlainSerializer(MoneyParser.serialize, return_type=str, when_used="json"),
]
