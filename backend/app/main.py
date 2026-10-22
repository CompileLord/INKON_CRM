from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from app.core.config import settings
from fastapi.exceptions import RequestValidationError
from app.core.credential_validation import CredentialValidationErrorHandler
from app.core.journal_body_limit import JournalBodyLimitMiddleware
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.students import router as students_router
from app.api.v1.mentors import router as mentors_router
from app.api.v1.courses import router as courses_router
from app.api.v1.enrollments import router as enrollments_router
from app.api.v1.journals import router as journals_router
from app.api.v1.finance import router as finance_router
from app.api.v1.documents import router as documents_router
from app.api.v1.audit_logs import router as audit_logs_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.telegram import router as telegram_router
from app.api.v1.settings import router as settings_router
from app.api.v1.cron import router as cron_router
from app.api.v1.system import router as system_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.core.resource_lifecycle import ProcessResources
    try:
        yield
    finally:
        await ProcessResources.close()


is_prod = settings.ENVIRONMENT == "production"

app = FastAPI(
    title="IMKON CRM",
    description="CRM backend API for IMKON Educational Center",
    version="0.1.0",
    openapi_url=None if is_prod else f"{settings.API_V1_STR}/openapi.json",
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    lifespan=lifespan
)

app.add_middleware(JournalBodyLimitMiddleware, api_prefix=settings.API_V1_STR)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_exception_handler(RequestValidationError, CredentialValidationErrorHandler())

if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_origin_regex=None if is_prod else r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|.*\.instatunnel\.my)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

import os
from app.services.public_media_files import PublicMediaFiles
os.makedirs(settings.STORAGE_PATH, exist_ok=True)
app.mount("/storage/avatar", PublicMediaFiles(settings.STORAGE_PATH, "avatar"), name="avatars")
app.mount("/storage/course", PublicMediaFiles(settings.STORAGE_PATH, "course"), name="course-media")

app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth", tags=["Auth"])
app.include_router(users_router, prefix=f"{settings.API_V1_STR}/users", tags=["Users"])
app.include_router(students_router, prefix=f"{settings.API_V1_STR}/students", tags=["Students"])
app.include_router(mentors_router, prefix=f"{settings.API_V1_STR}/mentors", tags=["Mentors"])
app.include_router(courses_router, prefix=f"{settings.API_V1_STR}/courses", tags=["Courses"])
app.include_router(enrollments_router, prefix=f"{settings.API_V1_STR}/enrollments", tags=["Enrollments"])
app.include_router(journals_router, prefix=f"{settings.API_V1_STR}/journals", tags=["Journals"])
app.include_router(finance_router, prefix=f"{settings.API_V1_STR}/finance", tags=["Finance"])
app.include_router(documents_router, prefix=f"{settings.API_V1_STR}/documents", tags=["Documents"])
app.include_router(audit_logs_router, prefix=f"{settings.API_V1_STR}/audit-log", tags=["Audit Log"])
app.include_router(notifications_router, prefix=f"{settings.API_V1_STR}/notifications", tags=["Notifications"])
app.include_router(telegram_router, prefix=f"{settings.API_V1_STR}/telegram", tags=["Telegram"])
app.include_router(settings_router, prefix=f"{settings.API_V1_STR}", tags=["Settings"])
app.include_router(cron_router, prefix=f"{settings.API_V1_STR}/cron", tags=["Cron"])
app.include_router(system_router, prefix=f"{settings.API_V1_STR}", tags=["System"])


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "0"
    path = request.url.path
    if path.startswith(("/storage/avatar/", "/storage/course/")):
        response.headers["Cache-Control"] = "public, max-age=86400"
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        return response

    response.headers["Cache-Control"] = "no-store, max-age=0, must-revalidate"

    if path.startswith("/api/"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        )
    elif path.startswith("/docs") or path.startswith("/redoc") or path.startswith("/openapi.json"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: https://fastapi.tiangolo.com; "
            # Add connect-src to allow fetching openapi.json and the jsdelivr source maps
            "connect-src 'self' https://cdn.jsdelivr.net;"
        )
    else:
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"

    return response


@app.get("/health", tags=["Health"])
async def health_check():
    from sqlalchemy import text
    from app.db.session import AsyncSessionLocal
    from app.core.redis import redis_client

    checks = {"status": "ok"}

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = "healthy"
    except Exception:
        checks["database"] = "unhealthy"
        checks["status"] = "degraded"

    try:
        await redis_client.ping()
        checks["redis"] = "healthy"
    except Exception:
        checks["redis"] = "unhealthy"
        checks["status"] = "degraded"

    status_code = 200 if checks["status"] == "ok" else 503
    return JSONResponse(content=checks, status_code=status_code)

