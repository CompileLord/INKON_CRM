from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, get_current_user
from app.core.rate_limiter import check_rate_limit, clear_rate_limit
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    TokenPair,
    VerifyCodeRequest,
    ResendCodeRequest,
    PasswordResetRequest,
    PasswordResetVerifyRequest,
    PasswordResetConfirmRequest,
    SetPasswordRequest,
)
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/login", response_model=TokenPair)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db_session)
) -> TokenPair:
    auth_service = AuthService(db)
    return await auth_service.login(payload.email, payload.password)


@router.post("/refresh", response_model=TokenPair)
async def refresh(
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db_session)
) -> TokenPair:
    auth_service = AuthService(db)
    return await auth_service.refresh(payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db_session)
) -> None:
    auth_service = AuthService(db)
    await auth_service.logout(payload.refresh_token)


@router.post("/verify-code", response_model=TokenPair)
async def verify_code(
    payload: VerifyCodeRequest,
    db: AsyncSession = Depends(get_db_session)
) -> TokenPair:
    key = f"auth:attempts:{payload.email}"
    await check_rate_limit(key, 5, 900)
    auth_service = AuthService(db)
    result = await auth_service.verify_code(payload.email, payload.code)
    await clear_rate_limit(key)
    return result


@router.post("/resend-code", status_code=status.HTTP_204_NO_CONTENT)
async def resend_code(
    payload: ResendCodeRequest,
    db: AsyncSession = Depends(get_db_session)
) -> None:
    auth_service = AuthService(db)
    await auth_service.resend_code(payload.email)


@router.post("/set-password", response_model=TokenPair)
async def set_password(
    payload: SetPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> TokenPair:
    auth_service = AuthService(db)
    return await auth_service.set_password(current_user.id, payload.new_password)


@router.post("/password-reset/request", status_code=status.HTTP_200_OK)
async def password_reset_request(
    payload: PasswordResetRequest,
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    key = f"auth:reset_request:{payload.email}"
    await check_rate_limit(key, 3, 3600)
    auth_service = AuthService(db)
    await auth_service.password_reset_request(payload.email)
    return {"message": "If the email exists, a reset code has been sent."}


@router.post("/password-reset/verify", response_model=dict)
async def password_reset_verify(
    payload: PasswordResetVerifyRequest,
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    auth_service = AuthService(db)
    reset_token = await auth_service.password_reset_verify(payload.email, payload.code)
    return {"reset_token": reset_token}


@router.post("/password-reset/confirm", response_model=TokenPair)
async def password_reset_confirm(
    payload: PasswordResetConfirmRequest,
    db: AsyncSession = Depends(get_db_session)
) -> TokenPair:
    auth_service = AuthService(db)
    return await auth_service.password_reset_confirm(payload.reset_token, payload.new_password)
