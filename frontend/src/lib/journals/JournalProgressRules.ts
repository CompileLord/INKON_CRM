import type {
  CourseStaffProgressResponse,
  StaffProgressPeriod,
  StaffProgressPeriodResult,
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

export interface ProgressChartStudent {
  studentId: number;
  name: string;
  slot: number;
  dashVariant: number;
  results: (StoredPeriodResult | null)[];
  latestPercentage: number | null;
}

export interface ProgressLineVertex {
  index: number;
  value: number;
}

export interface ChartCoordinate {
  x: number;
  y: number;
}

export type ProgressSortKey = { kind: "period"; index: number } | { kind: "average" } | { kind: "trend" };

export interface ProgressSort {
  key: ProgressSortKey;
  direction: "desc" | "asc";
}

export type TrendDirection = "up" | "down" | "flat";

export interface ProgressTrend {
  direction: TrendDirection;
  magnitude: number;
}

export class JournalProgressRules {
  static readonly REFERENCE_PERCENTAGE: number = 100;
  static readonly SERIES_SLOT_COUNT: number = 8;
  static readonly DEFAULT_VISIBLE_STUDENTS: number = 6;
  static readonly TOGGLE_ALL_THRESHOLD: number = 6;
  static readonly STUDENT_DASH_PATTERNS: readonly (string | undefined)[] = [undefined, "2 3", "10 3 2 3", "1 5"];

  static dashPattern(variant: number): string | undefined {
    return JournalProgressRules.STUDENT_DASH_PATTERNS[variant % JournalProgressRules.STUDENT_DASH_PATTERNS.length];
  }

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

  static startedRows(rows: ProgressPeriodRow[]): ProgressPeriodRow[] {
    return rows.filter((row) => !row.upcoming);
  }

  static chartStudents(data: CourseStaffProgressResponse, startedRows: ProgressPeriodRow[]): ProgressChartStudent[] {
    const students: Omit<ProgressChartStudent, "slot" | "dashVariant">[] = data.students.map((student) => {
      const results: (StoredPeriodResult | null)[] = startedRows.map((row) =>
        JournalProgressRules.storedResult(student.period_results.find((candidate) => candidate.period_id === row.period.id)),
      );
      const latest: StoredPeriodResult | undefined = [...results].reverse().find((result): result is StoredPeriodResult => result !== null);
      return {
        studentId: student.student_id,
        name: `${student.first_name} ${student.last_name}`,
        results,
        latestPercentage: latest ? latest.percentage : null,
      };
    });
    students.sort((first, second) => {
      if (first.latestPercentage === null && second.latestPercentage === null) return first.name.localeCompare(second.name);
      if (first.latestPercentage === null) return 1;
      if (second.latestPercentage === null) return -1;
      return second.latestPercentage - first.latestPercentage || first.name.localeCompare(second.name);
    });
    return students.map((student, index) => ({
      ...student,
      slot: index % JournalProgressRules.SERIES_SLOT_COUNT,
      dashVariant: Math.floor(index / JournalProgressRules.SERIES_SLOT_COUNT),
    }));
  }

  static defaultVisibleIds(students: ProgressChartStudent[], pinnedStudentId: number | null = null): Set<number> {
    const visible: ProgressChartStudent[] =
      students.length > JournalProgressRules.TOGGLE_ALL_THRESHOLD
        ? students.slice(0, JournalProgressRules.DEFAULT_VISIBLE_STUDENTS)
        : students;
    const visibleIds: Set<number> = new Set(visible.map((student) => student.studentId));
    if (pinnedStudentId !== null && students.some((student) => student.studentId === pinnedStudentId)) {
      visibleIds.add(pinnedStudentId);
    }
    return visibleIds;
  }

  static pinFirst(students: ProgressChartStudent[], pinnedStudentId: number | null): ProgressChartStudent[] {
    if (pinnedStudentId === null) return students;
    const pinned: ProgressChartStudent[] = students.filter((student) => student.studentId === pinnedStudentId);
    return [...pinned, ...students.filter((student) => student.studentId !== pinnedStudentId)];
  }

  static domainMaximum(values: (number | null)[]): number {
    return Math.max(JournalProgressRules.REFERENCE_PERCENTAGE, ...values.filter((value): value is number => value !== null));
  }

  static lineRuns(values: (number | null)[]): ProgressLineVertex[][] {
    const runs: ProgressLineVertex[][] = [];
    let current: ProgressLineVertex[] = [];
    values.forEach((value, index) => {
      if (value === null) {
        if (current.length > 0) runs.push(current);
        current = [];
        return;
      }
      current.push({ index, value });
    });
    if (current.length > 0) runs.push(current);
    return runs;
  }

  static monotonePath(coordinates: ChartCoordinate[]): string {
    const count: number = coordinates.length;
    if (count === 0) return "";
    if (count === 1) return `M${coordinates[0].x},${coordinates[0].y}`;
    const widths: number[] = [];
    const slopes: number[] = [];
    for (let index = 0; index < count - 1; index += 1) {
      widths.push(coordinates[index + 1].x - coordinates[index].x);
      slopes.push((coordinates[index + 1].y - coordinates[index].y) / widths[index]);
    }
    const tangents: number[] = new Array<number>(count).fill(0);
    if (count === 2) {
      tangents[0] = slopes[0];
      tangents[1] = slopes[0];
    } else {
      for (let index = 1; index < count - 1; index += 1) {
        const weighted: number = (slopes[index - 1] * widths[index] + slopes[index] * widths[index - 1]) / (widths[index - 1] + widths[index]);
        tangents[index] =
          (Math.sign(slopes[index - 1]) + Math.sign(slopes[index])) *
            Math.min(Math.abs(slopes[index - 1]), Math.abs(slopes[index]), 0.5 * Math.abs(weighted)) || 0;
      }
      tangents[0] = (3 * slopes[0] - tangents[1]) / 2;
      tangents[count - 1] = (3 * slopes[count - 2] - tangents[count - 2]) / 2;
    }
    let path: string = `M${coordinates[0].x},${coordinates[0].y}`;
    for (let index = 0; index < count - 1; index += 1) {
      const third: number = widths[index] / 3;
      const from: ChartCoordinate = coordinates[index];
      const to: ChartCoordinate = coordinates[index + 1];
      path += `C${from.x + third},${from.y + tangents[index] * third},${to.x - third},${to.y - tangents[index + 1] * third},${to.x},${to.y}`;
    }
    return path;
  }

  static averageOf(values: (number | null)[]): number | null {
    const present: number[] = values.filter((value): value is number => value !== null);
    return present.length === 0 ? null : present.reduce((total, value) => total + value, 0) / present.length;
  }

  static trendOf(values: (number | null)[]): ProgressTrend | null {
    const present: number[] = values.filter((value): value is number => value !== null);
    if (present.length < 2) return null;
    const change: number = Math.round(present[present.length - 1] - present[0]);
    return { direction: change > 0 ? "up" : change < 0 ? "down" : "flat", magnitude: Math.abs(change) };
  }

  static signedTrend(trend: ProgressTrend | null): number | null {
    if (trend === null) return null;
    return trend.direction === "down" ? -trend.magnitude : trend.magnitude;
  }

  static sortValue(student: ProgressChartStudent, key: ProgressSortKey): number | null {
    const values: (number | null)[] = student.results.map((result) => (result ? result.percentage : null));
    if (key.kind === "period") return values[key.index] ?? null;
    if (key.kind === "average") return JournalProgressRules.averageOf(values);
    return JournalProgressRules.signedTrend(JournalProgressRules.trendOf(values));
  }

  static sortStudents(students: ProgressChartStudent[], sort: ProgressSort): ProgressChartStudent[] {
    const factor: number = sort.direction === "desc" ? -1 : 1;
    return [...students].sort((first, second) => {
      const firstValue: number | null = JournalProgressRules.sortValue(first, sort.key);
      const secondValue: number | null = JournalProgressRules.sortValue(second, sort.key);
      if (firstValue === null && secondValue === null) return first.name.localeCompare(second.name);
      if (firstValue === null) return 1;
      if (secondValue === null) return -1;
      return (firstValue - secondValue) * factor || first.name.localeCompare(second.name);
    });
  }
}
