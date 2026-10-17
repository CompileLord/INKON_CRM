import asyncio
import ssl
import smtplib
from email.header import Header
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.core.config import settings
from app.core.redis import enqueue_job
from app.services.email_templates import InlineImage

SMTP_SOCKET_TIMEOUT_SECONDS = 10.0


class EmailDeliveryError(RuntimeError):
    pass


class EmailService:
    def build_message(
        self,
        to_email: str,
        subject: str,
        body: str,
        html_body: str | None = None,
        inline_images: tuple[InlineImage, ...] = (),
    ) -> MIMEMultipart:
        if html_body is None:
            message = MIMEMultipart()
            message.attach(MIMEText(body, "plain"))
        else:
            alternative_part = MIMEMultipart("alternative")
            alternative_part.attach(MIMEText(body, "plain", "utf-8"))
            alternative_part.attach(MIMEText(html_body, "html", "utf-8"))
            message = MIMEMultipart("related")
            message.attach(alternative_part)
            for inline_image in inline_images:
                image_part = MIMEImage(inline_image.data, _subtype=inline_image.subtype)
                image_part.add_header("Content-ID", f"<{inline_image.content_id}>")
                image_part.add_header("Content-Disposition", "inline", filename=f"{inline_image.content_id}.{inline_image.subtype}")
                message.attach(image_part)
        message["From"] = settings.SMTP_FROM_EMAIL
        message["To"] = to_email
        message["Subject"] = subject if subject.isascii() else Header(subject, "utf-8")
        return message

    def _send_smtp(
        self,
        to_email: str,
        subject: str,
        body: str,
        html_body: str | None = None,
        inline_images: tuple[InlineImage, ...] = (),
    ) -> None:
        message = self.build_message(to_email, subject, body, html_body, inline_images)

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

    async def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        force_transport: bool = False,
        html_body: str | None = None,
        inline_images: tuple[InlineImage, ...] = (),
    ) -> None:
        if settings.TESTING and not force_transport:
            return
        if html_body is None:
            await asyncio.to_thread(self._send_smtp, to_email, subject, body)
            return
        await asyncio.to_thread(
            self._send_smtp, to_email, subject, body, html_body, inline_images
        )

    async def enqueue_verification_email(self, email: str, code: str) -> None:
        if settings.TESTING:
            return
        await enqueue_job("send_verification_email_task", email, code)
