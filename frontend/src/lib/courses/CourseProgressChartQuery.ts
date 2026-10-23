import type { CourseProgressChartOptions } from "./types";

export class CourseProgressChartQuery {
  static readonly DEFAULT_PERIOD_LIMIT: number = 12;
  static readonly DEFAULT_STUDENT_LIMIT: number = 30;

  static resolve(options: CourseProgressChartOptions = {}): Required<CourseProgressChartOptions> {
    return {
      periodOffset: options.periodOffset ?? 0,
      periodLimit: options.periodLimit ?? CourseProgressChartQuery.DEFAULT_PERIOD_LIMIT,
      studentOffset: options.studentOffset ?? 0,
      studentLimit: options.studentLimit ?? CourseProgressChartQuery.DEFAULT_STUDENT_LIMIT,
    };
  }

  static key(id: number | undefined, options: CourseProgressChartOptions = {}) {
    const resolved: Required<CourseProgressChartOptions> = CourseProgressChartQuery.resolve(options);
    return ["courses", "progress-chart", id, resolved.periodOffset, resolved.periodLimit, resolved.studentOffset, resolved.studentLimit] as const;
  }
}
