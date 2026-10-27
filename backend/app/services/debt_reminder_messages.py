from decimal import Decimal
from app.services.message_language import MessageLanguage


class DebtReminderMessages:
    templates: dict[str, str] = {
        "en": "IMKON: tuition debt {amount} TJS. Please pay. Thank you.",
        "ru": "IMKON: долг за обучение {amount} TJS. Просим оплатить. Спасибо.",
        "tg": "IMKON: қарзи таҳсил {amount} TJS. Лутфан пардохт кунед. Ташаккур.",
    }

    def render(self, amount: Decimal, language: str | None) -> str:
        return self.templates[MessageLanguage.resolve(language)].format(amount=format(amount, ".2f"))

    @staticmethod
    def mask(destination: str) -> str:
        return ("+" if destination.startswith("+") else "") + "*" * max(3, len(destination.lstrip("+")) - 4) + destination[-4:]
