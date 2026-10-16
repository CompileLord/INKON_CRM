import { describe, expect, it } from "vitest";
import { CourseResultSummaries } from "./CourseResultSummary";
import type { StudentJournalPeriod } from "../users/types";

function period(courseId: number, state: StudentJournalPeriod["state"], percentage: number, max = 70, attended = 3, total = 5): StudentJournalPeriod {
  return { journal_id: Math.random(), course_id: courseId, course_title: "C", period_label: "P", period_start: "2026-01-01", period_end: "2026-01-31", sum_score: percentage > 0 ? 1 : 0, max_period_score: max, percentage, attendance_count: attended, total_lessons: total, state };
}

describe("CourseResultSummaries", () => {
  it("averages started periods only, so upcoming zero rows never pull the score down", () => {
    const summary = CourseResultSummaries.summarize([period(1, "graded", 47), period(1, "graded", 53), period(1, "graded", 39), period(1, "upcoming", 0), period(1, "upcoming", 0)]);
    expect(summary.averagePercentage).toBeCloseTo(46.33, 1);
    expect(summary.gradedPeriods).toBe(3);
    expect(summary.startedPeriods).toBe(3);
  });

  it("keeps a genuine zero in a started period", () => {
    const summary = CourseResultSummaries.summarize([period(1, "in_progress", 0), period(1, "graded", 60)]);
    expect(summary.averagePercentage).toBe(30);
    expect(summary.gradedPeriods).toBe(2);
  });

  it("treats a started period with an empty summary as not graded, so it reads Not graded rather than 0%", () => {
    const empty = period(1, "graded", 0, 70, 0, 0);
    const summary = CourseResultSummaries.summarize([empty]);
    expect(summary.averagePercentage).toBeNull();
    expect(summary.gradedPeriods).toBe(0);
  });

  it("has no average when nothing has a positive maximum or started", () => {
    expect(CourseResultSummaries.summarize([period(1, "upcoming", 0)]).averagePercentage).toBeNull();
    expect(CourseResultSummaries.summarize([period(1, "graded", 0, 0)]).averagePercentage).toBeNull();
    expect(CourseResultSummaries.summarize([]).gradedPeriods).toBe(0);
  });

  it("sums attendance over started periods and groups by course", () => {
    const grouped = CourseResultSummaries.byCourse([period(1, "graded", 50), period(1, "upcoming", 0, 70, 9, 9), period(2, "graded", 80)]);
    expect(grouped.get(1)).toMatchObject({ attendedLessons: 3, totalLessons: 5 });
    expect(grouped.get(2)?.averagePercentage).toBe(80);
  });
});
