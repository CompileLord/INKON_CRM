from typing import ClassVar

from app.services.message_language import MessageLanguage


class EmailMessages:
    texts: ClassVar[dict[str, tuple[str, str, str]]] = {
        "credentials_subject": ("Your KITOB sign-in details", "Ваши данные для входа в KITOB", "Маълумоти воридшавии шумо ба KITOB"),
        "credentials_preheader": ("Your login and password for KITOB", "Логин и пароль для входа в KITOB", "Номи корбарӣ ва гузарвожа барои KITOB"),
        "welcome": ("Welcome to KITOB, {name}!", "Добро пожаловать в KITOB, {name}!", "Ба KITOB хуш омадед, {name}!"),
        "sign_in": ("Sign in with these details and choose a new password on your first visit.", "Войдите с этими данными и при первом входе задайте новый пароль.", "Бо ин маълумот ворид шавед ва ҳангоми воридшавии аввал гузарвожаи нав интихоб кунед."),
        "parent": ("Give this code to a parent to enable notifications in the bot{bot}.", "Передайте код родителю, чтобы подключить уведомления в боте{bot}.", "Ин рамзро ба падару модар диҳед, то огоҳиҳоро дар бот{bot} фаъол кунанд."),
        "login": ("Login", "Логин", "Номи корбарӣ"),
        "password": ("Password", "Пароль", "Гузарвожа"),
        "parent_code": ("Parent Telegram code", "Код для Telegram родителя", "Рамзи Telegram барои падару модар"),
        "action": ("Sign in", "Войти", "Ворид шудан"),
        "footer": ("KITOB — Educational Center", "KITOB — Учебный центр", "KITOB — Маркази таълимӣ"),
        "ignore": ("If you did not expect this email, please ignore it.", "Если вы не ожидали это письмо, просто проигнорируйте его.", "Агар ин мактубро интизор набудед, онро нодида гиред."),
        "expiry": ("The code expires in 10 minutes.", "Код действует 10 минут.", "Рамз 10 дақиқа эътибор дорад."),
        "sharing": ("Do not share this code with anyone.", "Никому не сообщайте этот код.", "Ин рамзро ба ҳеҷ кас надиҳед."),
        "verification_subject": ("KITOB verification code", "код подтверждения KITOB", "рамзи тасдиқи KITOB"),
        "verification_label": ("Verification code", "Код подтверждения", "Рамзи тасдиқ"),
        "verification_heading": ("Confirm your KITOB sign-in", "Подтвердите вход в KITOB", "Воридшавӣ ба KITOB-ро тасдиқ кунед"),
        "reset_subject": ("KITOB password reset code", "код для сброса пароля KITOB", "рамзи барқарорсозии гузарвожаи KITOB"),
        "reset_label": ("Password reset code", "Код для сброса пароля", "Рамзи барқарорсозии гузарвожа"),
        "reset_heading": ("Reset your KITOB password", "Сброс пароля в KITOB", "Барқарорсозии гузарвожаи KITOB"),
    }

    def __init__(self, language: str | None = None) -> None:
        self.language: str = MessageLanguage.resolve(language)

    def render(self, key: str, **values: str) -> str:
        index: int = ("en", "ru", "tg").index(self.language)
        return self.texts[key][index].format(**values)
