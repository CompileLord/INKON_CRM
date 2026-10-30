import re
from dataclasses import dataclass
from typing import Optional
from typing_extensions import Protocol

import httpx

from app.core.config import settings

class SmsDeliveryError(Exception):
    def __init__(self, reason: str, retryable: bool) -> None:
        super().__init__(reason)
        self.reason: str = reason
        self.retryable: bool = retryable


@dataclass(frozen=True)
class SmsSendResult:
    provider_message_id: str
    status: str


class SmsSender(Protocol):
    async def send(self, phone_e164: str, message: str, idempotency_key: str) -> SmsSendResult:
        ...


class ProviderPhoneFormatter:
    E164_PATTERN: re.Pattern[str] = re.compile(r"^\+[1-9][0-9]{7,14}$")

    def is_deliverable(self, phone_e164: str | None) -> bool:
        return phone_e164 is not None and self.E164_PATTERN.fullmatch(phone_e164) is not None

    def to_provider_digits(self, phone_e164: str) -> str:
        if not self.E164_PATTERN.fullmatch(phone_e164):
            raise SmsDeliveryError("invalid_phone_format", retryable=False)
        return phone_e164[1:]


class PayomchiSmsSender:
    REJECTED_STATUSES: frozenset[str] = frozenset({"failed", "rejected"})
    ACCEPTED_STATUSES: frozenset[str] = frozenset({"pending", "queued", "accepted", "sent", "delivered"})

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        sender_id: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ) -> None:
        self._api_key: Optional[str] = api_key if api_key is not None else settings.SMS_API_KEY
        self._base_url: str = (base_url or settings.SMS_BASE_URL).rstrip("/")
        self._sender_id: str = sender_id or settings.SMS_SENDER_ID
        self._timeout_seconds: float = timeout_seconds or settings.SMS_REQUEST_TIMEOUT_SECONDS
        self._transport: Optional[httpx.AsyncBaseTransport] = transport
        self._phone_formatter: ProviderPhoneFormatter = ProviderPhoneFormatter()
        self._client: Optional[httpx.AsyncClient] = None

    def __repr__(self) -> str:
        return f"PayomchiSmsSender(base_url={self._base_url!r}, sender_id={self._sender_id!r})"

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self._timeout_seconds),
                limits=httpx.Limits(max_connections=4, max_keepalive_connections=2),
                transport=self._transport,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def send(self, phone_e164: str, message: str, idempotency_key: str) -> SmsSendResult:
        if not self._api_key:
            raise SmsDeliveryError("sms_api_key_not_configured", retryable=False)
        request_body: dict[str, str] = {
            "phone": self._phone_formatter.to_provider_digits(phone_e164),
            "message": message,
            "channel": "sms",
            "senderId": self._sender_id,
        }
        request_headers: dict[str, str] = {
            "X-Api-Key": self._api_key,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        }
        try:
            response: httpx.Response = await self._get_client().post(
                f"{self._base_url}/user/sms",
                json=request_body,
                headers=request_headers,
            )
        except httpx.HTTPError as error:
            raise SmsDeliveryError(f"transport_{type(error).__name__}", retryable=True) from None
        return self._interpret(response, message)

    def _interpret(self, response: httpx.Response, message: str) -> SmsSendResult:
        if response.status_code >= 500 or response.status_code == 429:
            raise SmsDeliveryError(f"provider_http_{response.status_code}", retryable=True)
        if response.status_code not in (200, 201):
            raise SmsDeliveryError(f"provider_http_{response.status_code}", retryable=False)
        try:
            body: dict[str, object] = response.json()
            provider_status: object = body["status"]
            provider_message_id: object = body["id"]
        except (ValueError, KeyError, TypeError):
            raise SmsDeliveryError("provider_response_malformed", retryable=True) from None
        if isinstance(provider_message_id, int) and not isinstance(provider_message_id, bool):
            provider_message_id = str(provider_message_id)
        if not isinstance(provider_status, str) or not isinstance(provider_message_id, str):
            raise SmsDeliveryError("provider_response_malformed", retryable=True)
        if provider_status in self.REJECTED_STATUSES:
            raise SmsDeliveryError(f"provider_status_{provider_status}", retryable=False)
        if provider_status not in self.ACCEPTED_STATUSES or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", provider_message_id):
            raise SmsDeliveryError("provider_response_malformed", retryable=True)
        sensitive_values: list[str] = re.findall(r"\b[0-9A-Z]{6}\b", message)
        sensitive_values.append(self._api_key or "")
        if any(value and value in provider_message_id for value in sensitive_values):
            raise SmsDeliveryError("provider_response_malformed", retryable=True)
        return SmsSendResult(provider_message_id=provider_message_id, status=provider_status)
