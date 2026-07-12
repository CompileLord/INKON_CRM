from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
            await bot.set_webhook(url=settings.TELEGRAM_WEBHOOK_URL)
        except Exception:
            pass
    yield
    if not settings.TESTING:
        try:
            await bot.delete_webhook()
        except Exception:
            pass


app = FastAPI(
    title="IMKON CRM",
    description="CRM backend API for IMKON Educational Center",
    version="0.1.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
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
    return response


@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    return {"status": "ok", "environment": settings.ENVIRONMENT}

