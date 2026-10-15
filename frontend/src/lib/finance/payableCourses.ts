import type { EnrollmentResponse } from "../enrollments/types";
import type { ChargeItem } from "./types";

export interface PayableCourse {
  courseId: number;
  title: string | null;
}

export class PayableCourses {
  static build(enrollments: readonly EnrollmentResponse[], charges: readonly ChargeItem[]): PayableCourse[] {
    const titleByEnrollment: Map<number, string> = new Map();
    for (const charge of charges) {
      if (charge.course_title) titleByEnrollment.set(charge.enrollment_id, charge.course_title);
    }
    const courses: Map<number, PayableCourse> = new Map();
    for (const enrollment of enrollments) {
      const title: string | null = titleByEnrollment.get(enrollment.id) ?? null;
      const known: PayableCourse | undefined = courses.get(enrollment.course_id);
      if (known === undefined || (known.title === null && title !== null)) courses.set(enrollment.course_id, { courseId: enrollment.course_id, title });
    }
    return [...courses.values()];
  }
}
