import type { CourseStaffProgressResponse } from "../courses/types";
import type { StudentJournalPeriod } from "../users/types";

export interface StudentProgressCourseReference {
  id: number;
  title: string;
}

export interface StudentProgressSeries {
  courseId: number;
  title: string;
  slot: number;
  periodLabels: string[];
  values: (number | null)[];
  latestTotal: number | null;
}

export class StudentProgressSeriesBuilder {
  static readonly MINIMUM_GRADED_PERIODS_FOR_LINE: number = 2;

  static fromStaffProgress(
    course: StudentProgressCourseReference,
    slot: number,
    progress: CourseStaffProgressResponse,
    studentId: number,
  ): StudentProgressSeries {
    const studentRow = progress.students.find((student) => student.student_id === studentId);
    const values: (number | null)[] = progress.periods.map((period) => {
      const result = studentRow?.period_results.find((entry) => entry.period_id === period.id);
      return result?.percentage ?? null;
    });
    const latestScore: number | null = [...progress.periods]
      .reverse()
      .map((period) => studentRow?.period_results.find((entry) => entry.period_id === period.id)?.score ?? null)
      .find((score: number | null) => score !== null) ?? null;
    return {
      courseId: course.id,
      title: course.title,
      slot,
      periodLabels: progress.periods.map((period) => period.period_label),
      values,
      latestTotal: latestScore,
    };
  }

  static fromOwnJournals(
    course: StudentProgressCourseReference,
    slot: number,
    journals: StudentJournalPeriod[],
  ): StudentProgressSeries {
    const orderedPeriods: StudentJournalPeriod[] = journals
      .filter((journal) => journal.course_id === course.id)
      .sort((first, second) => first.period_start.localeCompare(second.period_start));
    return {
      courseId: course.id,
      title: course.title,
      slot,
      periodLabels: orderedPeriods.map((journal) => journal.period_label),
      values: orderedPeriods.map((journal) => (journal.state === "graded" ? journal.percentage : null)),
      latestTotal: [...orderedPeriods].reverse().find((journal) => journal.state === "graded")?.sum_score ?? null,
    };
  }

  static gradedPeriodCount(series: StudentProgressSeries): number {
    return series.values.filter((value) => value !== null).length;
  }

  static canDrawChart(seriesList: StudentProgressSeries[]): boolean {
    return seriesList.some(
      (series) => StudentProgressSeriesBuilder.gradedPeriodCount(series) >= StudentProgressSeriesBuilder.MINIMUM_GRADED_PERIODS_FOR_LINE,
    );
  }
}
