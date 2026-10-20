import json
import re

import httpx
import pytest

from app.core.student_passwords import PendingStudentPasswordHasher, StudentPasswordCodeGenerator
from app.services.sms.messages import PasswordSmsMessageFactory, PasswordSmsReason, SmsLanguage
from app.services.sms.sender import PayomchiSmsSender, ProviderPhoneFormatter, SmsDeliveryError, SmsSendResult
from app.workers.sms_delivery import StudentPasswordSmsDispatcher
from app.tests.sms_fakes import FakeSmsSender

CODE_PATTERN: re.Pattern[str] = re.compile(r"^(?=(?:\D*\d){5}\D*$)(?=[^A-Z]*[A-Z][^A-Z]*$)[0-9A-Z]{6}$")


class TestPendingStudentPasswordHasher:
    def test_digest_is_account_bound_keyed_and_contains_no_plaintext_code(self) -> None:
        hasher: PendingStudentPasswordHasher = PendingStudentPasswordHasher("synthetic-key")
        digest: str = hasher.hash(1, "12345Z")
        assert hasher.verify(1, "12345Z", digest)
        assert not hasher.verify(2, "12345Z", digest)
        assert not hasher.verify(1, "12345A", digest)
        assert not PendingStudentPasswordHasher("another-key").verify(1, "12345Z", digest)
        assert "12345Z" not in digest and len(digest) == 64

    def test_digest_verification_uses_constant_time_compare(self, monkeypatch: pytest.MonkeyPatch) -> None:
        comparisons: list[tuple[str, str]] = []

        def compare(left: str, right: str) -> bool:
            comparisons.append((left, right))
            return False

        monkeypatch.setattr("app.core.student_passwords.hmac.compare_digest", compare)
        hasher: PendingStudentPasswordHasher = PendingStudentPasswordHasher("synthetic-key")
        assert not hasher.verify(1, "12345Z", "stored-digest")
        assert comparisons == [(hasher.hash(1, "12345Z"), "stored-digest")]


class TestStudentPasswordCodeGenerator:
    def test_code_is_five_digits_and_one_uppercase_letter_over_many_samples(self) -> None:
        generator: StudentPasswordCodeGenerator = StudentPasswordCodeGenerator()
        for _ in range(5000):
            code: str = generator.generate()
            assert CODE_PATTERN.fullmatch(code)
            assert sum(character.isdigit() for character in code) == 5
            assert sum(character.isascii() and character.isupper() for character in code) == 1

    def test_letter_lands_on_every_position(self) -> None:
        generator: StudentPasswordCodeGenerator = StudentPasswordCodeGenerator()
        positions: set[int] = set()
        for _ in range(2000):
            code: str = generator.generate()
            positions.add(next(index for index, character in enumerate(code) if character.isalpha()))
        assert positions == {0, 1, 2, 3, 4, 5}

    def test_generator_draws_from_secrets_only(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list[str] = []
        monkeypatch.setattr("app.core.student_passwords.secrets.choice", lambda seq: (calls.append("choice"), seq[0])[1])
        monkeypatch.setattr("app.core.student_passwords.secrets.randbelow", lambda bound: (calls.append("randbelow"), 0)[1])
        code: str = StudentPasswordCodeGenerator().generate()
        assert "choice" in calls and "randbelow" in calls
        assert CODE_PATTERN.fullmatch(code)


class TestProviderPhoneFormatter:
    def test_plus_is_stripped_leaving_digits_only(self) -> None:
        assert ProviderPhoneFormatter().to_provider_digits("+992900000001") == "992900000001"

    @pytest.mark.parametrize("bad_phone", ["992900000001", "+99290000000a", "+992 900", '+9929"},{"x"', "+0123456789", "+992٩٠٠٠٠٠٠٠١", ""])
    def test_non_e164_is_rejected(self, bad_phone: str) -> None:
        with pytest.raises(SmsDeliveryError) as caught:
            ProviderPhoneFormatter().to_provider_digits(bad_phone)
        assert caught.value.retryable is False


class TestPasswordSmsMessageFactory:
    @pytest.mark.parametrize("language", [member.value for member in SmsLanguage])
    @pytest.mark.parametrize("reason", list(PasswordSmsReason))
    def test_message_is_at_most_seventy_characters_and_carries_code(self, language: str, reason: PasswordSmsReason) -> None:
        message: str = PasswordSmsMessageFactory().build(language, reason, "12345Z")
        assert len(message) <= 70
        assert "12345Z" in message

    def test_unknown_or_missing_language_falls_back_to_russian(self) -> None:
        factory: PasswordSmsMessageFactory = PasswordSmsMessageFactory()
        assert factory.build(None, PasswordSmsReason.INITIAL, "12345Z") == "KitobCRM: ваш пароль 12345Z"
        assert factory.build("xx", PasswordSmsReason.INITIAL, "12345Z") == "KitobCRM: ваш пароль 12345Z"


class SmsSenderTestSupport:
    @staticmethod
    def build_sender(handler: httpx.MockTransport, api_key: str | None = "secret-key-value") -> PayomchiSmsSender:
        return PayomchiSmsSender(api_key=api_key, base_url="https://sms.example/api/v1", sender_id="KitobCRM", transport=handler)

@pytest.mark.asyncio
class TestPayomchiSmsSender:
    @pytest.mark.parametrize("body", [
        {"id": "12345Z", "status": "sent"},
        {"id": "secret-key-value", "status": "sent"},
        {"id": "m", "status": "12345Z"},
        {"id": "m", "status": {"code": "12345Z"}},
    ])
    async def test_provider_metadata_cannot_leak_credentials(self, body: dict[str, object]) -> None:
        sender: PayomchiSmsSender = SmsSenderTestSupport.build_sender(httpx.MockTransport(lambda request: httpx.Response(201, json=body)))
        with pytest.raises(SmsDeliveryError) as caught:
            await sender.send("+992900000001", "KitobCRM: your password 12345Z", "k")
        assert str(caught.value) == "provider_response_malformed"
        await sender.aclose()

    async def test_settings_repr_and_serialization_redact_sms_api_key(self) -> None:
        from app.core.config import Settings

        configuration: Settings = Settings(SMS_API_KEY="secret-key-value")
        assert "secret-key-value" not in repr(configuration)
        assert "secret-key-value" not in configuration.model_dump_json()

    async def test_request_shape_headers_and_response(self) -> None:
        captured: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            captured.append(request)
            return httpx.Response(201, json={"id": "m1", "phone": "992900000001", "status": "pending", "channel": "sms"})

        result: SmsSendResult = await SmsSenderTestSupport.build_sender(httpx.MockTransport(handler)).send("+992900000001", "KitobCRM: ваш пароль 12345Z", "key-1")
        request: httpx.Request = captured[0]
        assert str(request.url) == "https://sms.example/api/v1/user/sms"
        assert request.headers["X-Api-Key"] == "secret-key-value"
        assert request.headers["Idempotency-Key"] == "key-1"
        assert request.headers["Content-Type"] == "application/json"
        assert json.loads(request.content) == {
            "phone": "992900000001",
            "message": "KitobCRM: ваш пароль 12345Z",
            "channel": "sms",
            "senderId": "KitobCRM",
        }
        assert result.provider_message_id == "m1" and result.status == "pending"

    @pytest.mark.parametrize(("status_code", "retryable"), [(500, True), (503, True), (429, True), (400, False), (401, False), (422, False)])
    async def test_http_errors_are_classified(self, status_code: int, retryable: bool) -> None:
        sender: PayomchiSmsSender = SmsSenderTestSupport.build_sender(httpx.MockTransport(lambda request: httpx.Response(status_code)))
        with pytest.raises(SmsDeliveryError) as caught:
            await sender.send("+992900000001", "m", "k")
        assert caught.value.retryable is retryable
        assert "secret-key-value" not in str(caught.value)

    @pytest.mark.parametrize("provider_status", ["failed", "rejected"])
    async def test_rejected_status_is_permanent(self, provider_status: str) -> None:
        sender: PayomchiSmsSender = SmsSenderTestSupport.build_sender(
            httpx.MockTransport(lambda request: httpx.Response(201, json={"id": "m", "status": provider_status}))
        )
        with pytest.raises(SmsDeliveryError) as caught:
            await sender.send("+992900000001", "m", "k")
        assert caught.value.retryable is False

    async def test_transport_failure_is_retryable_and_hides_details(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectTimeout("boom 12345Z")

        with pytest.raises(SmsDeliveryError) as caught:
            await SmsSenderTestSupport.build_sender(httpx.MockTransport(handler)).send("+992900000001", "m", "k")
        assert caught.value.retryable is True
        assert "12345Z" not in str(caught.value)

    async def test_missing_api_key_is_permanent_and_makes_no_request(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise AssertionError("no request expected")

        with pytest.raises(SmsDeliveryError) as caught:
            await SmsSenderTestSupport.build_sender(httpx.MockTransport(handler), api_key=None).send("+992900000001", "m", "k")
        assert caught.value.retryable is False

    async def test_repr_does_not_expose_api_key(self) -> None:
        assert "secret-key-value" not in repr(SmsSenderTestSupport.build_sender(httpx.MockTransport(lambda request: httpx.Response(201))))

    async def test_client_is_reused_across_sends(self) -> None:
        sender: PayomchiSmsSender = SmsSenderTestSupport.build_sender(
            httpx.MockTransport(lambda request: httpx.Response(201, json={"id": "m", "status": "sent"}))
        )
        await sender.send("+992900000001", "m", "k1")
        first_client: object = sender._client
        await sender.send("+992900000001", "m", "k2")
        assert sender._client is first_client
        await sender.aclose()


class TestBackoff:
    def test_backoff_grows_is_capped_and_jitter_is_bounded(self) -> None:
        from datetime import datetime, timezone

        dispatcher: StudentPasswordSmsDispatcher = StudentPasswordSmsDispatcher(FakeSmsSender(), 0, 0.25, 10)
        now: datetime = datetime.now(timezone.utc)
        for attempt, base in [(1, 10), (2, 20), (3, 40), (20, 900)]:
            for _ in range(50):
                delay: float = (dispatcher.compute_next_attempt_at(attempt, now) - now).total_seconds()
                assert base <= delay <= base * 1.25
