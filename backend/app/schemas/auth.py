from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    model_config = {"extra": "forbid"}
    email: EmailStr
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


class PasswordResetRequest(BaseModel):
    model_config = {"extra": "forbid"}
    email: EmailStr


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
