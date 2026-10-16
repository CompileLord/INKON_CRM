import type { StudentJournalPeriod } from "../users/types";

export interface CourseResultSummary {
  startedPeriods: number;
  gradedPeriods: number;
  averagePercentage: number | null;
  attendedLessons: number;
  totalLessons: number;
}

export class CourseResultSummaries {
  static isCounted(period: StudentJournalPeriod): boolean {
    const hasRecordedBasis: boolean = period.sum_score > 0 || period.attendance_count > 0 || period.total_lessons > 0;
    return period.state !== "upcoming" && period.max_period_score > 0 && hasRecordedBasis;
  }

  static summarize(periods: readonly StudentJournalPeriod[]): CourseResultSummary {
    const started: StudentJournalPeriod[] = periods.filter((period) => period.state !== "upcoming");
    const counted: StudentJournalPeriod[] = started.filter(CourseResultSummaries.isCounted);
    const percentageSum: number = counted.reduce((total, period) => total + period.percentage, 0);
    return {
      startedPeriods: started.length,
      gradedPeriods: counted.length,
      averagePercentage: counted.length > 0 ? percentageSum / counted.length : null,
      attendedLessons: started.reduce((total, period) => total + period.attendance_count, 0),
      totalLessons: started.reduce((total, period) => total + period.total_lessons, 0),
    };
  }

  static byCourse(periods: readonly StudentJournalPeriod[]): Map<number, CourseResultSummary> {
    const grouped: Map<number, StudentJournalPeriod[]> = new Map();
    periods.forEach((period) => grouped.set(period.course_id, [...(grouped.get(period.course_id) ?? []), period]));
    return new Map([...grouped].map(([courseId, items]) => [courseId, CourseResultSummaries.summarize(items)]));
  }
}
