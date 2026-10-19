import { describe, expect, it } from "vitest";
import { JournalAtRiskRules } from "./JournalAtRiskRules";
import type { JournalStudentResponse } from "./types";

const DATES: string[] = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
const TODAY: string = "2026-10-09";

function studentWith(attendance: Array<boolean | null>, percentage: number, totalLessons: number = 5): JournalStudentResponse {
  return {
    student_id: 1,
    first_name: "Anvar",
    last_name: "Tester",
    color_hex: "",
    entries: attendance.flatMap((attended, index) =>
      attended === null
        ? []
        : [{ id: index, lesson_date: DATES[index], attendance: attended, score: 0, comment: null, has_comment: false, version: 1 }],
    ),
    summary: {
      id: 1,
      homework_score: 0,
      attendance_score: 0,
      exam_score: 0,
      bonus_score: 0,
      sum_score: 0,
      max_period_score: 100,
      percentage,
      attendance_count: 0,
      total_lessons: totalLessons,
      version: 1,
    },
  };
}

describe("JournalAtRiskRules", () => {
  it("flags a period percentage below 60", () => {
    const student: JournalStudentResponse = studentWith([true, true, true, true, true], 59.9);
    expect(JournalAtRiskRules.isAtRisk(student, DATES, TODAY)).toBe(true);
  });

  it("does not flag a period percentage of exactly 60 with steady attendance", () => {
    const student: JournalStudentResponse = studentWith([true, false, true, false, true], 60);
    expect(JournalAtRiskRules.isAtRisk(student, DATES, TODAY)).toBe(false);
  });

  it("flags three consecutive absences even with a healthy percentage", () => {
    const student: JournalStudentResponse = studentWith([true, false, false, false, true], 90);
    expect(JournalAtRiskRules.isAtRisk(student, DATES, TODAY)).toBe(true);
  });

  it("does not flag two consecutive absences or absences separated by a presence", () => {
    const student: JournalStudentResponse = studentWith([false, false, true, false, false], 90);
    expect(JournalAtRiskRules.isAtRisk(student, DATES, TODAY)).toBe(false);
  });

  it("ignores lessons after today and unrecorded lessons", () => {
    const future: JournalStudentResponse = studentWith([true, true, false, false, false], 90);
    expect(JournalAtRiskRules.hasConsecutiveAbsences(future, DATES, "2026-10-08")).toBe(false);
    const unrecorded: JournalStudentResponse = studentWith([false, false, null, false, false], 90);
    expect(JournalAtRiskRules.hasConsecutiveAbsences(unrecorded, DATES, TODAY)).toBe(false);
  });

  it("does not flag a zero percentage before any lesson has been held", () => {
    const student: JournalStudentResponse = studentWith([], 0, 0);
    expect(JournalAtRiskRules.isAtRisk(student, DATES, TODAY)).toBe(false);
  });
});
