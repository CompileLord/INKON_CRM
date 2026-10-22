from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class DemoStudentContacts:
    email: Optional[str]
    phone: Optional[str]
    parent_phone: Optional[str]
    case_label: str


class DemoStudentContactPlan:
    parent_phone_template: str = "+99290888{group:04d}"

    @classmethod
    def for_student(cls, one_based_index: int, email: str, phone: str) -> DemoStudentContacts:
        position: int = one_based_index % 4
        sibling_group: int = one_based_index if position != 0 else one_based_index - 1
        parent_phone: str = cls.parent_phone_template.format(group=sibling_group)
        if position == 1:
            return DemoStudentContacts(email, phone, parent_phone, "email and phone")
        if position == 2:
            return DemoStudentContacts(None, phone, None, "phone only")
        if position == 3:
            return DemoStudentContacts(email, None, parent_phone, "email and parent phone only")
        return DemoStudentContacts(email, phone, parent_phone, "sibling sharing a parent phone")
