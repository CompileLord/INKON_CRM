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
  return render(<table><tbody><JournalStudentRow {...props} sharedMaximum={100} student={value} /></tbody></table>);
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

  it("validates the bonus against the journal's own bonus maximum", () => {
    const onSummaryPair = vi.fn();
    render(
      <table>
        <tbody>
          <JournalStudentRow {...props} bonusMaximum={35} editing={{ onEntryCommand: vi.fn(), onSummaryPair }} student={student} />
        </tbody>
      </table>,
    );
    const bonus = screen.getByRole("textbox", { name: "Bonus score for Student One" });
    fireEvent.change(bonus, { target: { value: "30" } });
    fireEvent.keyDown(bonus, { key: "Enter" });
    expect(onSummaryPair).toHaveBeenCalledWith(1, { exam_score: 3, bonus_score: 30, version: 1 });
    fireEvent.change(bonus, { target: { value: "36" } });
    fireEvent.keyDown(bonus, { key: "Enter" });
    expect(onSummaryPair).toHaveBeenCalledTimes(1);
    expect(bonus.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Max 35");
    expect((bonus as HTMLInputElement).value).toBe("36");
  });

  it("flags both inputs inline with the server rejection message when the summary save failed", () => {
    render(
      <table>
        <tbody>
          <JournalStudentRow {...props} summaryStatus="error" student={student} />
        </tbody>
      </table>,
    );
    for (const name of ["Exam score for Student One", "Bonus score for Student One"]) {
      const input = screen.getByRole("textbox", { name });
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("title")).toBe("The server rejected this value");
    }
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

  it("shows the server total without a percentage", () => {
    mount(student);
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.queryByText("5%")).toBeNull();
    expect(screen.queryByTestId("total-percentage")).toBeNull();
  });

  it("reads Unavailable, never zero, when the summary is missing", () => {
    mount({ ...student, summary: null });
    expect(screen.getByText("Unavailable")).toBeDefined();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("shows no percentage even when the share is above 100", () => {
    mount({ ...student, summary: { ...student.summary!, sum_score: 110, percentage: 102.5 } });
    expect(screen.getByTestId("total-cell").textContent).toBe("110");
  });
});

describe("JournalStudentRow own-row not-graded state", () => {
  const ownRow = (value: JournalStudentResponse) =>
    render(<table><tbody><JournalStudentRow {...props} editing={null} sharedMaximum={100} markUnrecorded isSelf student={value} /></tbody></table>);

  it("shows a dash instead of 0 when nothing is graded yet", () => {
    ownRow({ ...student, entries: [], summary: { ...student.summary!, sum_score: 0, exam_score: 0, bonus_score: 0, percentage: 0 } });
    const cell: HTMLElement = screen.getByTestId("total-cell");
    expect(cell.textContent).toBe("—");
    expect(screen.queryByTestId("total-percentage")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("treats recorded absences without a score as not graded", () => {
    ownRow({ ...student, entries: [{ lesson_date: "2026-10-01", attendance: false, score: 0, comment: null, version: 1 } as unknown as JournalStudentResponse["entries"][number]], summary: { ...student.summary!, sum_score: 0, exam_score: 0, bonus_score: 0, percentage: 0 } });
    expect(screen.getByTestId("total-cell").textContent).toBe("—");
  });

  it("shows the real zero once an attended lesson is recorded", () => {
    ownRow({ ...student, entries: [{ lesson_date: "2026-10-01", attendance: true, score: 0, comment: null, version: 1 } as unknown as JournalStudentResponse["entries"][number]], summary: { ...student.summary!, sum_score: 0, exam_score: 0, bonus_score: 0, percentage: 0 } });
    expect(screen.getByTestId("total-cell").textContent).toBe("0");
  });
});

describe("JournalStudentRow inline summary validation", () => {
  it("explains an out-of-range exam value inline and keeps the typed draft after leaving the field", () => {
    mount(student);
    const exam = screen.getByRole("textbox", { name: "Exam score for Student One" }) as HTMLInputElement;
    fireEvent.change(exam, { target: { value: "99" } });
    fireEvent.blur(exam);
    expect(screen.getByRole("alert").textContent).toBe("Max 24");
    expect(exam.value).toBe("99");
    expect(exam.getAttribute("aria-invalid")).toBe("true");
    expect(props.editing.onSummaryPair).not.toHaveBeenCalled();
  });

  it("explains a non-numeric value inline", () => {
    mount(student);
    const bonus = screen.getByRole("textbox", { name: "Bonus score for Student One" }) as HTMLInputElement;
    fireEvent.change(bonus, { target: { value: "abc" } });
    expect(screen.getByRole("alert").textContent).toBe("Enter a whole number");
    expect(bonus.value).toBe("abc");
  });
});
