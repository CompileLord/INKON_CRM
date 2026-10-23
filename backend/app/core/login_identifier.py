import re
from dataclasses import dataclass
from enum import Enum

from pydantic import EmailStr, TypeAdapter, ValidationError

from app.core.email_normalizer import EmailNormalizer
from app.schemas.common import CanonicalPhonePolicy


class LoginIdentifierKind(str, Enum):
    EMAIL = "email"
    PHONE = "phone"


@dataclass(frozen=True)
class LoginIdentifier:
    kind: LoginIdentifierKind
    value: str


class LoginIdentifierParser:
    _email_adapter: TypeAdapter[str] = TypeAdapter(EmailStr)
    _phone_separators: re.Pattern[str] = re.compile(r"[\s\-()]")

    @classmethod
    def parse(cls, raw_identifier: str) -> LoginIdentifier:
        stripped_identifier: str = raw_identifier.strip()
        if "@" in stripped_identifier:
            try:
                return LoginIdentifier(
                    LoginIdentifierKind.EMAIL,
                    EmailNormalizer.normalize(cls._email_adapter.validate_python(stripped_identifier)),
                )
            except ValidationError as error:
                raise ValueError("Enter a valid email address or an international phone number") from error
        normalized_phone: str | None = CanonicalPhonePolicy.normalize_historical(
            cls._phone_separators.sub("", stripped_identifier)
        )
        if normalized_phone is None:
            raise ValueError("Enter a valid email address or an international phone number")
        return LoginIdentifier(LoginIdentifierKind.PHONE, normalized_phone)

    @classmethod
    def from_email(cls, email: str) -> LoginIdentifier:
        return LoginIdentifier(LoginIdentifierKind.EMAIL, EmailNormalizer.normalize(email))
