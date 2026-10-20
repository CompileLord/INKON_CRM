import asyncio
import smtplib
import socket
import time

import pytest

from app.services import email_service
from app.services.email_service import DeadlineSMTP, EmailDeliveryError


class TestSMTPDeadline:
    @pytest.mark.asyncio
    async def test_deadline_interrupts_blocked_socket_send(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(email_service, "SMTP_TRANSPORT_TIMEOUT_SECONDS", 0.05)
        sender: socket.socket
        receiver: socket.socket
        sender, receiver = socket.socketpair()
        sender.settimeout(5)
        transport: DeadlineSMTP = DeadlineSMTP()
        transport.sock = sender
        started_at: float = time.monotonic()
        try:
            with transport:
                with pytest.raises((smtplib.SMTPServerDisconnected, EmailDeliveryError, OSError)):
                    await asyncio.to_thread(transport.send, b"x" * (8 * 1024 * 1024))
            assert transport.expired.is_set()
            assert time.monotonic() - started_at < 1
        finally:
            sender.close()
            receiver.close()

    def test_no_command_can_start_after_deadline(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(email_service, "SMTP_TRANSPORT_TIMEOUT_SECONDS", 0.01)
        transport: DeadlineSMTP = DeadlineSMTP()
        transport.deadline = time.monotonic() - 1
        with pytest.raises(EmailDeliveryError, match="deadline"):
            transport.send(b"DATA\r\n")
