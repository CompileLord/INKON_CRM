import { describe, expect, it } from "vitest";
import { JournalProgressRules } from "./JournalProgressRules";
import type { CourseStaffProgressResponse, JournalPeriod } from "../courses/types";

const stored = (periodId: number, score: number) => ({
  period_id: periodId,
  grading_state: "unknown" as const,
  score,
  max_score: 100,
  percentage: score,
});

const data: CourseStaffProgressResponse = {
  course_id: 1,
  periods: [
    { id: 1, period_label: "A", period_start: "2026-08-01", period_end: "2026-08-31", class_avg_score: 72.5, class_avg_percentage: 72.5 },
    { id: 2, period_label: "B", period_start: "2026-09-01", period_end: "2026-09-30", class_avg_score: 0, class_avg_percentage: 0 },
  ],
  students: [
    { student_id: 1, first_name: "Ann", last_name: "X", grading_provenance: "unknown", period_results: [stored(1, 87), stored(2, 0)] },
    { student_id: 2, first_name: "Bob", last_name: "Y", grading_provenance: "unknown", period_results: [stored(1, 58), stored(2, 0)] },
  ],
};

const journalPeriod = (id: number, start: string, state: JournalPeriod["state"], filled: number): JournalPeriod => ({
  id,
  course_id: 1,
  period_label: `P${id}`,
  period_start: start,
  period_end: start,
  period_type: "month",
  state,
  cells_filled: filled,
});

describe("ungraded periods are gaps, not zero", () => {
  const periods: JournalPeriod[] = [journalPeriod(1, "2026-08-01", "complete", 10), journalPeriod(2, "2026-09-01", "empty", 0)];

  it("finds the ungraded periods from the journal list", () => {
    expect(JournalProgressRules.ungradedPeriodIds(periods)).toEqual(new Set([2]));
  });

  it("drops stored zeros of an ungraded period from the rows and the chart series", () => {
    const ungraded: Set<number> = JournalProgressRules.ungradedPeriodIds(periods);
    const rows = JournalProgressRules.buildPeriodRows(data, "2026-12-31", ungraded);
    expect(rows[1]).toMatchObject({ storedCount: 0, averageScore: null, averagePercentage: null });
    const students = JournalProgressRules.chartStudents(data, rows, ungraded);
    expect(students.every((student) => student.results[1] === null)).toBe(true);
    expect(students.every((student) => student.results[0] !== null)).toBe(true);
  });

  it("keeps a graded zero when the period itself is graded", () => {
    const rows = JournalProgressRules.buildPeriodRows(data, "2026-12-31", new Set());
    expect(rows[1].storedCount).toBe(2);
  });
});

describe("class average comes from the class figure", () => {
  it("uses class_avg_score of the period instead of the visible students", () => {
    const own: CourseStaffProgressResponse = { ...data, students: [data.students[0]] };
    const [first] = JournalProgressRules.buildPeriodRows(own, "2026-12-31");
    expect(first.averageScore).toBe(72.5);
    expect(first.averagePercentage).toBe(72.5);
  });
});

describe("default performance period", () => {
  it("picks the latest started period that has grades, not a future or empty one", () => {
    const periods: JournalPeriod[] = [
      journalPeriod(1, "2026-08-01", "complete", 10),
      journalPeriod(2, "2026-09-01", "partial", 4),
      journalPeriod(3, "2026-10-01", "empty", 0),
      journalPeriod(4, "2026-11-01", "upcoming", 0),
    ];
    expect(JournalProgressRules.latestGradedPeriodId(periods, "2026-10-23")).toBe(2);
  });

  it("falls back to the latest started period when nothing is graded", () => {
    const periods: JournalPeriod[] = [journalPeriod(1, "2026-08-01", "empty", 0), journalPeriod(2, "2026-12-01", "upcoming", 0)];
    expect(JournalProgressRules.latestGradedPeriodId(periods, "2026-10-23")).toBe(1);
  });
});
