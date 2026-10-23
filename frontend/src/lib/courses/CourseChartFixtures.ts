import type { CourseProgressChartPeriodMetadata } from "./types";

export interface StaffChartMetadata extends CourseProgressChartPeriodMetadata {
  student_offset: number;
  student_limit: number;
  students_total: number;
}

export class CourseChartFixtures {
  static studentMetadata(periodsTotal: number, periodOffset: number = 0, periodLimit: number = 12): CourseProgressChartPeriodMetadata {
    return { period_offset: periodOffset, period_limit: periodLimit, periods_total: periodsTotal, aggregation_scope: "selected_periods" };
  }

  static staffMetadata(periodsTotal: number, studentsTotal: number, periodOffset: number = 0, studentOffset: number = 0): StaffChartMetadata {
    return { ...CourseChartFixtures.studentMetadata(periodsTotal, periodOffset), student_offset: studentOffset, student_limit: 30, students_total: studentsTotal };
  }
}
