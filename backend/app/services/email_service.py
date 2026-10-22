import asyncio
import ssl
import smtplib
import socket
import threading
import time
from typing import Any
from email.header import Header
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.core.config import settings
from app.core.redis import enqueue_job
from app.services.email_templates import InlineImage

SMTP_SOCKET_TIMEOUT_SECONDS = 10.0
SMTP_TRANSPORT_TIMEOUT_SECONDS: float = 12.0


class EmailDeliveryError(RuntimeError):
    pass


class DeadlineSMTP(smtplib.SMTP):
    def __init__(self) -> None:
        self.deadline: float = time.monotonic() + SMTP_TRANSPORT_TIMEOUT_SECONDS
        self.expired: threading.Event = threading.Event()
        super().__init__(timeout=SMTP_SOCKET_TIMEOUT_SECONDS)
        self.deadline_timer: threading.Timer = threading.Timer(SMTP_TRANSPORT_TIMEOUT_SECONDS, self.abort)
        self.deadline_timer.daemon = True

    def connect(
        self,
        host: str = "localhost",
        port: int = 0,
        source_address: tuple[str, int] | None = None,
    ) -> tuple[int, bytes]:
        self._host: str = host
        return super().connect(host, port, source_address)

    def abort(self) -> None:
        self.expired.set()
        active_socket: socket.socket | None = self.sock
        if active_socket is not None:
            try:
                active_socket.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
        self.close()

    def check_deadline(self) -> None:
        if self.expired.is_set() or time.monotonic() >= self.deadline:
            self.abort()
            raise EmailDeliveryError("SMTP transport deadline exceeded")

    def send(self, data: Any) -> None:
        self.check_deadline()
        super().send(data)

    def _get_socket(self, host: str, port: int, timeout: float) -> socket.socket:
        self.check_deadline()
        connected_socket: socket.socket = super()._get_socket(host, port, timeout)
        if self.expired.is_set() or time.monotonic() >= self.deadline:
            connected_socket.close()
            raise EmailDeliveryError("SMTP transport deadline exceeded")
        return connected_socket

    def __enter__(self) -> "DeadlineSMTP":
        self.deadline_timer.start()
        return self

    def __exit__(self, *arguments: Any) -> None:
        try:
            self.close()
        finally:
            self.deadline_timer.cancel()


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
            with DeadlineSMTP() as server:
                server.connect(settings.SMTP_HOST, settings.SMTP_PORT)
                server.ehlo()
                try:
                    server.starttls(context=ssl.create_default_context())
                except ssl.SSLCertVerificationError:
                    raise EmailDeliveryError(
                        "SMTP TLS certificate verification failed"
                    ) from None
                except (ssl.SSLError, ValueError):
                    raise EmailDeliveryError("SMTP TLS negotiation failed") from None
                server.ehlo()
                try:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                except smtplib.SMTPAuthenticationError:
                    raise EmailDeliveryError("SMTP authentication failed") from None
                server.send_message(message)
                server.check_deadline()
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
