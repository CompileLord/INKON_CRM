import smtplib
import socket
import ssl
from unittest.mock import MagicMock

import pytest

from app.core.config import settings
from app.services.email_service import DeadlineSMTP, EmailDeliveryError, EmailService


class TestSMTPHostname:
    def test_smtp_tls_uses_configured_hostname_with_python312_connect_semantics(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        configured_hostname: str = "smtp.wp71.test"
        connected_socket: MagicMock = MagicMock(spec=socket.socket)
        tls_context: MagicMock = MagicMock(spec=ssl.SSLContext)
        authenticate: MagicMock = MagicMock()
        deliver_message: MagicMock = MagicMock()

        def connect_without_setting_hostname(
            server: DeadlineSMTP,
            host: str = "localhost",
            port: int = 0,
            source_address: tuple[str, int] | None = None,
        ) -> tuple[int, bytes]:
            assert host == configured_hostname
            assert server.deadline_timer.is_alive()
            server.sock = connected_socket
            return 220, b"ready"

        def advertise_starttls(server: DeadlineSMTP) -> tuple[int, bytes]:
            server.esmtp_features = {"starttls": ""}
            server.ehlo_resp = b"ready"
            return 250, b"ready"

        monkeypatch.setattr(settings, "SMTP_HOST", configured_hostname)
        monkeypatch.setattr(smtplib.SMTP, "connect", connect_without_setting_hostname)
        monkeypatch.setattr(DeadlineSMTP, "ehlo", advertise_starttls)
        monkeypatch.setattr(DeadlineSMTP, "docmd", MagicMock(return_value=(220, b"begin TLS")))
        monkeypatch.setattr(DeadlineSMTP, "login", authenticate)
        monkeypatch.setattr(DeadlineSMTP, "send_message", deliver_message)
        monkeypatch.setattr(ssl, "create_default_context", MagicMock(return_value=tls_context))

        EmailService()._send_smtp("recipient@wp71.test", "WP71 TLS", "private code")

        tls_context.wrap_socket.assert_called_once_with(
            connected_socket, server_hostname=configured_hostname,
        )
        authenticate.assert_called_once_with(settings.SMTP_USER, settings.SMTP_PASSWORD)
        deliver_message.assert_called_once()

    @pytest.mark.parametrize("failure_point", ["create_default_context", "starttls"])
    def test_smtp_tls_value_error_is_mapped_before_authentication(
        self, monkeypatch: pytest.MonkeyPatch, failure_point: str,
    ) -> None:
        authenticate: MagicMock = MagicMock()
        deliver_message: MagicMock = MagicMock()
        tls_failure: MagicMock = MagicMock(side_effect=ValueError("private TLS detail"))
        monkeypatch.setattr(DeadlineSMTP, "connect", MagicMock())
        monkeypatch.setattr(DeadlineSMTP, "ehlo", MagicMock())
        monkeypatch.setattr(DeadlineSMTP, "login", authenticate)
        monkeypatch.setattr(DeadlineSMTP, "send_message", deliver_message)
        if failure_point == "starttls":
            monkeypatch.setattr(DeadlineSMTP, "starttls", tls_failure)
        else:
            monkeypatch.setattr(ssl, "create_default_context", tls_failure)

        with pytest.raises(EmailDeliveryError, match="^SMTP TLS negotiation failed$"):
            EmailService()._send_smtp("recipient@wp71.test", "WP71 TLS", "private code")

        tls_failure.assert_called_once()
        authenticate.assert_not_called()
        deliver_message.assert_not_called()
