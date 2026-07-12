from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from app.core.config import settings
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
from app.api.v1.telegram import router as telegram_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.telegram_bot.bot import bot
    if not settings.TESTING:
        try:
            await bot.set_webhook(
                url=settings.TELEGRAM_WEBHOOK_URL,
                secret_token=settings.TELEGRAM_BOT_SECRET_TOKEN
            )
        except Exception:
            pass
    yield
    if not settings.TESTING:
        try:
            await bot.delete_webhook()
        except Exception:
            pass
    from app.core.redis import close_arq_pool
    await close_arq_pool()


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

app.add_middleware(GZipMiddleware, minimum_size=1000)

if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    )

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
app.include_router(telegram_router, prefix=f"{settings.API_V1_STR}/telegram", tags=["Telegram"])


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["Cache-Control"] = "no-store, max-age=0, must-revalidate"
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

