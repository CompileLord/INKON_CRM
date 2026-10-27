from sqlalchemy import func, or_
from sqlalchemy.sql.elements import ColumnElement

from app.models.user import User


class PersonSearch:
    @staticmethod
    def pattern(term: str) -> str:
        normalized_term: str = " ".join(term.split())
        escaped_term: str = normalized_term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        return f"%{escaped_term}%"

    @classmethod
    def matches(cls, term: str, include_parent_phone: bool = False) -> ColumnElement[bool]:
        pattern: str = cls.pattern(term)
        fields: list[ColumnElement[str]] = [
            User.first_name, User.last_name, User.email, User.phone,
            func.concat(User.first_name, " ", User.last_name),
            func.concat(User.last_name, " ", User.first_name),
        ]
        if include_parent_phone:
            fields.append(User.parent_phone)
        return or_(*(field.ilike(pattern, escape="\\") for field in fields))
