import { describe, expect, it } from "vitest";
import { JournalRosterFilter } from "./JournalRosterFilter";
import type { JournalStudentResponse } from "./types";

function student(id: number, first: string, last: string): JournalStudentResponse {
  return { student_id: id, first_name: first, last_name: last, email: "", color_hex: "", entries: [], summary: null };
}

const ROSTER = [student(1, "Anvar", "Rahimov"), student(2, "Bahor", "Karimova"), student(3, "Zara", "Karimova")];

describe("JournalRosterFilter", () => {
  it("matches first name, last name and either full-name order case-insensitively", () => {
    expect(JournalRosterFilter.matches(ROSTER[0], "anv")).toBe(true);
    expect(JournalRosterFilter.matches(ROSTER[0], "RAHIMOV")).toBe(true);
    expect(JournalRosterFilter.matches(ROSTER[0], "anvar rahimov")).toBe(true);
    expect(JournalRosterFilter.matches(ROSTER[0], "rahimov anvar")).toBe(true);
    expect(JournalRosterFilter.matches(ROSTER[0], "karimova")).toBe(false);
  });

  it("returns null for a blank query and a stable id set for an active one", () => {
    expect(JournalRosterFilter.visibleIds(ROSTER, "   ")).toBeNull();
    expect(Array.from(JournalRosterFilter.visibleIds(ROSTER, "karimova") ?? [])).toEqual([2, 3]);
  });

  it("does not match against the email or other hidden fields", () => {
    expect(JournalRosterFilter.matches({ ...ROSTER[0], email: "secret@example.com" }, "secret")).toBe(false);
  });
});
