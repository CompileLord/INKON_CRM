import asyncio
import socket
import ssl
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import pytest

from app.core.config import settings
from app.services.email_service import EmailDeliveryError, EmailService

ORIGINAL_SEND_EMAIL = EmailService.send_email


@dataclass(frozen=True)
class SMTPCertificate:
    certificate_path: Path
    private_key_path: Path


@dataclass(frozen=True)
class SMTPCertificateBundle:
    trusted_ca_path: Path
    correct_host: SMTPCertificate
    wrong_host: SMTPCertificate
    untrusted_host: SMTPCertificate


class LocalStartTLSServer:
    def __init__(
        self,
        certificate: SMTPCertificate,
        greeting_delay_seconds: float = 0.0,
    ) -> None:
        self.certificate = certificate
        self.greeting_delay_seconds = greeting_delay_seconds
        self.listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.listener.bind(("127.0.0.1", 0))
        self.listener.listen(1)
        self.listener.settimeout(0.1)
        self.port: int = int(self.listener.getsockname()[1])
        self.events: list[str] = []
        self.authenticated: bool = False
        self.received_message: bool = False
        self.tls_established: bool = False
        self.finished = threading.Event()
        self.stopping = threading.Event()
        self.thread = threading.Thread(target=self._serve, daemon=True)

    def __enter__(self) -> "LocalStartTLSServer":
        self.thread.start()
        return self

    def __exit__(self, exception_type: object, exception: object, traceback: object) -> None:
        self.stopping.set()
        self.listener.close()
        self.thread.join(timeout=3.0)

    def _reply(self, connection: socket.socket, message: bytes) -> None:
        connection.sendall(message + b"\r\n")

    def _read_message(self, reader: object) -> None:
        while True:
            line: bytes = reader.readline()
            if not line or line in {b".\r\n", b".\n"}:
                return

    def _serve_connection(self, connection: socket.socket) -> None:
        if self.greeting_delay_seconds:
            time.sleep(self.greeting_delay_seconds)
        self._reply(connection, b"220 local test SMTP ready")
        reader = connection.makefile("rb")
        while not self.stopping.is_set():
            line: bytes = reader.readline()
            if not line:
                return
            command: str = line.decode("ascii", errors="replace").strip()
            verb: str = command.split(" ", 1)[0].upper()
            if verb == "EHLO" or verb == "HELO":
                self.events.append("ehlo")
                self._reply(connection, b"250-local test SMTP")
                self._reply(connection, b"250-STARTTLS")
                self._reply(connection, b"250 AUTH PLAIN LOGIN")
            elif verb == "STARTTLS":
                self.events.append("starttls")
                self._reply(connection, b"220 begin TLS")
                reader.close()
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                context.load_cert_chain(
                    certfile=str(self.certificate.certificate_path),
                    keyfile=str(self.certificate.private_key_path),
                )
                try:
                    connection = context.wrap_socket(connection, server_side=True)
                except ssl.SSLError:
                    return
                self.tls_established = True
                reader = connection.makefile("rb")
            elif verb == "AUTH":
                self.events.append("auth")
                if not self.tls_established:
                    self._reply(connection, b"530 authentication requires TLS")
                    return
                self.authenticated = True
                self._reply(connection, b"235 authentication accepted")
            elif verb == "MAIL":
                self._reply(connection, b"250 sender accepted")
            elif verb == "RCPT":
                self._reply(connection, b"250 recipient accepted")
            elif verb == "DATA":
                if not self.authenticated:
                    self._reply(connection, b"530 authentication required")
                    return
                self._reply(connection, b"354 end with dot")
                self._read_message(reader)
                self.received_message = True
                self.events.append("data")
                self._reply(connection, b"250 message accepted")
            elif verb == "QUIT":
                self._reply(connection, b"221 closing connection")
                return
            else:
                self._reply(connection, b"502 command not implemented")

    def _serve(self) -> None:
        try:
            while not self.stopping.is_set():
                try:
                    connection, _ = self.listener.accept()
                except TimeoutError:
                    continue
                except OSError:
                    return
                with connection:
                    connection.settimeout(4.0)
                    try:
                        self._serve_connection(connection)
                    except (ConnectionError, OSError, TimeoutError):
                        return
                    return
        finally:
            self.finished.set()


def run_openssl(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True)


def create_authority(directory: Path, name: str) -> tuple[Path, Path]:
    private_key_path: Path = directory / f"{name}.key"
    certificate_path: Path = directory / f"{name}.pem"
    run_openssl(["openssl", "genrsa", "-out", str(private_key_path), "2048"])
    run_openssl(
        [
            "openssl",
            "req",
            "-x509",
            "-new",
            "-nodes",
            "-key",
            str(private_key_path),
            "-sha256",
            "-days",
            "2",
            "-addext",
            "basicConstraints=critical,CA:TRUE",
            "-addext",
            "keyUsage=critical,keyCertSign,cRLSign",
            "-subj",
            f"/CN={name}",
            "-out",
            str(certificate_path),
        ]
    )
    return private_key_path, certificate_path


def create_server_certificate(
    directory: Path,
    hostname: str,
    name: str,
    authority_key_path: Path,
    authority_certificate_path: Path,
) -> SMTPCertificate:
    private_key_path: Path = directory / f"{name}.key"
    request_path: Path = directory / f"{name}.csr"
    certificate_path: Path = directory / f"{name}.pem"
    extension_path: Path = directory / f"{name}.ext"
    extension_path.write_text(
        f"subjectAltName=DNS:{hostname}\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n"
    )
    run_openssl(["openssl", "req", "-newkey", "rsa:2048", "-nodes", "-keyout", str(private_key_path), "-out", str(request_path), "-subj", f"/CN={hostname}"])
    run_openssl(
        [
            "openssl",
            "x509",
            "-req",
            "-in",
            str(request_path),
            "-CA",
            str(authority_certificate_path),
            "-CAkey",
            str(authority_key_path),
            "-CAcreateserial",
            "-out",
            str(certificate_path),
            "-days",
            "2",
            "-sha256",
            "-extfile",
            str(extension_path),
        ]
    )
    return SMTPCertificate(certificate_path, private_key_path)


@pytest.fixture(scope="session")
def test_certificates(tmp_path_factory: pytest.TempPathFactory) -> SMTPCertificateBundle:
    directory: Path = tmp_path_factory.mktemp("wp12-certificates")
    trusted_key, trusted_certificate = create_authority(directory, "wp12-trusted-authority")
    untrusted_key, untrusted_certificate = create_authority(directory, "wp12-untrusted-authority")
    return SMTPCertificateBundle(
        trusted_ca_path=trusted_certificate,
        correct_host=create_server_certificate(
            directory,
            "smtp.wp12.test",
            "correct-host",
            trusted_key,
            trusted_certificate,
        ),
        wrong_host=create_server_certificate(
            directory,
            "different.wp12.test",
            "wrong-host",
            trusted_key,
            trusted_certificate,
        ),
        untrusted_host=create_server_certificate(
            directory,
            "smtp.wp12.test",
            "untrusted-host",
            untrusted_key,
            untrusted_certificate,
        ),
    )


def configure_smtp_test(
    monkeypatch: pytest.MonkeyPatch,
    hostname: str,
    port: int,
    ca_path: Path,
) -> None:
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(settings, "SMTP_HOST", hostname)
    monkeypatch.setattr(settings, "SMTP_PORT", port)
    monkeypatch.setattr(settings, "SMTP_USER", "wp12-user")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "wp12-test-password")
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "sender@wp12.test")
    monkeypatch.setenv("SSL_CERT_FILE", str(ca_path))

    original_getaddrinfo: Callable[..., list[tuple[object, ...]]] = socket.getaddrinfo

    def resolve_localhost(
        host: str | bytes | None,
        *args: object,
        **kwargs: object,
    ) -> list[tuple[object, ...]]:
        if host in {"smtp.wp12.test", "different.wp12.test"}:
            host = "127.0.0.1"
        return original_getaddrinfo(host, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", resolve_localhost)


async def send_email_through_smtp(
    recipient: str,
    subject: str,
    body: str,
) -> None:
    await ORIGINAL_SEND_EMAIL(EmailService(), recipient, subject, body)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("certificate_attribute", "expected_message"),
    [
        ("untrusted_host", "SMTP TLS certificate verification failed"),
        ("wrong_host", "SMTP TLS certificate verification failed"),
    ],
    ids=["untrusted-ca", "trusted-wrong-host"],
)
async def test_smtp_rejects_untrusted_or_wrong_host_certificate_before_auth_and_data(
    certificate_attribute: str,
    expected_message: str,
    monkeypatch: pytest.MonkeyPatch,
    test_certificates: SMTPCertificateBundle,
) -> None:
    certificate: SMTPCertificate = getattr(test_certificates, certificate_attribute)
    with LocalStartTLSServer(certificate) as smtp_server:
        configure_smtp_test(
            monkeypatch,
            "smtp.wp12.test",
            smtp_server.port,
            test_certificates.trusted_ca_path,
        )
        with pytest.raises(EmailDeliveryError) as failure:
            await send_email_through_smtp("recipient@wp12.test", "WP12 TLS", "private code")
        assert expected_message in str(failure.value)
        assert "wp12-test-password" not in str(failure.value)
        assert smtp_server.finished.wait(3.0), (
            smtp_server.events,
            smtp_server.authenticated,
            smtp_server.received_message,
        )
        assert smtp_server.tls_established is False
        assert smtp_server.authenticated is False
        assert smtp_server.received_message is False
        assert "auth" not in smtp_server.events
        assert "data" not in smtp_server.events


@pytest.mark.asyncio
async def test_smtp_delivers_only_after_trusted_tls_and_post_tls_ehlo(
    monkeypatch: pytest.MonkeyPatch,
    test_certificates: SMTPCertificateBundle,
) -> None:
    with LocalStartTLSServer(test_certificates.correct_host) as smtp_server:
        configure_smtp_test(
            monkeypatch,
            "smtp.wp12.test",
            smtp_server.port,
            test_certificates.trusted_ca_path,
        )
        await send_email_through_smtp("recipient@wp12.test", "WP12 TLS", "private code")
        assert smtp_server.finished.wait(3.0), (
            smtp_server.events,
            smtp_server.authenticated,
            smtp_server.received_message,
        )
        assert smtp_server.tls_established is True
        assert smtp_server.authenticated is True
        assert smtp_server.received_message is True
        assert smtp_server.events == ["ehlo", "starttls", "ehlo", "auth", "data"]


@pytest.mark.asyncio
async def test_stalled_smtp_greeting_fails_within_socket_timeout(
    monkeypatch: pytest.MonkeyPatch,
    test_certificates: SMTPCertificateBundle,
) -> None:
    from app.services import email_service

    monkeypatch.setattr(email_service, "SMTP_SOCKET_TIMEOUT_SECONDS", 0.35, raising=False)
    with LocalStartTLSServer(
        test_certificates.correct_host,
        greeting_delay_seconds=1.3,
    ) as smtp_server:
        configure_smtp_test(
            monkeypatch,
            "smtp.wp12.test",
            smtp_server.port,
            test_certificates.trusted_ca_path,
        )
        started_at: float = time.monotonic()
        with pytest.raises(EmailDeliveryError) as failure:
            await asyncio.wait_for(
                send_email_through_smtp("recipient@wp12.test", "WP12 timeout", "private code"),
                timeout=2.5,
            )
        elapsed_seconds: float = time.monotonic() - started_at
        assert "SMTP delivery failed" in str(failure.value)
        assert elapsed_seconds < 1.0
        assert smtp_server.finished.wait(3.0)
        assert smtp_server.authenticated is False
        assert smtp_server.received_message is False
