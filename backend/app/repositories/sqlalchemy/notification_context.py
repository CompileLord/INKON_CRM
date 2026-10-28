import re

from app.models.notification_log import NotificationLog, NotificationType


class NotificationContext:
    @staticmethod
    def exam_score(log: NotificationLog) -> int | None:
        if log.type != NotificationType.EXAM_RESULT:
            return None
        if log.delivery_score is not None:
            return log.delivery_score
        match: re.Match[str] | None = re.fullmatch(r"score:([0-9]+)", log.error_message or "")
        return int(match[1]) if match else None

