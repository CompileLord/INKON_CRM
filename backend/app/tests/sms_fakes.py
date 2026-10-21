from app.services.sms.sender import SmsDeliveryError, SmsSendResult


class RecordedSmsSend:
    def __init__(self, phone_e164: str, message: str, idempotency_key: str) -> None:
        self.phone_e164: str = phone_e164
        self.message: str = message
        self.idempotency_key: str = idempotency_key


class FakeSmsSender:
    def __init__(self, scripted_failures: list[SmsDeliveryError] | None = None) -> None:
        self.sends: list[RecordedSmsSend] = []
        self.scripted_failures: list[SmsDeliveryError] = list(scripted_failures or [])

    async def send(self, phone_e164: str, message: str, idempotency_key: str) -> SmsSendResult:
        self.sends.append(RecordedSmsSend(phone_e164, message, idempotency_key))
        if self.scripted_failures:
            raise self.scripted_failures.pop(0)
        return SmsSendResult(provider_message_id=f"fake-{len(self.sends)}", status="sent")
