import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { JournalStudentRow } from "./JournalStudentRow";
import type { JournalStudentResponse } from "../../lib/journals/types";

const student: JournalStudentResponse = {
  student_id: 1, first_name: "Student", last_name: "One", email: "student@example.com", color_hex: "", entries: [],
  summary: { id: 1, bonus_score: 2, exam_score: 3, version: 1, homework_score: 0, attendance_score: 0, sum_score: 5, max_period_score: 100, percentage: 5, attendance_count: 0, total_lessons: 1 },
};
const onEntryCommand = vi.fn();
const onSummaryField = vi.fn();
const props = {
  lessonDates: [], selectedLesson: undefined, examMaxScore: 100, cellStatus: new Map(), focusedCellKey: null,
  focusFromKeyboard: false, onCellFocus: vi.fn(), onCellNavigate: vi.fn(),
  editing: { onEntryCommand, onSummaryField },
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

  describe("strict summary input", () => {
    beforeEach(() => {
      onSummaryField.mockClear();
    });
    afterEach(() => cleanup());

    function mountRow() {
      render(<table><tbody><JournalStudentRow {...props} student={student} /></tbody></table>);
      const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
      return { bonus: inputs[0], exam: inputs[1] };
    }

    it.each(["", "abc", "1.5", "-2"])("never sends zero for invalid input %j", (raw) => {
      const { bonus } = mountRow();
      fireEvent.focus(bonus);
      fireEvent.change(bonus, { target: { value: raw } });
      fireEvent.blur(bonus);
      expect(onSummaryField).not.toHaveBeenCalled();
      expect(bonus.getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByRole("alert").textContent).toBe("Enter a whole number");
      expect(bonus.value).toBe(raw);
    });

    it("rejects an exam score above the maximum instead of clamping", () => {
      const { exam } = mountRow();
      fireEvent.change(exam, { target: { value: "101" } });
      fireEvent.blur(exam);
      expect(onSummaryField).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toBe("Max 100");
    });

    it("sends the parsed field once on blur and nothing for an unchanged value", () => {
      const { bonus, exam } = mountRow();
      fireEvent.change(bonus, { target: { value: "7" } });
      fireEvent.blur(bonus);
      expect(onSummaryField).toHaveBeenCalledTimes(1);
      expect(onSummaryField).toHaveBeenCalledWith(1, "bonus_score", 7);

      fireEvent.change(exam, { target: { value: "3" } });
      fireEvent.blur(exam);
      expect(onSummaryField).toHaveBeenCalledTimes(1);
    });

    it("sends the field on Enter", () => {
      const { exam } = mountRow();
      fireEvent.change(exam, { target: { value: "55" } });
      fireEvent.keyDown(exam, { key: "Enter" });
      expect(onSummaryField).toHaveBeenCalledWith(1, "exam_score", 55);
    });

    it("sends nothing and restores the stored value when Escape cancels the edit", () => {
      const { bonus } = mountRow();
      fireEvent.change(bonus, { target: { value: "9" } });
      fireEvent.keyDown(bonus, { key: "Escape" });
      fireEvent.blur(bonus);
      expect(onSummaryField).not.toHaveBeenCalled();
      expect(bonus.value).toBe("2");
    });
  });
});
