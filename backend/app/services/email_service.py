import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from arq import create_pool
from arq.connections import RedisSettings
from app.core.config import settings


class EmailService:
    def __init__(self) -> None:
        self.redis_settings = RedisSettings(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT
        )

    def _send_smtp(self, to_email: str, subject: str, body: str) -> None:
        message = MIMEMultipart()
        message["From"] = settings.SMTP_FROM_EMAIL
        message["To"] = to_email
        message["Subject"] = subject
        message.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)

    async def send_email(self, to_email: str, subject: str, body: str) -> None:
        if settings.TESTING:
            return
        await asyncio.to_thread(self._send_smtp, to_email, subject, body)

    async def enqueue_verification_email(self, email: str, code: str) -> None:
        if settings.TESTING:
            return
        pool = await create_pool(self.redis_settings)
        await pool.enqueue_job("send_verification_email_task", email, code)
