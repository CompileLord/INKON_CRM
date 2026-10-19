import { describe, expect, it } from "vitest";
import { JournalBulkFill } from "./JournalBulkFill";
import type { JournalStudentResponse } from "./types";

const LESSON: string = "2026-10-12";

function studentWith(id: number, attendance: boolean, score: number): JournalStudentResponse {
  return {
    student_id: id,
    first_name: "S",
    last_name: String(id),
    color_hex: "",
    entries: [{ id, lesson_date: LESSON, attendance, score, comment: null, has_comment: false, version: 1 }],
    summary: null,
  };
}

const STUDENTS: JournalStudentResponse[] = [
  studentWith(1, false, 0),
  studentWith(2, true, 0),
  studentWith(3, true, 3),
  { ...studentWith(4, false, 0), entries: [] },
];

describe("JournalBulkFill", () => {
  it("marks present only the students who are not yet present", () => {
    const targets = JournalBulkFill.targetsFor("markPresent", STUDENTS, LESSON);
    expect(targets.map((target) => target.studentId)).toEqual([1, 4]);
    expect(targets.every((target) => target.command.kind === "attendance")).toBe(true);
  });

  it("fills homework with 5 only for present students without a score and never overwrites a score", () => {
    const targets = JournalBulkFill.targetsFor("fillHomework", STUDENTS, LESSON);
    expect(targets).toEqual([{ studentId: 2, command: { kind: "score", score: 5 } }]);
  });

  it("targets nothing for a lesson with no empty cells", () => {
    const complete: JournalStudentResponse[] = [studentWith(3, true, 3)];
    expect(JournalBulkFill.targetsFor("fillHomework", complete, LESSON)).toEqual([]);
    expect(JournalBulkFill.targetsFor("markPresent", complete, LESSON)).toEqual([]);
  });
});
