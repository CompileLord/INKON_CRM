import { describe, expect, it } from "vitest";
import { JournalStudentOrdering } from "./JournalStudentOrdering";
import type { JournalStudentResponse } from "./types";

function student(id: number): JournalStudentResponse {
  return { student_id: id, first_name: `S${id}`, last_name: "X", email: "", color_hex: "", entries: [], summary: null };
}

describe("JournalStudentOrdering", () => {
  it("keeps the remembered order when the server returns the students in another order", () => {
    const ordered = JournalStudentOrdering.stabilize([1, 2, 3], [student(3), student(1), student(2)]);
    expect(ordered.map((entry) => entry.student_id)).toEqual([1, 2, 3]);
  });

  it("appends students that arrive later at the end and drops departed ones", () => {
    const ordered = JournalStudentOrdering.stabilize([1, 2, 3], [student(9), student(3), student(1)]);
    expect(ordered.map((entry) => entry.student_id)).toEqual([1, 3, 9]);
  });

  it("returns the server order on first sight", () => {
    const ordered = JournalStudentOrdering.stabilize([], [student(5), student(4)]);
    expect(ordered.map((entry) => entry.student_id)).toEqual([5, 4]);
  });
});
