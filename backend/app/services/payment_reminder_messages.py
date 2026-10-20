from datetime import date
from typing import ClassVar
from app.repositories.interfaces.payment_reminder_repository import PaymentReminderSource


class PaymentReminderMessages:
    templates: ClassVar[dict[str, dict[int, str]]] = {
        "ru": {
            1: "Напоминание: оплата за курс {course_title} для {student_name} через 1 день (дата: {due_date}). К оплате: {amount} TJS.",
            2: "Напоминание: оплата за курс {course_title} для {student_name} через 2 дня (дата: {due_date}). К оплате: {amount} TJS.",
        },
        "en": {
            1: "Reminder: payment for {course_title} for {student_name} is due in 1 day ({due_date}). Amount due: {amount} TJS.",
            2: "Reminder: payment for {course_title} for {student_name} is due in 2 days ({due_date}). Amount due: {amount} TJS.",
        },
        "tg": {
            1: "Ёдрасӣ: пардохти курси {course_title} барои {student_name} баъд аз 1 рӯз ({due_date}). Маблағи пардохт: {amount} TJS.",
            2: "Ёдрасӣ: пардохти курси {course_title} барои {student_name} баъд аз 2 рӯз ({due_date}). Маблағи пардохт: {amount} TJS.",
        },
    }

    def render(self, source: PaymentReminderSource, notification_date: date) -> str:
        language: str = source.language if source.language in self.templates else "ru"
        days: int = (source.due_date - notification_date).days
        return self.templates[language][days].format(
            course_title=source.course_title,
            student_name=source.student_name,
            due_date=source.due_date.isoformat(),
            amount=format(source.balance, ".2f"),
        )
