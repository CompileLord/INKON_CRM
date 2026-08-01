from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, func, cast, Numeric
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.payment import Payment, PaymentMethod
from app.models.enrollment import Enrollment
from app.models.user import User
from app.models.course import Course
from app.models.audit_log import AuditLog, AuditAction
from app.repositories.sqlalchemy.payment_repository import SQLAlchemyPaymentRepository


class FinanceService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.payment_repo = SQLAlchemyPaymentRepository(db)

    async def create_payment(
        self,
        student_id: int,
        course_id: int,
        amount: Decimal,
        paid_at: datetime,
        method: PaymentMethod,
        discount_percent: int,
        comment: Optional[str],
        current_user: User
    ) -> Payment:
        if amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment amount must be greater than 0"
            )

        enrollment_query = select(Enrollment).filter(
            Enrollment.student_id == student_id,
            Enrollment.course_id == course_id,
            Enrollment.is_deleted == False
        )
        enrollment_result = await self.db.execute(enrollment_query)
        enrollment = enrollment_result.scalars().first()
        if not enrollment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student is not enrolled in this course"
            )

        payment = Payment(
            student_id=student_id,
            course_id=course_id,
            amount=amount,
            paid_at=paid_at,
            method=method,
            accepted_by_id=current_user.id,
            discount_percent=discount_percent,
            comment=comment
        )
        self.db.add(payment)
        await self.db.flush()

        if discount_percent > 0:
            from app.services.audit_service import AuditService
            audit_service = AuditService(self.db)
            await audit_service.log(
                user_id=current_user.id,
                action="create",
                entity_type="payment",
                entity_id=payment.id,
                changes={"discount_percent": (None, discount_percent)}
            )

        await self.db.refresh(payment)
        return payment

    async def list_payments(
        self,
        filters: dict,
        page: int,
        page_size: int
    ) -> dict:
        query = select(Payment)
        student_id = filters.get("student_id")
        if student_id:
            query = query.filter(Payment.student_id == student_id)
        course_id = filters.get("course_id")
        if course_id:
            query = query.filter(Payment.course_id == course_id)
        date_from = filters.get("date_from")
        if date_from:
            query = query.filter(Payment.paid_at >= date_from)
        date_to = filters.get("date_to")
        if date_to:
            query = query.filter(Payment.paid_at <= date_to)
        method = filters.get("method")
        if method:
            query = query.filter(Payment.method == method)

        query = query.order_by(Payment.id.desc())
        return await self.payment_repo.get_paginated(query, page, page_size)

    async def get_debts(
        self,
        filters: dict,
        page: int,
        page_size: int
    ) -> dict:
        from sqlalchemy import case, cast, extract, Integer, Date, text
        
        page_size = min(max(1, page_size), 100)

        payment_sum = func.coalesce(
            func.sum(Payment.amount * (Decimal("1.0") - cast(Payment.discount_percent, Numeric) / Decimal("100.0"))),
            Decimal("0.0")
        )
        debt_expr = Enrollment.price_at_enrollment - payment_sum

        due_date_this_month = func.make_date(
            cast(extract('year', func.current_date()), Integer),
            cast(extract('month', func.current_date()), Integer),
            User.payment_day_of_month
        )
        
        due_date = case(
            (func.current_date() >= due_date_this_month, due_date_this_month),
            else_=cast(due_date_this_month - text("interval '1 month'"), Date)
        )
        
        overdue_days_expr = case(
            (User.payment_day_of_month.is_(None), 0),
            (debt_expr <= 0, 0),
            else_=func.current_date() - due_date
        )

        base_query = select(
            Enrollment,
            User,
            Course,
            payment_sum.label("total_paid"),
            overdue_days_expr.label("calc_overdue_days")
        ).join(
            User, User.id == Enrollment.student_id
        ).join(
            Course, Course.id == Enrollment.course_id
        ).outerjoin(
            Payment,
            (Payment.student_id == Enrollment.student_id) & (Payment.course_id == Enrollment.course_id)
        ).filter(
            Enrollment.is_deleted == False
        ).group_by(
            Enrollment.id,
            User.id,
            Course.id
        )

        course_id = filters.get("course_id")
        if course_id:
            base_query = base_query.filter(Enrollment.course_id == course_id)

        min_debt = filters.get("min_debt")
        if min_debt is not None:
            base_query = base_query.having(debt_expr >= min_debt)
        else:
            base_query = base_query.having(debt_expr > Decimal("0.0"))

        overdue_days_filter = filters.get("overdue_days")
        if overdue_days_filter is not None:
            base_query = base_query.having(overdue_days_expr >= overdue_days_filter)

        count_subquery = base_query.subquery()
        count_query = select(func.count()).select_from(count_subquery)
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        offset = (page - 1) * page_size

        paginated_query = base_query.order_by(debt_expr.desc()).offset(offset).limit(page_size)
        result = await self.db.execute(paginated_query)
        rows = list(result.all())

        items = []
        for enrollment, student, course, total_paid, calc_overdue_days in rows:
            debt = enrollment.price_at_enrollment - total_paid
            
            # Post-process to ensure we don't return negative numbers if something goes weird
            overdue_days = max(0, int(calc_overdue_days))

            items.append({
                "student": {
                    "id": student.id,
                    "first_name": student.first_name,
                    "last_name": student.last_name,
                    "email": student.email,
                    "payment_day_of_month": student.payment_day_of_month
                },
                "course": {
                    "id": course.id,
                    "title": course.title
                },
                "price_at_enrollment": enrollment.price_at_enrollment,
                "total_paid": total_paid,
                "debt": debt,
                "overdue_days": overdue_days
            })

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }

    async def get_analytics(self, date_from: date, date_to: date) -> dict:
        import json
        from app.core.redis import redis_client
        from app.models.enrollment import EnrollmentStatus

        cache_key = f"finance:analytics:{date_from.isoformat()}:{date_to.isoformat()}"
        cached_data = await redis_client.get(cache_key)
        if cached_data:
            return json.loads(cached_data)

        receivable_query = select(func.sum(Enrollment.price_at_enrollment)).filter(
            Enrollment.status == EnrollmentStatus.ACTIVE,
            Enrollment.is_deleted == False
        )
        receivable_res = await self.db.execute(receivable_query)
        total_receivable = receivable_res.scalar() or Decimal("0.00")

        import datetime
        from datetime import time as dtime
        dt_from = datetime.datetime.combine(date_from, dtime.min).replace(tzinfo=datetime.timezone.utc)
        dt_to = datetime.datetime.combine(date_to, dtime.max).replace(tzinfo=datetime.timezone.utc)

        collected_query = select(func.sum(
            Payment.amount * (Decimal("1.0") - cast(Payment.discount_percent, Numeric) / Decimal("100.0"))
        )).filter(
            Payment.paid_at >= dt_from,
            Payment.paid_at <= dt_to
        )
        collected_res = await self.db.execute(collected_query)
        total_collected = collected_res.scalar() or Decimal("0.00")

        paid_subquery = select(
            Payment.student_id,
            Payment.course_id,
            func.coalesce(func.sum(Payment.amount * (Decimal("1.0") - cast(Payment.discount_percent, Numeric) / Decimal("100.0"))), Decimal("0.0")).label("total_paid")
        ).group_by(
            Payment.student_id,
            Payment.course_id
        ).subquery()

        debt_query = select(
            Enrollment.student_id,
            User.first_name,
            User.last_name,
            User.email,
            func.sum(Enrollment.price_at_enrollment - func.coalesce(paid_subquery.c.total_paid, Decimal("0.0"))).label("student_debt")
        ).join(
            User, User.id == Enrollment.student_id
        ).outerjoin(
            paid_subquery,
            (paid_subquery.c.student_id == Enrollment.student_id) & (paid_subquery.c.course_id == Enrollment.course_id)
        ).filter(
            Enrollment.is_deleted == False
        ).group_by(
            Enrollment.student_id,
            User.id
        ).having(
            func.sum(Enrollment.price_at_enrollment - func.coalesce(paid_subquery.c.total_paid, Decimal("0.0"))) > 0
        )

        debt_res = await self.db.execute(debt_query)
        debtors_rows = list(debt_res.all())

        unpaid_students_count = len(debtors_rows)

        sorted_debtors = sorted(debtors_rows, key=lambda r: r.student_debt, reverse=True)
        top_10 = sorted_debtors[:10]

        debtors_preview = []
        for s_id, first_name, last_name, email, debt in top_10:
            debtors_preview.append({
                "student_id": s_id,
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "debt": float(debt)
            })

        analytics_data = {
            "total_receivable": float(total_receivable),
            "total_collected": float(total_collected),
            "unpaid_students_count": unpaid_students_count,
            "debtors_preview": debtors_preview
        }

        await redis_client.set(cache_key, json.dumps(analytics_data), ex=600)
        return analytics_data
