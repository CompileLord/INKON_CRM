import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import i18n from "../../i18n";
import { JournalGrid } from "./JournalGrid";
import type { JournalStudentResponse } from "../../lib/journals/types";
import { JournalProgressRules } from "../../lib/journals/JournalProgressRules";

const DATES: string[] = ["2026-10-12", "2026-10-14"];

function student(id: number, firstName: string, comment: string | null = null, withEntries = true): JournalStudentResponse {
  return {
    student_id: id,
    first_name: firstName,
    last_name: "Tester",
    color_hex: "#123456",
    entries: withEntries
      ? DATES.map((date, index) => ({ id: id * 10 + index, lesson_date: date, attendance: true, score: 4, comment: index === 0 ? comment : null, has_comment: index === 0 && comment !== null, version: 1 }))
      : [],
    summary: { id, bonus_score: 0, exam_score: 0, sum_score: 8, max_period_score: 100, percentage: 8, version: 1, homework_score: 8, attendance_score: 0, attendance_count: 2, total_lessons: 2 },
  };
}

const CLASS_ROSTER: JournalStudentResponse[] = [student(1, "Anvar"), student(2, "Bahor"), student(3, "Chiroq", "own note")];
const noop = (): void => undefined;

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});
beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mountGrid(students: JournalStudentResponse[], selfId: number | null, editable = false) {
  return render(
    <JournalGrid
      journalId={5}
      periodLabel="Month"
      students={students}
      lessonDates={DATES}
      selectedLesson={DATES[0]}
      cellStatus={new Map()}
      summaryStatus={new Map()}
      editing={editable ? { onEntryCommand: noop, onSummaryPair: noop } : null}
      onSelectLesson={noop}
      readOnlySelfStudentId={selfId}
    />,
  );
}

describe("journal grid in student read-only mode", () => {
  it("pins the own row first, marks it and shows classmates by name", () => {
    mountGrid(CLASS_ROSTER, 3);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Chiroq Tester")).toBeTruthy();
    expect(rows[0].getAttribute("data-self")).toBe("true");
    expect(within(rows[0]).getByText("You")).toBeTruthy();
    expect(rows.filter((row) => row.getAttribute("data-self") === "true")).toHaveLength(1);
    expect(screen.getByText("Anvar Tester")).toBeTruthy();
  });

  it("renders no editable control even when an editing handler is supplied", () => {
    mountGrid(CLASS_ROSTER, 3, true);
    expect(document.querySelectorAll("input, [data-control]")).toHaveLength(0);
  });

  it("shows the at-risk marker only on the own row, never on classmates", () => {
    mountGrid(CLASS_ROSTER, 3);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getAllByLabelText(/at risk/i)).toHaveLength(1);
    expect(within(rows[1]).queryByLabelText(/at risk/i)).toBeNull();
    expect(within(rows[2]).queryByLabelText(/at risk/i)).toBeNull();
  });

  it("keeps the at-risk marker on every row for staff", () => {
    mountGrid(CLASS_ROSTER, null);
    expect(screen.getAllByLabelText(/at risk/i)).toHaveLength(3);
  });

  it("keeps staff order and no highlight without a self student", () => {
    mountGrid(CLASS_ROSTER, null);
    expect(screen.getAllByRole("row")[1].textContent).toContain("Anvar");
    expect(document.querySelector('[data-self="true"]')).toBeNull();
  });

  it("shows a missing entry as Not recorded instead of an absence", () => {
    mountGrid([student(1, "Anvar", null, false), student(3, "Chiroq")], 3);
    expect(screen.getAllByTestId("not-recorded-cell").length).toBe(DATES.length);
    expect(screen.getAllByText("Not recorded").length).toBe(DATES.length);
  });
});

describe("progress selection for a student", () => {
  const students = Array.from({ length: 9 }, (_, index) => ({ studentId: index + 1, name: `S${index + 1}`, results: [], latestPercentage: 90 - index, slot: index % 8, dashVariant: 0 }));

  it("adds the own student to the default selection even when ranked outside the top", () => {
    const visible = JournalProgressRules.defaultVisibleIds(students, 9);
    expect(visible.has(9)).toBe(true);
    expect(visible.size).toBe(JournalProgressRules.DEFAULT_VISIBLE_STUDENTS + 1);
  });

  it("does not add anyone without a pinned student", () => {
    expect(JournalProgressRules.defaultVisibleIds(students).has(9)).toBe(false);
  });

  it("pins the own student first and keeps the rest in order", () => {
    expect(JournalProgressRules.pinFirst(students, 4).map((item) => item.studentId).slice(0, 4)).toEqual([4, 1, 2, 3]);
  });
});
