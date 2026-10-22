import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { JournalStudentResponse } from "../../lib/journals/types";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { DATES, STUDENTS, cellOf, mountGrid, registerGridHooks, student } from "./JournalGridTestSupport";

registerGridHooks();

describe("JournalGrid keyboard", () => {
  it("makes only the selected lesson of the first student a tab stop", () => {
    mountGrid({ selectedLesson: DATES[1] });
    expect(cellOf("Anvar", DATES[1]).getAttribute("tabindex")).toBe("0");
    expect(cellOf("Anvar", DATES[0]).getAttribute("tabindex")).toBe("-1");
    expect(cellOf("Bahor", DATES[1]).getAttribute("tabindex")).toBe("-1");
  });

  it("moves focus between cells with the arrow keys and keeps identity by student and date", () => {
    mountGrid();
    const start = cellOf("Anvar", DATES[0]);
    start.focus();
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cellOf("Anvar", DATES[1]));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cellOf("Bahor", DATES[1]));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cellOf("Bahor", DATES[0]));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
    expect(document.activeElement).toBe(cellOf("Anvar", DATES[0]));
  });

  it("stays on a valid cell at every grid edge", () => {
    mountGrid();
    const topLeft = cellOf("Anvar", DATES[0]);
    topLeft.focus();
    fireEvent.keyDown(topLeft, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(topLeft);

    const bottomRight = cellOf("Chiroq", DATES[2]);
    bottomRight.focus();
    fireEvent.keyDown(bottomRight, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(bottomRight);
  });

  it("grades with 0 to 5 and advances down", () => {
    const grid = mountGrid();
    const cell = cellOf("Anvar", DATES[1]);
    cell.focus();
    fireEvent.keyDown(cell, { key: "4" });
    expect(grid.onEntryCommand).toHaveBeenCalledWith(1, DATES[1], { kind: "score", score: 4 });
    expect(document.activeElement).toBe(cellOf("Bahor", DATES[1]));
  });

  it("does not treat 6 to 9 as grades", () => {
    const grid = mountGrid();
    const cell = cellOf("Anvar", DATES[0]);
    cell.focus();
    fireEvent.keyDown(cell, { key: "7" });
    expect(grid.onEntryCommand).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(cell);
  });

  it("toggles attendance with Space and advances down", () => {
    const grid = mountGrid();
    const cell = cellOf("Bahor", DATES[2]);
    cell.focus();
    fireEvent.keyDown(cell, { key: " ", code: "Space" });
    expect(grid.onEntryCommand).toHaveBeenCalledWith(2, DATES[2], { kind: "attendance", attended: true });
    expect(document.activeElement).toBe(cellOf("Chiroq", DATES[2]));
  });

  it("stays on the last row when a grade tries to advance down", () => {
    const grid = mountGrid();
    const cell = cellOf("Chiroq", DATES[0]);
    cell.focus();
    fireEvent.keyDown(cell, { key: "3" });
    expect(grid.onEntryCommand).toHaveBeenCalledWith(3, DATES[0], { kind: "score", score: 3 });
    expect(document.activeElement).toBe(cell);
  });

  it("opens the comment editor with C", () => {
    mountGrid();
    const cell = cellOf("Anvar", DATES[0]);
    cell.focus();
    fireEvent.keyDown(cell, { key: "c" });
    expect(screen.getByRole("dialog", { name: /Comment for/ })).toBeDefined();
  });

  it("ignores shortcut keys typed into the comment textarea", () => {
    const grid = mountGrid();
    const cell = cellOf("Anvar", DATES[0]);
    cell.focus();
    fireEvent.keyDown(cell, { key: "c" });
    const textarea = within(screen.getByRole("dialog", { name: /Comment for/ })).getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "3" });
    fireEvent.keyDown(textarea, { key: " ", code: "Space" });
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    expect(grid.onEntryCommand).not.toHaveBeenCalled();
  });

  it("ignores shortcut keys while a native control inside the cell has focus", () => {
    const grid = mountGrid();
    const cell = cellOf("Anvar", DATES[0]);
    const checkbox = within(cell).getByRole("checkbox");
    checkbox.focus();
    fireEvent.keyDown(checkbox, { key: "3" });
    fireEvent.keyDown(checkbox, { key: "c" });
    expect(grid.onEntryCommand).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores shortcut keys typed into a search field outside the cell", () => {
    const grid = mountGrid();
    const search = document.createElement("input");
    search.type = "search";
    document.body.appendChild(search);
    search.focus();
    fireEvent.keyDown(search, { key: "3" });
    fireEvent.keyDown(search, { key: " " });
    expect(grid.onEntryCommand).not.toHaveBeenCalled();
    search.remove();
  });

  it("ends every period with Exam, Bonus and Total columns after the last lesson day", () => {
    mountGrid();
    const names: string[] = screen.getAllByRole("columnheader").map((header) => header.textContent ?? "");
    expect(names.slice(-3)).toEqual(["Exam", "Bonus", "Total / 100"]);
    expect(names).toHaveLength(1 + DATES.length + 3);
    expect(screen.getAllByRole("textbox", { name: /^Exam score for/ })).toHaveLength(STUDENTS.length);
    expect(screen.getAllByRole("textbox", { name: /^Bonus score for/ })).toHaveLength(STUDENTS.length);
  });

  it("saves an edited exam score through the summary pair callback with the current version", () => {
    const grid = mountGrid();
    const exam = screen.getByRole("textbox", { name: "Exam score for Bahor Tester" });
    fireEvent.change(exam, { target: { value: "17" } });
    fireEvent.blur(exam);
    expect(grid.onSummaryPair).toHaveBeenCalledWith(2, { exam_score: 17, bonus_score: 0, version: 1 });
  });

  it("saves an edited bonus score with the untouched exam score", () => {
    const grid = mountGrid({ examMaximum: 50 });
    const bonus = screen.getByRole("textbox", { name: "Bonus score for Anvar Tester" });
    fireEvent.change(bonus, { target: { value: "2" } });
    fireEvent.keyDown(bonus, { key: "Enter" });
    expect(grid.onSummaryPair).toHaveBeenCalledWith(1, { exam_score: 0, bonus_score: 2, version: 1 });
  });

  it("keeps exam and bonus visible but not editable when the journal is read-only", () => {
    mountGrid({ editing: false });
    expect(screen.getAllByRole("columnheader").slice(-3).map((header) => header.textContent)).toEqual(["Exam", "Bonus", "Total / 100"]);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Bulk actions/ })).toBeNull();
  });
});

describe("JournalGrid bulk column actions", () => {
  const MIXED: JournalStudentResponse[] = [
    student(1, "Anvar"),
    { ...student(2, "Bahor", { [DATES[0]]: 4 }), entries: student(2, "Bahor", { [DATES[0]]: 4 }).entries.map((entry) => ({ ...entry, attendance: entry.score > 0 })) },
    { ...student(3, "Chiroq"), entries: student(3, "Chiroq").entries.map((entry) => ({ ...entry, attendance: true })) },
  ];

  function openColumnMenu(date: string): void {
    fireEvent.click(screen.getByRole("button", { name: `Bulk actions for ${formatSchoolLessonDate(date)}` }));
  }

  it("marks present only the cells that are not yet present, through the entry command path", () => {
    const grid = mountGrid({ students: MIXED });
    openColumnMenu(DATES[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark all present" }));
    expect(grid.onEntryCommand).toHaveBeenCalledTimes(1);
    expect(grid.onEntryCommand).toHaveBeenCalledWith(1, DATES[0], { kind: "attendance", attended: true });
  });

  it("fills homework with 5 only for present students who have no score and never overwrites one", () => {
    const grid = mountGrid({ students: MIXED });
    openColumnMenu(DATES[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Fill homework with 5" }));
    expect(grid.onEntryCommand.mock.calls).toEqual([[3, DATES[0], { kind: "score", score: 5 }]]);
  });

  it("does nothing for a column with no empty cells", () => {
    const grid = mountGrid({ students: [MIXED[2]] });
    openColumnMenu(DATES[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark all present" }));
    expect(grid.onEntryCommand).not.toHaveBeenCalled();
  });
});

describe("JournalGrid focus identity", () => {
  it("keeps the focused cell and its student when a refetch reorders the students", () => {
    const grid = mountGrid();
    const cell = cellOf("Bahor", DATES[1]);
    cell.focus();
    fireEvent.keyDown(cell, { key: "ArrowUp" });
    const anvarCell = cellOf("Anvar", DATES[1]);
    expect(document.activeElement).toBe(anvarCell);

    grid.rerender([STUDENTS[2], STUDENTS[1], STUDENTS[0]]);

    expect(document.activeElement).toBe(anvarCell);
    expect(cellOf("Anvar", DATES[1]).getAttribute("tabindex")).toBe("0");
    const order = screen.getAllByRole("rowheader").map((header) => header.textContent);
    expect(order).toEqual(["Anvar Tester", "Bahor Tester", "Chiroq Tester"]);
  });

  it("does not move focus when refetched data changes a score under the cursor", () => {
    const grid = mountGrid();
    const cell = cellOf("Bahor", DATES[0]);
    cell.focus();
    grid.rerender([STUDENTS[0], student(2, "Bahor", { [DATES[0]]: 5 }), STUDENTS[2]]);
    expect(document.activeElement).toBe(cellOf("Bahor", DATES[0]));
  });

  it("appends a student who joins during the session without reordering the rest", () => {
    const grid = mountGrid();
    grid.rerender([student(9, "Zafar"), STUDENTS[1], STUDENTS[0], STUDENTS[2]]);
    const order = screen.getAllByRole("rowheader").map((header) => header.textContent);
    expect(order).toEqual(["Anvar Tester", "Bahor Tester", "Chiroq Tester", "Zafar Tester"]);
  });

  it("falls back to a valid tab stop when the focused student disappears", () => {
    const grid = mountGrid();
    const cell = cellOf("Chiroq", DATES[2]);
    cell.focus();
    grid.rerender([STUDENTS[0], STUDENTS[1]]);
    expect(cellOf("Anvar", DATES[0]).getAttribute("tabindex")).toBe("0");
  });

  it("does not carry a focus position from one journal to another", () => {
    const grid = mountGrid();
    const cell = cellOf("Chiroq", DATES[2]);
    cell.focus();
    grid.rerender(STUDENTS, 8);
    expect(cellOf("Chiroq", DATES[2]).getAttribute("tabindex")).toBe("-1");
    expect(cellOf("Anvar", DATES[0]).getAttribute("tabindex")).toBe("0");
  });
});
