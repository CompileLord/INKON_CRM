import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JournalStudentRow } from "./JournalStudentRow";
import type { JournalStudentResponse } from "../../lib/journals/types";

const student: JournalStudentResponse = {
  student_id: 1, first_name: "Student", last_name: "One", email: "student@example.com", color_hex: "", entries: [],
  summary: { id: 1, bonus_score: 2, exam_score: 3, version: 1, homework_score: 0, attendance_score: 0, sum_score: 5, max_period_score: 100, percentage: 5, attendance_count: 0, total_lessons: 1 },
};
const props = {
  lessonDates: [], periodType: "week" as const, examMaxScore: 100, cellStatus: new Map(), focusedCellKey: null,
  focusFromKeyboard: false, animationIndex: 0, onCellFocus: vi.fn(), onCellNavigate: vi.fn(), onEntryChange: vi.fn(), onSummaryChange: vi.fn(),
};

describe("JournalStudentRow recovery", () => {
  it("updates both visible inputs from an authoritative summary while preserving focused typing", () => {
    const row = (value: JournalStudentResponse) => <table><tbody><JournalStudentRow {...props} student={value} /></tbody></table>;
    const { rerender } = render(row(student));
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    fireEvent.focus(inputs[0]);
    fireEvent.change(inputs[0], { target: { value: "8" } });
    const recovered = { ...student, summary: { ...student.summary!, bonus_score: 6, exam_score: 9, version: 2 } };
    rerender(row(recovered));
    expect(inputs[0].value).toBe("8");
    expect(inputs[1].value).toBe("9");
    fireEvent.blur(inputs[0]);
    rerender(row({ ...recovered, summary: { ...recovered.summary, bonus_score: 7, version: 3 } }));
    expect(inputs[0].value).toBe("7");
    expect(inputs[1].value).toBe("9");
  });
});
