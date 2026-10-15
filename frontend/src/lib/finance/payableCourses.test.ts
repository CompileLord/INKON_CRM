import { describe, expect, it } from "vitest";
import { PayableCourses } from "./payableCourses";
import type { EnrollmentResponse } from "../enrollments/types";
import type { ChargeItem } from "./types";

function enrollment(id: number, courseId: number, status: EnrollmentResponse["status"] = "active"): EnrollmentResponse {
  return { id, student_id: 1, course_id: courseId, price_at_enrollment: "100", color_hex: "#000000", enrolled_at: "2026-09-01T00:00:00Z", status, is_deleted: false };
}

function charge(id: number, enrollmentId: number, title: string | null): ChargeItem {
  return { id, student_id: 1, enrollment_id: enrollmentId, sequence_no: 1, type: "tuition", amount: "10", due_date: "2026-10-01", status: "open", allocated_amount: "0", remaining_balance: "10", course_title: title };
}

describe("payable courses", () => {
  it("names each enrolled course from its charges and keeps every returned enrollment status", () => {
    expect(PayableCourses.build([enrollment(1, 11), enrollment(2, 12, "withdrawn")], [charge(5, 1, "Python"), charge(6, 2, "English")])).toEqual([
      { courseId: 11, title: "Python" },
      { courseId: 12, title: "English" },
    ]);
  });

  it("keeps a course without charges selectable with a null title instead of dropping it", () => {
    expect(PayableCourses.build([enrollment(1, 11)], [])).toEqual([{ courseId: 11, title: null }]);
  });

  it("lists a course once even when two enrollments point at it and prefers a known title", () => {
    expect(PayableCourses.build([enrollment(1, 11), enrollment(2, 11)], [charge(5, 2, "Python")])).toEqual([{ courseId: 11, title: "Python" }]);
  });
});
