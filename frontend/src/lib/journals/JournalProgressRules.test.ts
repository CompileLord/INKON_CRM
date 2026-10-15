import { describe, expect, it } from "vitest";
import { JournalProgressRules } from "./JournalProgressRules";
import type { CourseStaffProgressResponse } from "../courses/types";

const result = (periodId: number, score: number | null, maxScore: number | null, percentage: number | null) => ({
  period_id: periodId,
  grading_state: "missing" as const,
  score,
  max_score: maxScore,
  percentage,
});

const data: CourseStaffProgressResponse = {
  course_id: 1,
  periods: [
    { id: 1, period_label: "A", period_start: "2026-08-01", period_end: "2026-08-31" },
    { id: 2, period_label: "B", period_start: "2026-09-01", period_end: "2026-09-30" },
  ],
  students: [
    { student_id: 1, first_name: "Ann", last_name: "X", grading_provenance: "unknown", period_results: [result(1, 0, 24, 0), result(2, null, null, null)] },
    { student_id: 2, first_name: "Bob", last_name: "Y", grading_provenance: "unknown", period_results: [result(1, 12, 24, 50), result(2, null, null, null)] },
    { student_id: 3, first_name: "Cy", last_name: "Z", grading_provenance: "unknown", period_results: [] },
  ],
};

describe("JournalProgressRules", () => {
  it("averages stored values only, counting a stored zero and excluding missing results", () => {
    const [first, second] = JournalProgressRules.buildPeriodRows(data, "2026-12-31");
    expect(first).toMatchObject({ storedCount: 2, rosterCount: 3, unavailableCount: 1, averagePercentage: 25 });
    expect(second).toMatchObject({ storedCount: 0, unavailableCount: 3, averagePercentage: null });
  });

  it("treats a stored zero as stored and a null total as missing", () => {
    expect(JournalProgressRules.storedResult(result(1, 0, 24, 0))).toEqual({ score: 0, maxScore: 24, percentage: 0 });
    expect(JournalProgressRules.storedResult(result(1, null, null, null))).toBeNull();
    expect(JournalProgressRules.storedResult(undefined)).toBeNull();
  });

  it("extends the bar domain beyond 100 and never below it", () => {
    const rows = JournalProgressRules.buildPeriodRows(data, "2026-12-31");
    expect(JournalProgressRules.barDomainMaximum(rows, null)).toBe(100);
    const above = [{ periodId: 1, result: { score: 25, maxScore: 24, percentage: 104.2 } }];
    expect(JournalProgressRules.barDomainMaximum(rows, above)).toBe(104.2);
  });

  it("marks only periods starting after today as upcoming, by date alone", () => {
    const rows = JournalProgressRules.buildPeriodRows(data, "2026-08-31");
    expect(rows.map((row) => row.upcoming)).toEqual([false, true]);
    expect(JournalProgressRules.buildPeriodRows(data, "2026-09-01").map((row) => row.upcoming)).toEqual([false, false]);
  });

  it("keeps upcoming periods out of the bar domain", () => {
    const upcomingData: CourseStaffProgressResponse = {
      ...data,
      students: [{ ...data.students[0], period_results: [result(1, 0, 24, 0), result(2, 30, 24, 125)] }],
    };
    const rows = JournalProgressRules.buildPeriodRows(upcomingData, "2026-08-31");
    expect(JournalProgressRules.barDomainMaximum(rows, null)).toBe(100);
  });
});
