import type {
  CourseStaffProgressResponse,
  StaffProgressPeriod,
  StaffProgressPeriodResult,
  StaffProgressStudent,
} from "../courses/types";

export interface StoredPeriodResult {
  score: number;
  maxScore: number;
  percentage: number;
}

export interface ProgressPeriodRow {
  period: StaffProgressPeriod;
  rosterCount: number;
  storedCount: number;
  unavailableCount: number;
  averagePercentage: number | null;
  upcoming: boolean;
}

export interface StudentPeriodComparison {
  periodId: number;
  result: StoredPeriodResult | null;
}

export class JournalProgressRules {
  static readonly REFERENCE_PERCENTAGE: number = 100;

  static storedResult(result: StaffProgressPeriodResult | undefined): StoredPeriodResult | null {
    if (!result || result.score === null || result.max_score === null || result.percentage === null) return null;
    return { score: result.score, maxScore: result.max_score, percentage: result.percentage };
  }

  static buildPeriodRows(data: CourseStaffProgressResponse, today: string): ProgressPeriodRow[] {
    return data.periods.map((period) => {
      const stored: StoredPeriodResult[] = data.students.flatMap((student) => {
        const result: StoredPeriodResult | null = JournalProgressRules.storedResult(
          student.period_results.find((candidate) => candidate.period_id === period.id),
        );
        return result ? [result] : [];
      });
      const percentageSum: number = stored.reduce((total, result) => total + result.percentage, 0);
      return {
        period,
        rosterCount: data.students.length,
        storedCount: stored.length,
        unavailableCount: data.students.length - stored.length,
        averagePercentage: stored.length === 0 ? null : percentageSum / stored.length,
        upcoming: period.period_start > today,
      };
    });
  }

  static compareStudent(student: StaffProgressStudent, periods: StaffProgressPeriod[]): StudentPeriodComparison[] {
    return periods.map((period) => ({
      periodId: period.id,
      result: JournalProgressRules.storedResult(student.period_results.find((candidate) => candidate.period_id === period.id)),
    }));
  }

  static barDomainMaximum(rows: ProgressPeriodRow[], comparison: StudentPeriodComparison[] | null): number {
    const values: number[] = [JournalProgressRules.REFERENCE_PERCENTAGE];
    rows.forEach((row) => {
      if (!row.upcoming && row.averagePercentage !== null) values.push(row.averagePercentage);
    });
    comparison?.forEach((item) => {
      if (item.result) values.push(item.result.percentage);
    });
    return Math.max(...values);
  }
}
