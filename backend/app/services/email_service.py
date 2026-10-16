import asyncio
import ssl
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.core.config import settings
from app.core.redis import enqueue_job

SMTP_SOCKET_TIMEOUT_SECONDS = 10.0


class EmailDeliveryError(RuntimeError):
    pass


class EmailService:
    def _send_smtp(self, to_email: str, subject: str, body: str) -> None:
        message = MIMEMultipart()
        message["From"] = settings.SMTP_FROM_EMAIL
        message["To"] = to_email
        message["Subject"] = subject
        message.attach(MIMEText(body, "plain"))

        try:
            with smtplib.SMTP(
                settings.SMTP_HOST,
                settings.SMTP_PORT,
                timeout=SMTP_SOCKET_TIMEOUT_SECONDS,
            ) as server:
                server.ehlo()
                try:
                    server.starttls(context=ssl.create_default_context())
                except ssl.SSLCertVerificationError:
                    raise EmailDeliveryError(
                        "SMTP TLS certificate verification failed"
                    ) from None
                except ssl.SSLError:
                    raise EmailDeliveryError("SMTP TLS negotiation failed") from None
                server.ehlo()
                try:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                except smtplib.SMTPAuthenticationError:
                    raise EmailDeliveryError("SMTP authentication failed") from None
                server.send_message(message)
        except EmailDeliveryError:
            raise
        except (OSError, smtplib.SMTPException) as exception:
            raise EmailDeliveryError(
                f"SMTP delivery failed ({type(exception).__name__})"
            ) from None

    async def send_email(self, to_email: str, subject: str, body: str) -> None:
        if settings.TESTING:
            return
        await asyncio.to_thread(self._send_smtp, to_email, subject, body)

    async def enqueue_verification_email(self, email: str, code: str) -> None:
        if settings.TESTING:
            return
        await enqueue_job("send_verification_email_task", email, code)
