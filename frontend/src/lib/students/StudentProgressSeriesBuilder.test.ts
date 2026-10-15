import { describe, expect, it } from "vitest";
import { StudentProgressSeriesBuilder } from "./StudentProgressSeriesBuilder";
import type { CourseStaffProgressResponse } from "../courses/types";
import type { StudentJournalPeriod } from "../users/types";

const course = { id: 7, title: "Algebra" };

const staffProgress: CourseStaffProgressResponse = {
  course_id: 7,
  periods: [
    { id: 1, period_label: "W1", period_start: "2026-01-01", period_end: "2026-01-07" },
    { id: 2, period_label: "W2", period_start: "2026-01-08", period_end: "2026-01-14" },
    { id: 3, period_label: "W3", period_start: "2026-01-15", period_end: "2026-01-21" },
  ],
  students: [
    {
      student_id: 5,
      first_name: "A",
      last_name: "B",
      grading_provenance: "unknown",
      period_results: [
        { period_id: 1, grading_state: "unknown", score: 5, max_score: 10, percentage: 50 },
        { period_id: 3, grading_state: "unknown", score: 0, max_score: 10, percentage: 0 },
      ],
    },
    {
      student_id: 6,
      first_name: "C",
      last_name: "D",
      grading_provenance: "unknown",
      period_results: [{ period_id: 1, grading_state: "unknown", score: 9, max_score: 10, percentage: 90 }],
    },
  ],
};

function journal(overrides: Partial<StudentJournalPeriod>): StudentJournalPeriod {
  return {
    journal_id: 1,
    course_id: 7,
    course_title: "Algebra",
    period_label: "W1",
    period_start: "2026-01-01",
    period_end: "2026-01-07",
    sum_score: 5,
    max_period_score: 10,
    percentage: 50,
    attendance_count: 1,
    total_lessons: 1,
    state: "graded",
    ...overrides,
  };
}

describe("StudentProgressSeriesBuilder", () => {
  it("selects only the requested student's results and keeps a stored zero distinct from a missing period", () => {
    const series = StudentProgressSeriesBuilder.fromStaffProgress(course, 2, staffProgress, 5);
    expect(series.values).toEqual([50, null, 0]);
    expect(series.periodLabels).toEqual(["W1", "W2", "W3"]);
    expect(series.slot).toBe(2);
  });

  it("yields no graded points for a student missing from the course roster", () => {
    const series = StudentProgressSeriesBuilder.fromStaffProgress(course, 0, staffProgress, 99);
    expect(series.values).toEqual([null, null, null]);
    expect(StudentProgressSeriesBuilder.gradedPeriodCount(series)).toBe(0);
  });

  it("orders own journal periods by start date, keeps only graded results and ignores other courses", () => {
    const series = StudentProgressSeriesBuilder.fromOwnJournals(course, 0, [
      journal({ journal_id: 2, period_label: "W2", period_start: "2026-01-08", percentage: 70 }),
      journal({ journal_id: 1, period_label: "W1", period_start: "2026-01-01", percentage: 60 }),
      journal({ journal_id: 3, period_label: "W3", period_start: "2026-01-15", state: "in_progress", percentage: 10 }),
      journal({ journal_id: 4, course_id: 8, period_label: "Other", percentage: 99 }),
    ]);
    expect(series.periodLabels).toEqual(["W1", "W2", "W3"]);
    expect(series.values).toEqual([60, 70, null]);
  });

  it("counts a chart as drawable only when some course has at least two graded periods", () => {
    const oneGradedEach = [
      { courseId: 1, title: "A", slot: 0, periodLabels: ["a", "b"], values: [50, null] },
      { courseId: 2, title: "B", slot: 1, periodLabels: ["a", "b"], values: [null, 60] },
    ];
    expect(StudentProgressSeriesBuilder.canDrawChart(oneGradedEach)).toBe(false);
    const oneCourseWithTwo = [...oneGradedEach, { courseId: 3, title: "C", slot: 2, periodLabels: ["a", "b"], values: [10, 20] }];
    expect(StudentProgressSeriesBuilder.canDrawChart(oneCourseWithTwo)).toBe(true);
    expect(StudentProgressSeriesBuilder.canDrawChart([])).toBe(false);
  });
});
