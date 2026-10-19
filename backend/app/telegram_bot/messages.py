from typing import ClassVar


class TelegramMessageCatalog:
    default_language: ClassVar[str] = "ru"
    language_buttons: ClassVar[tuple[tuple[str, str], ...]] = (
        ("tg", "Тоҷикӣ"),
        ("ru", "Русский"),
        ("en", "English"),
    )
    texts: ClassVar[dict[str, dict[str, str]]] = {
        "choose_language": {
            "tg": "Забони худро интихоб кунед",
            "ru": "Выберите язык",
            "en": "Choose your language",
        },
        "enter_code": {
            "tg": "Падар ё модари гиромӣ, лутфан рамзеро, ки гирифтаед, ворид кунед.",
            "ru": "Уважаемый родитель, пожалуйста, введите полученный код.",
            "en": "Dear parent, please type the code you received.",
        },
        "linked": {
            "tg": "Тайёр! Шумо ҳамчун волид барои {student_name} пайваст шудед. Акнун огоҳиҳо дар бораи пешрафт ва пардохт мерасанд.",
            "ru": "Готово! Вы подключены как родитель студента {student_name}. Теперь вы будете получать уведомления об успеваемости и оплате.",
            "en": "Done! You are now linked as the parent of {student_name}. You will receive progress and payment updates.",
        },
        "invalid_code": {
            "tg": "Рамз нодуруст, истифодашуда ё мӯҳлаташ гузаштааст. Лутфан дубора санҷед.",
            "ru": "Код неверный, уже использован или просрочен. Проверьте и попробуйте ещё раз.",
            "en": "The code is wrong, already used or expired. Please check it and try again.",
        },
        "invalid_format": {
            "tg": "Рамз аз 5 рақам ва 1 ҳарфи лотинӣ иборат аст, масалан 12A345.",
            "ru": "Код состоит из 5 цифр и 1 латинской буквы, например 12A345.",
            "en": "The code has 5 digits and 1 letter, for example 12A345.",
        },
        "locked": {
            "tg": "Шумо борҳо рамзи нодуруст ворид кардед. Баъд аз як соат дубора кӯшиш кунед.",
            "ru": "Слишком много неверных попыток. Попробуйте снова через час.",
            "en": "Too many wrong attempts. Please try again in an hour.",
        },
        "link_moved": {
            "tg": "Пайвастшавӣ барои {student_name} ба чати дигар интиқол дода шуд. Дар ин чат огоҳиҳо дигар намеоянд.",
            "ru": "Привязка студента {student_name} перенесена на другой чат. В этот чат уведомления больше приходить не будут.",
            "en": "The link for {student_name} was moved to another chat. This chat will no longer receive updates.",
        },
        "exam_card_title": {
            "tg": "Натиҷаи имтиҳон",
            "ru": "Результат экзамена",
            "en": "Exam result",
        },
        "exam_score_label": {
            "tg": "Имтиҳон",
            "ru": "Экзамен",
            "en": "Exam",
        },
        "period_total_label": {
            "tg": "Холи умумии давра",
            "ru": "Итог периода",
            "en": "Period total",
        },
        "attendance_label": {
            "tg": "Ҳузур",
            "ru": "Посещаемость",
            "en": "Attendance",
        },
        "attendance_value": {
            "tg": "{attended} аз {total} дарс",
            "ru": "{attended} из {total} занятий",
            "en": "{attended} of {total} lessons",
        },
        "period_week": {
            "tg": "Ҳафтаи {number}",
            "ru": "Неделя {number}",
            "en": "Week {number}",
        },
        "period_month": {
            "tg": "Моҳи {number}",
            "ru": "Месяц {number}",
            "en": "Month {number}",
        },
        "exam_caption": {
            "tg": "Натиҷаи имтиҳони {student_name}: {course_title}, {period_label}.",
            "ru": "Результат экзамена {student_name}: {course_title}, {period_label}.",
            "en": "Exam result for {student_name}: {course_title}, {period_label}.",
        },
    }

    def resolve_language(self, language: str | None) -> str:
        return language if language in dict(self.language_buttons) else self.default_language

    def render(self, key: str, language: str | None, **values: str) -> str:
        template: str = self.texts[key][self.resolve_language(language)]
        return template.format(**values)

    def language_choice_prompt(self) -> str:
        return "\n".join(self.texts["choose_language"][code] for code, _ in self.language_buttons)
