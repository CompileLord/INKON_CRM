from typing import Literal, Optional, Self
from pydantic import BaseModel, EmailStr, Field, model_validator
from app.core.login_identifier import LoginIdentifier, LoginIdentifierParser


class IdentifierRequest(BaseModel):
    model_config = {"extra": "forbid"}
    login: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None

    @model_validator(mode="after")
    def require_exactly_one_identifier(self) -> Self:
        if (self.login is None) == (self.email is None):
            raise ValueError("Provide exactly one of login or email")
        if self.login is not None:
            LoginIdentifierParser.parse(self.login)
        return self

    @property
    def identifier(self) -> LoginIdentifier:
        if self.login is not None:
            return LoginIdentifierParser.parse(self.login)
        return LoginIdentifierParser.from_email(str(self.email))


class LoginRequest(IdentifierRequest):
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    must_set_password: bool = False


class RefreshRequest(BaseModel):
    model_config = {"extra": "forbid"}
    refresh_token: str


class VerifyCodeRequest(BaseModel):
    model_config = {"extra": "forbid"}
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class ResendCodeRequest(BaseModel):
    model_config = {"extra": "forbid"}
    email: EmailStr


class PasswordResetRequest(IdentifierRequest):
    language: Literal["en", "ru", "tg"] | None = None
    channel: Optional[Literal["student_phone", "parent_phone"]] = None


class PasswordResetVerifyRequest(BaseModel):
    model_config = {"extra": "forbid"}
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class PasswordResetConfirmRequest(BaseModel):
    model_config = {"extra": "forbid"}
    reset_token: str
    new_password: str = Field(min_length=8)


class SetPasswordRequest(BaseModel):
    model_config = {"extra": "forbid"}
    new_password: str = Field(min_length=8)


class ChangePasswordRequest(BaseModel):
    model_config = {"extra": "forbid"}
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class PasswordResetRequestResponse(BaseModel):
    message: Literal["If the account exists, a reset message has been sent."]
