import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
  examMaximum: 24,
  editing: { onEntryCommand: vi.fn(), onSummaryPair: vi.fn() },
};

function mount(value: JournalStudentResponse) {
  return render(<table><tbody><JournalStudentRow {...props} student={value} /></tbody></table>);
}

afterEach(() => cleanup());

describe("JournalStudentRow totals", () => {
  it("renders editable exam and bonus inputs with the stored values", () => {
    mount(student);
    expect((screen.getByRole("textbox", { name: "Exam score for Student One" }) as HTMLInputElement).value).toBe("3");
    expect((screen.getByRole("textbox", { name: "Bonus score for Student One" }) as HTMLInputElement).value).toBe("2");
  });

  it("commits an edited exam score with the untouched bonus and the current version, only on blur", () => {
    const onSummaryPair = vi.fn();
    render(
      <table>
        <tbody>
          <JournalStudentRow {...props} editing={{ onEntryCommand: vi.fn(), onSummaryPair }} student={student} />
        </tbody>
      </table>,
    );
    const exam = screen.getByRole("textbox", { name: "Exam score for Student One" });
    fireEvent.change(exam, { target: { value: "20" } });
    expect(onSummaryPair).not.toHaveBeenCalled();
    fireEvent.blur(exam);
    expect(onSummaryPair).toHaveBeenCalledTimes(1);
    expect(onSummaryPair).toHaveBeenCalledWith(1, { exam_score: 20, bonus_score: 2, version: 1 });
  });

  it("rejects an exam score above the maximum without saving and flags the input", () => {
    const onSummaryPair = vi.fn();
    render(
      <table>
        <tbody>
          <JournalStudentRow {...props} editing={{ onEntryCommand: vi.fn(), onSummaryPair }} student={student} />
        </tbody>
      </table>,
    );
    const exam = screen.getByRole("textbox", { name: "Exam score for Student One" });
    fireEvent.change(exam, { target: { value: "25" } });
    fireEvent.keyDown(exam, { key: "Enter" });
    expect(onSummaryPair).not.toHaveBeenCalled();
    expect(exam.getAttribute("aria-invalid")).toBe("true");
  });

  it("shows exam and bonus as plain numbers when the period is read-only", () => {
    render(
      <table>
        <tbody>
          <JournalStudentRow {...props} editing={null} student={student} />
        </tbody>
      </table>,
    );
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByLabelText("Exam score for Student One").textContent).toBe("3");
  });

  it("shows a warning marker with an explanation only when the student is at risk", () => {
    const view = mount(student);
    expect(screen.queryByTestId("at-risk-marker")).toBeNull();
    view.unmount();
    render(<table><tbody><JournalStudentRow {...props} atRisk student={student} /></tbody></table>);
    const marker: HTMLElement = screen.getByTestId("at-risk-marker");
    expect(marker.getAttribute("title")).toBe("At risk: period result below 60% or 3 absences in a row");
    expect(marker.querySelector("svg")).not.toBeNull();
    expect(marker.className).toContain("text-warning");
    expect(screen.getByRole("rowheader").querySelector('[style*="background"]')).toBeNull();
  });

  it("shows the server total and percentage", () => {
    mount(student);
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
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
