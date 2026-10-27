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

  it("marks only periods starting after today as upcoming, by date alone", () => {
    expect(JournalProgressRules.buildPeriodRows(data, "2026-08-31").map((row) => row.upcoming)).toEqual([false, true]);
    expect(JournalProgressRules.buildPeriodRows(data, "2026-09-01").map((row) => row.upcoming)).toEqual([false, false]);
  });

  it("orders chart students by latest stored value, missing last, and assigns stable slots", () => {
    const rows = JournalProgressRules.startedRows(JournalProgressRules.buildPeriodRows(data, "2026-12-31"));
    const students = JournalProgressRules.chartStudents(data, rows);
    expect(students.map((student) => student.name)).toEqual(["Bob Y", "Ann X", "Cy Z"]);
    expect(students.map((student) => student.slot)).toEqual([0, 1, 2]);
    expect(students[2].results).toEqual([null, null]);
    expect(students[1].latestPercentage).toBe(0);
  });

  it("shows everyone up to six students and the top six above that", () => {
    const many: CourseStaffProgressResponse = {
      ...data,
      students: Array.from({ length: 8 }, (_, index) => ({
        student_id: index + 1,
        first_name: `S${index}`,
        last_name: "T",
        grading_provenance: "unknown" as const,
        period_results: [result(1, index, 24, index * 10)],
      })),
    };
    const rows = JournalProgressRules.startedRows(JournalProgressRules.buildPeriodRows(many, "2026-12-31"));
    const students = JournalProgressRules.chartStudents(many, rows);
    const visible = JournalProgressRules.defaultVisibleIds(students);
    expect(visible.size).toBe(6);
    expect([...visible].sort()).toEqual([3, 4, 5, 6, 7, 8]);
    const few = JournalProgressRules.chartStudents(data, rows);
    expect(JournalProgressRules.defaultVisibleIds(few).size).toBe(3);
  });

  it("gives each student beyond the palette a distinct dash variant so no two lines look identical", () => {
    const wide: CourseStaffProgressResponse = {
      ...data,
      students: Array.from({ length: 18 }, (_, index) => ({
        student_id: index + 1,
        first_name: `S${index}`,
        last_name: "T",
        grading_provenance: "unknown" as const,
        period_results: [result(1, index, 24, index * 5)],
      })),
    };
    const rows = JournalProgressRules.startedRows(JournalProgressRules.buildPeriodRows(wide, "2026-12-31"));
    const students = JournalProgressRules.chartStudents(wide, rows);
    const looks = new Set(students.map((student) => `${student.slot}:${JournalProgressRules.dashPattern(student.dashVariant)}`));
    expect(looks.size).toBe(18);
    expect(students[0].dashVariant).toBe(0);
    expect(students[17].dashVariant).toBe(2);
  });

  it("fits the y-domain to the data in multiples of ten and never above the period maximum", () => {
    expect(JournalProgressRules.fittedDomain([40, 62, null, 90], 100)).toEqual({ lower: 40, upper: 90 });
    expect(JournalProgressRules.fittedDomain([43, 87], 100)).toEqual({ lower: 40, upper: 90 });
    expect(JournalProgressRules.fittedDomain([43, 98], 100)).toEqual({ lower: 40, upper: 100 });
    expect(JournalProgressRules.fittedDomain([43, 97], 98)).toEqual({ lower: 40, upper: 98 });
    expect(JournalProgressRules.fittedDomain([3, 24.5], 24)).toEqual({ lower: 0, upper: 24.5 });
    expect(JournalProgressRules.fittedDomain([100], 100)).toEqual({ lower: 90, upper: 100 });
    expect(JournalProgressRules.fittedDomain([55], 100)).toEqual({ lower: 50, upper: 60 });
    expect(JournalProgressRules.fittedDomain([null], null)).toEqual({ lower: 0, upper: 10 });
  });

  it("places round ticks inside the fitted domain and always ends on its upper bound", () => {
    expect(JournalProgressRules.domainTicks({ lower: 40, upper: 90 })).toEqual([40, 50, 60, 70, 80, 90]);
    expect(JournalProgressRules.domainTicks({ lower: 0, upper: 25 })).toEqual([0, 5, 10, 15, 20, 25]);
    expect(JournalProgressRules.domainTicks({ lower: 40, upper: 98 }).at(-1)).toBe(98);
    expect(JournalProgressRules.domainTicks({ lower: 90, upper: 100 })[0]).toBe(90);
  });

  it("reports the average score and the per-period maximum next to the average percentage", () => {
    const [first, second] = JournalProgressRules.buildPeriodRows(data, "2026-12-31");
    expect(first).toMatchObject({ averageScore: 6, maxScore: 24 });
    expect(second).toMatchObject({ averageScore: null, maxScore: null });
  });

  it("keeps the highest stored maximum of a period so a differing maximum per period is preserved", () => {
    const differing: CourseStaffProgressResponse = {
      ...data,
      students: [{ student_id: 1, first_name: "A", last_name: "B", grading_provenance: "unknown", period_results: [result(1, 50, 117, 43), result(2, 30, 70, 43)] }],
    };
    expect(JournalProgressRules.buildPeriodRows(differing, "2026-12-31").map((row) => row.maxScore)).toEqual([117, 70]);
  });

  it("draws a step line that holds each value across its period and jumps at the midpoints", () => {
    const path = JournalProgressRules.stepPath([{ x: 0, y: 10 }, { x: 20, y: 40 }, { x: 40, y: 40 }]);
    expect(path).toBe("M-10,10H10V40H30V40H50");
    expect(JournalProgressRules.stepPath([{ x: 0, y: 10 }, { x: 20, y: 40 }, { x: 40, y: 40 }], 0, 40)).toBe("M0,10H10V40H30V40H40");
    expect(JournalProgressRules.stepPath([])).toBe("");
    expect(JournalProgressRules.stepPath([{ x: 5, y: 7 }])).toBe("M-7,7H17");
  });

  it("keeps a single student with the first palette slot for a read-only view of one's own results", () => {
    const rows = JournalProgressRules.startedRows(JournalProgressRules.buildPeriodRows(data, "2026-12-31"));
    const only = JournalProgressRules.onlyStudent(JournalProgressRules.chartStudents(data, rows), 1);
    expect(only).toHaveLength(1);
    expect(only[0]).toMatchObject({ studentId: 1, slot: 0, dashVariant: 0 });
    expect(JournalProgressRules.onlyStudent(JournalProgressRules.chartStudents(data, rows), 99)).toEqual([]);
  });

  it("breaks lines at missing values", () => {
    expect(JournalProgressRules.lineRuns([10, 20, null, 30, null, null, 40, 50]).map((run) => run.map((vertex) => vertex.index))).toEqual([[0, 1], [3], [6, 7]]);
    expect(JournalProgressRules.lineRuns([null, null])).toEqual([]);
  });

  it("draws a monotone curve that never overshoots between real values", () => {
    const coordinates = [{ x: 0, y: 100 }, { x: 10, y: 20 }, { x: 20, y: 20 }, { x: 30, y: 80 }];
    const path = JournalProgressRules.monotonePath(coordinates);
    expect(path.startsWith("M0,100C")).toBe(true);
    const controlYs = Array.from(path.matchAll(/C([\d.-]+),([\d.-]+),([\d.-]+),([\d.-]+),([\d.-]+),([\d.-]+)/g));
    expect(controlYs).toHaveLength(3);
    const flat = controlYs[1];
    expect(Number(flat[2])).toBeCloseTo(20, 5);
    expect(Number(flat[4])).toBeCloseTo(20, 5);
    expect(JournalProgressRules.monotonePath([{ x: 5, y: 7 }])).toBe("M5,7");
    expect(JournalProgressRules.monotonePath([])).toBe("");
  });
});
