from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user, get_auth_service, get_db_session, get_setup_user
from app.core.security import AccessTokenPrincipal
from app.services.auth_session_service import RefreshTokenReuseDetected
from app.core.rate_limiter import (
    AuthenticationRateLimiter,
    LockoutReservation,
    get_auth_rate_limiter,
    get_client_ip,
)
from app.core.login_identifier import LoginIdentifier
from app.models.user import User
from app.services.student_password_sms_service import PasswordSmsDestinationKind
from app.services.message_language import MessageLanguage
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    TokenPair,
    VerifyCodeRequest,
    ResendCodeRequest,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    PasswordResetVerifyRequest,
    PasswordResetConfirmRequest,
    SetPasswordRequest,
    ChangePasswordRequest,
)
from app.services.auth_service import AuthService

router = APIRouter()
optional_bearer: HTTPBearer = HTTPBearer(auto_error=False)


@router.post("/login", response_model=TokenPair)
async def login(
    payload: LoginRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
    limiter: AuthenticationRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenPair:
    client_ip: str = get_client_ip(request)
    identifier: LoginIdentifier = payload.identifier
    await limiter.consume_login_budget(identifier.value, client_ip)
    reservation: LockoutReservation = await limiter.reserve_login_slot(identifier.value)
    try:
        try:
            result: TokenPair = await auth_service.login(identifier, payload.password)
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
    auth_service: AuthService = Depends(get_auth_service),
    db: AsyncSession = Depends(get_db_session),
) -> TokenPair:
    try:
        return await auth_service.refresh(payload.refresh_token)
    except RefreshTokenReuseDetected:
        await db.commit()
        raise


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    payload: RefreshRequest,
    auth_service: AuthService = Depends(get_auth_service),
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer),
) -> None:
    access_principal: AccessTokenPrincipal | None = None
    if credentials is not None:
        try:
            access_principal = AccessTokenPrincipal.from_token(credentials.credentials)
        except (JWTError, ValueError):
            access_principal = None
    await auth_service.logout(payload.refresh_token, access_principal)


@router.post("/verify-code", response_model=TokenPair)
async def verify_code(
    payload: VerifyCodeRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
    limiter: AuthenticationRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenPair:
    client_ip: str = get_client_ip(request)
    await limiter.consume_verify_budget(payload.email, client_ip)
    reservation: LockoutReservation = await limiter.reserve_verify_slot(payload.email)
    try:
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
    auth_service: AuthService = Depends(get_auth_service),
    limiter: AuthenticationRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    client_ip: str = get_client_ip(request)
    await limiter.check_resend_cooldown(payload.email)
    await limiter.consume_resend_budgets(payload.email, client_ip)
    await auth_service.resend_code(payload.email)


@router.post("/set-password", response_model=TokenPair)
async def set_password(
    payload: SetPasswordRequest,
    current_user: User = Depends(get_setup_user),
    auth_service: AuthService = Depends(get_auth_service)
) -> TokenPair:
    return await auth_service.set_password(current_user.id, payload.new_password)


@router.post("/change-password", response_model=TokenPair)
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
    limiter: AuthenticationRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenPair:
    await limiter.consume_login_budget(current_user.email or current_user.phone or str(current_user.id), get_client_ip(request))
    return await auth_service.change_password(
        current_user.id, payload.current_password, payload.new_password
    )


@router.post(
    "/password-reset/request", response_model=PasswordResetRequestResponse, status_code=status.HTTP_200_OK,
    description="Accepts login (email or E.164 phone) or the legacy email field, plus an optional SMS channel. Accounts with an email receive a reset code by email; accounts without one, or requests naming a channel, receive a pending SMS password with a short expiration (ten minutes by default). The current password and sessions remain valid until the SMS password is used at login. The response is identical whether or not the account or channel exists.",
)
async def password_reset_request(
    payload: PasswordResetRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
    limiter: AuthenticationRateLimiter = Depends(get_auth_rate_limiter),
) -> PasswordResetRequestResponse:
    client_ip: str = get_client_ip(request)
    identifier: LoginIdentifier = payload.identifier
    await limiter.consume_password_reset_budgets(identifier.value, client_ip)
    requested_channel: PasswordSmsDestinationKind | None = (
        PasswordSmsDestinationKind(payload.channel) if payload.channel else None
    )
    await auth_service.password_reset_request(
        identifier, requested_channel, client_ip,
        language=payload.language or MessageLanguage.from_accept_language(request.headers.get("Accept-Language")),
    )
    return PasswordResetRequestResponse(message="If the account exists, a reset message has been sent.")


@router.post("/password-reset/verify", response_model=dict)
async def password_reset_verify(
    payload: PasswordResetVerifyRequest,
    auth_service: AuthService = Depends(get_auth_service)
) -> dict:
    reset_token = await auth_service.password_reset_verify(payload.email, payload.code)
    return {"reset_token": reset_token}


@router.post("/password-reset/confirm", response_model=TokenPair)
async def password_reset_confirm(
    payload: PasswordResetConfirmRequest,
    auth_service: AuthService = Depends(get_auth_service)
) -> TokenPair:
    return await auth_service.password_reset_confirm(payload.reset_token, payload.new_password)
