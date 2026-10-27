from datetime import date
from decimal import Decimal
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.course import Course, CourseStatus
from app.models.enrollment import BillingMode, Enrollment, EnrollmentStatus
from app.models.user import User, UserRole
from app.repositories.interfaces.course_repository import CourseRepository
from app.repositories.interfaces.enrollment_repository import EnrollmentRepository
from app.repositories.interfaces.user_repository import UserRepository
from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
from app.repositories.sqlalchemy.enrollment_repository import SQLAlchemyEnrollmentRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.schemas.enrollment import (
    BillingModeChangeResponse,
    EnrollmentPreviewCharge,
    EnrollmentPreviewResponse,
    EnrollmentResponse,
)
from app.services.audit_service import AuditService


class EnrollmentBillingService:
    def __init__(
        self,
        db: AsyncSession,
        enrollment_repo: EnrollmentRepository | None = None,
        course_repo: CourseRepository | None = None,
        user_repo: UserRepository | None = None,
    ) -> None:
        self.db: AsyncSession = db
        self.enrollment_repo: EnrollmentRepository = enrollment_repo or SQLAlchemyEnrollmentRepository(db)
        self.course_repo: CourseRepository = course_repo or SQLAlchemyCourseRepository(db)
        self.user_repo: UserRepository = user_repo or SQLAlchemyUserRepository(db)

    async def preview_enrollment(
        self, student_id: int, course_id: int, price_at_enrollment: Decimal | None, billing_mode: BillingMode,
    ) -> EnrollmentPreviewResponse:
        from app.services.finance_service import FinanceService, PlannedCharge, get_dushanbe_today

        course: Course | None = await self.course_repo.get_by_id(course_id)
        if not course or course.is_deleted or course.status != CourseStatus.ACTIVE:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Course is archived/inactive")
        today: date = get_dushanbe_today()
        if course.end_date <= today:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="course_already_ended")
        student: User | None = await self.user_repo.get_by_id(student_id)
        if not student or student.is_deleted or student.role != UserRole.STUDENT:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student deactivated/inactive")
        if await self.enrollment_repo.find_existing(student_id, course_id) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Student is already enrolled in this course")
        monthly_price: Decimal = price_at_enrollment if price_at_enrollment is not None else course.price
        planned: list[PlannedCharge] = (
            [] if billing_mode == BillingMode.GRANT
            else FinanceService.plan_schedule(course, student, monthly_price, today)
        )
        first_charge: EnrollmentPreviewCharge | None = (
            EnrollmentPreviewCharge(
                period_start=planned[0].period_start, due_date=planned[0].due_date, amount=planned[0].amount,
            ) if planned else None
        )
        return EnrollmentPreviewResponse(
            billing_mode=billing_mode,
            price_at_enrollment=monthly_price,
            billed_months=len(planned),
            total_amount=sum((planned_charge.amount for planned_charge in planned), Decimal("0.00")),
            first_charge=first_charge,
        )

    async def change_billing_mode(
        self, enrollment_id: int, target_mode: BillingMode, reason: str, actor: User,
    ) -> BillingModeChangeResponse:
        from app.services.finance_service import BillingModeChangeOutcome, FinanceService, get_dushanbe_today

        enrollment: Enrollment | None = await self.enrollment_repo.get_by_id(enrollment_id)
        if not enrollment or enrollment.is_deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found")
        finance_service: FinanceService = FinanceService(self.db)
        await finance_service.lock_student_accounts([enrollment.student_id])
        if enrollment.status != EnrollmentStatus.ACTIVE:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="enrollment_not_active")
        previous_mode: BillingMode = enrollment.effective_billing_mode
        if previous_mode == target_mode:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="billing_mode_unchanged")
        course: Course | None = await self.course_repo.get_by_id(enrollment.course_id)
        student: User | None = await self.user_repo.get_by_id(enrollment.student_id)
        if course is None or student is None:
            raise ValueError("Enrollment course or student not found")
        today: date = get_dushanbe_today()
        outcome: BillingModeChangeOutcome
        if target_mode == BillingMode.GRANT:
            outcome = await finance_service.convert_future_charges_to_grant(enrollment, course, actor, reason, today)
            enrollment.billing_mode = BillingMode.GRANT
        else:
            enrollment.billing_mode = BillingMode.PAID
            outcome = await finance_service.resume_billing_after_grant(enrollment, student, course, today)
        await self.enrollment_repo.update(enrollment)
        await AuditService(self.db).log_change(
            actor.id, "update", "enrollment", enrollment.id,
            f"{student.first_name} {student.last_name}",
            {"billing_mode": (previous_mode.value, target_mode.value), "billing_mode_reason": (None, reason),
             "cancelled_months": (None, outcome.cancelled_months),
             "cancelled_amount": (None, str(outcome.cancelled_amount)),
             "written_off_amount": (None, str(outcome.written_off_amount)),
             "generated_months": (None, outcome.generated_months)},
        )
        await finance_service._invalidate_cache()
        await self.db.refresh(enrollment)
        return BillingModeChangeResponse(
            enrollment=EnrollmentResponse.model_validate(enrollment, from_attributes=True),
            cancelled_months=outcome.cancelled_months,
            cancelled_amount=outcome.cancelled_amount,
            written_off_amount=outcome.written_off_amount,
            generated_months=outcome.generated_months,
        )
