from typing import List

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.services.telegram_link_service import IssuedLinkCode, TelegramLinkService
from scripts.demo_seed_report import DemoCredential, DemoParentLinkCode, DemoSeedReport


class DemoSeedRecorder:
    parent_link_code_student_count: int = 4

    @staticmethod
    def login_identifier(user: User) -> str:
        return user.email or user.phone or ""

    @staticmethod
    def record_credentials(report: DemoSeedReport, staff: List[User], students: List[User]) -> None:
        staff_user: User
        for staff_user in staff:
            password_source: str = (
                "administrator password entered at the prompt"
                if staff_user.role == UserRole.SUPERADMIN
                else "demo password entered at the prompt"
            )
            report.credentials.append(DemoCredential(
                staff_user.role.value, f"{staff_user.first_name} {staff_user.last_name}",
                DemoSeedRecorder.login_identifier(staff_user), password_source,
            ))
        student: User
        for student in students:
            report.credentials.append(DemoCredential(
                student.role.value, f"{student.first_name} {student.last_name}",
                DemoSeedRecorder.login_identifier(student), "demo password entered at the prompt",
            ))

    @staticmethod
    async def issue_parent_link_codes(session: AsyncSession, report: DemoSeedReport, students: List[User]) -> None:
        link_service: TelegramLinkService = TelegramLinkService(session)
        student: User
        for student in students[: DemoSeedRecorder.parent_link_code_student_count]:
            issued: IssuedLinkCode = await link_service.issue_code(student, None)
            report.parent_link_codes.append(DemoParentLinkCode(
                f"{student.first_name} {student.last_name}", issued.code, issued.expires_at,
            ))
