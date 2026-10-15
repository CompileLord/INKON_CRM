import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { JournalStudentRow } from "./JournalStudentRow";
import type { JournalStudentResponse } from "../../lib/journals/types";

const student: JournalStudentResponse = {
  student_id: 1, first_name: "Student", last_name: "One", email: "student@example.com", color_hex: "", entries: [],
  summary: { id: 1, bonus_score: 2, exam_score: 3, version: 1, homework_score: 0, attendance_score: 0, sum_score: 5, max_period_score: 100, percentage: 5, attendance_count: 0, total_lessons: 1 },
};
const props = {
  lessonDates: [], selectedLesson: undefined, cellStatus: new Map(), focusedCellKey: null,
  focusFromKeyboard: false, onCellFocus: vi.fn(), onCellNavigate: vi.fn(),
  editing: { onEntryCommand: vi.fn(), onSummaryPair: vi.fn() },
};

function mount(value: JournalStudentResponse) {
  return render(<table><tbody><JournalStudentRow {...props} student={value} /></tbody></table>);
}

afterEach(() => cleanup());

describe("JournalStudentRow totals", () => {
  it("renders no inline bonus or exam editor", () => {
    mount(student);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("shows the server total and percentage", () => {
    mount(student);
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("5%")).toBeDefined();
  });

  it("reads Unavailable, never zero, when the summary is missing", () => {
    mount({ ...student, summary: null });
    expect(screen.getByText("Unavailable")).toBeDefined();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("displays a percentage above 100 as supplied", () => {
    mount({ ...student, summary: { ...student.summary!, sum_score: 110, percentage: 102.5 } });
    expect(screen.getByText("102.5%")).toBeDefined();
  });
});
