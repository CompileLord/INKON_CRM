from enum import Enum


class SmsLanguage(str, Enum):
    RU = "ru"
    TG = "tg"
    EN = "en"


class PasswordSmsReason(str, Enum):
    INITIAL = "initial"
    RESET = "reset"


class PasswordSmsMessageFactory:
    MAXIMUM_LENGTH: int = 70
    DEFAULT_LANGUAGE: SmsLanguage = SmsLanguage.RU
    TEMPLATES: dict[tuple[SmsLanguage, PasswordSmsReason], str] = {
        (SmsLanguage.RU, PasswordSmsReason.INITIAL): "KitobCRM: ваш пароль {code}",
        (SmsLanguage.RU, PasswordSmsReason.RESET): "KitobCRM: новый пароль {code}",
        (SmsLanguage.TG, PasswordSmsReason.INITIAL): "KitobCRM: рамзи шумо {code}",
        (SmsLanguage.TG, PasswordSmsReason.RESET): "KitobCRM: рамзи нав {code}",
        (SmsLanguage.EN, PasswordSmsReason.INITIAL): "KitobCRM: your password {code}",
        (SmsLanguage.EN, PasswordSmsReason.RESET): "KitobCRM: new password {code}",
    }

    def build(self, language: str | None, reason: PasswordSmsReason, code: str) -> str:
        resolved_language: SmsLanguage = self._resolve_language(language)
        message: str = self.TEMPLATES[(resolved_language, reason)].format(code=code)
        if len(message) > self.MAXIMUM_LENGTH:
            raise ValueError("SMS message exceeds the maximum length")
        return message

    def _resolve_language(self, language: str | None) -> SmsLanguage:
        try:
            return SmsLanguage(language) if language else self.DEFAULT_LANGUAGE
        except ValueError:
            return self.DEFAULT_LANGUAGE
