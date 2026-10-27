from datetime import date, time
from decimal import Decimal
from pydantic import BaseModel


class AttentionLesson(BaseModel):
    course_id: int
    course_title: str
    time_start: time
    time_end: time
    mentor_name: str
    mentor_phone: str | None
    journal_id: int | None


class AttentionAbsentStudent(BaseModel):
    student_id: int
    student_name: str
    consecutive_absences: int


class AttentionAbsence(AttentionLesson):
    students: list[AttentionAbsentStudent]


class AttentionPayment(BaseModel):
    student_id: int
    student_name: str
    course_id: int
    course_title: str
    enrollment_id: int
    due_date: date
    remaining_amount: Decimal


class DashboardAttentionResponse(BaseModel):
    lessons_in_progress: list[AttentionLesson]
    attendance_not_marked: list[AttentionLesson]
    absent_students: list[AttentionAbsence]
    payments: list[AttentionPayment]
