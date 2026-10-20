from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user, get_db_session, get_setup_user
from app.core.rate_limiter import (
    AuthenticationRateLimiter,
    LockoutReservation,
    get_auth_rate_limiter,
    get_client_ip,
)
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
    ChangePasswordRequest,
)
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/login", response_model=TokenPair)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    limiter: AuthenticationRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenPair:
    client_ip: str = get_client_ip(request)
    await limiter.consume_login_budget(payload.email, client_ip)
    reservation: LockoutReservation = await limiter.reserve_login_slot(payload.email)
    try:
        auth_service: AuthService = AuthService(db)
        try:
            result: TokenPair = await auth_service.login(payload.email, payload.password)
            await reservation.commit_success()
            return result
        except HTTPException as error:
            if error.status_code == status.HTTP_401_UNAUTHORIZED:
                await reservation.commit_failure()
            elif not reservation.is_committed:
                try:
                    await reservation.release()
                except Exception:
                    pass
            raise
    except BaseException:
        if not reservation.is_committed:
            try:
                await reservation.release()
            except Exception:
                pass
        raise


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
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    limiter: AuthenticationRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenPair:
    client_ip: str = get_client_ip(request)
    await limiter.consume_verify_budget(payload.email, client_ip)
    reservation: LockoutReservation = await limiter.reserve_verify_slot(payload.email)
    try:
        auth_service: AuthService = AuthService(db)
        try:
            result: TokenPair = await auth_service.verify_code(payload.email, payload.code)
            await reservation.commit_success()
            return result
        except HTTPException as error:
            if error.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_401_UNAUTHORIZED):
                await reservation.commit_failure()
            elif not reservation.is_committed:
                try:
                    await reservation.release()
                except Exception:
                    pass
            raise
    except BaseException:
        if not reservation.is_committed:
            try:
                await reservation.release()
            except Exception:
                pass
        raise


@router.post("/resend-code", status_code=status.HTTP_204_NO_CONTENT)
async def resend_code(
    payload: ResendCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    limiter: AuthenticationRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    client_ip: str = get_client_ip(request)
    await limiter.check_resend_cooldown(payload.email)
    await limiter.consume_resend_budgets(payload.email, client_ip)
    auth_service: AuthService = AuthService(db)
    await auth_service.resend_code(payload.email)


@router.post("/set-password", response_model=TokenPair)
async def set_password(
    payload: SetPasswordRequest,
    current_user: User = Depends(get_setup_user),
    db: AsyncSession = Depends(get_db_session)
) -> TokenPair:
    auth_service = AuthService(db)
    return await auth_service.set_password(current_user.id, payload.new_password)


@router.post("/change-password", response_model=TokenPair)
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    limiter: AuthenticationRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenPair:
    await limiter.consume_login_budget(current_user.email, get_client_ip(request))
    return await AuthService(db).change_password(
        current_user.id, payload.current_password, payload.new_password
    )


@router.post("/password-reset/request", status_code=status.HTTP_200_OK)
async def password_reset_request(
    payload: PasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    limiter: AuthenticationRateLimiter = Depends(get_auth_rate_limiter),
) -> dict:
    client_ip: str = get_client_ip(request)
    await limiter.consume_password_reset_budgets(payload.email, client_ip)
    auth_service: AuthService = AuthService(db)
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
