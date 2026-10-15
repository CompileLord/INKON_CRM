import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "../../i18n";
import i18n from "../../i18n";
import { JournalGrid } from "./JournalGrid";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import type { JournalRowEditing } from "./JournalStudentRow";
import type { JournalStudentResponse } from "../../lib/journals/types";

const DATES: string[] = ["2026-10-12", "2026-10-13", "2026-10-14"];

function student(id: number, firstName: string, scores: Record<string, number> = {}): JournalStudentResponse {
  return {
    student_id: id,
    first_name: firstName,
    last_name: "Tester",
    email: `${firstName}@example.com`,
    color_hex: "",
    entries: DATES.map((date, index) => ({
      id: id * 10 + index,
      lesson_date: date,
      attendance: false,
      score: scores[date] ?? 0,
      comment: null,
      has_comment: false,
      version: 1,
    })),
    summary: {
      id: id,
      bonus_score: 0,
      exam_score: 0,
      sum_score: 0,
      max_period_score: 100,
      percentage: 0,
      version: 1,
      homework_score: 0,
      attendance_score: 0,
      attendance_count: 0,
      total_lessons: 3,
    },
  };
}

const STUDENTS: JournalStudentResponse[] = [student(1, "Anvar"), student(2, "Bahor"), student(3, "Chiroq")];

interface GridHarness {
  onEntryCommand: ReturnType<typeof vi.fn>;
  onSummaryPair: ReturnType<typeof vi.fn>;
  onSelectLesson: ReturnType<typeof vi.fn>;
  rerender: (students: JournalStudentResponse[], journalId?: number) => void;
}

function mountGrid(options: { editing?: boolean; students?: JournalStudentResponse[]; selectedLesson?: string } = {}): GridHarness {
  const onEntryCommand = vi.fn();
  const onSummaryPair = vi.fn();
  const onSelectLesson = vi.fn();
  const editing: JournalRowEditing | null =
    options.editing === false ? null : { onEntryCommand, onSummaryPair };
  const element = (students: JournalStudentResponse[], journalId: number) => (
    <JournalGrid
      journalId={journalId}
      periodLabel="Month 10"
      students={students}
      lessonDates={DATES}
      selectedLesson={options.selectedLesson ?? DATES[0]}
      cellStatus={new Map()}
      summaryStatus={new Map()}
      editing={editing}
      onSelectLesson={onSelectLesson}
    />
  );
  const view = render(element(options.students ?? STUDENTS, 7));
  return {
    onEntryCommand,
    onSummaryPair,
    onSelectLesson,
    rerender: (students, journalId = 7) => view.rerender(element(students, journalId)),
  };
}

function cellOf(name: string, date: string): HTMLElement {
  return screen.getByLabelText(`Score for ${name} Tester on ${formatSchoolLessonDate(date)}`);
}

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

  it("has no inline bonus or exam inputs so the paired editor is the only summary edit path", () => {
    mountGrid();
    expect(screen.queryByRole("textbox", { name: /Bonus|Exam/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /Bonus|Exam/ })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeDefined();
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

describe("JournalGrid structure", () => {
  it("renders a labeled keyboard-scrollable region instead of an unlabeled wrapper", () => {
    mountGrid();
    const region = screen.getByRole("region", { name: "Gradebook grid, Month 10" });
    expect(region.getAttribute("tabindex")).toBe("0");
  });

  it("has no vertical scroll region of its own, only horizontal overflow", () => {
    mountGrid();
    const region = screen.getByTestId("journal-grid-region");
    expect(region.className).toContain("overflow-x-auto");
    expect(region.className).toContain("overflow-y-hidden");
    expect(region.getAttribute("style") ?? "").not.toContain("max-height");
  });

  it("sticks the date header strip below the shell header and pins the student column inside it with a highest corner", () => {
    mountGrid();
    const strip = screen.getByTestId("journal-grid-header");
    expect(strip.className).toContain("sticky");
    expect(strip.getAttribute("style")).toContain("3.5rem");
    expect(strip.getAttribute("style")).toContain("safe-area-inset-top");
    const corner = screen.getByRole("columnheader", { name: "Students" });
    expect(corner.className).toContain("sticky");
    expect(corner.className).toContain("left-0");
    expect(corner.className).toContain("z-30");
    const rowHeader = screen.getAllByRole("rowheader")[0];
    expect(rowHeader.className).toContain("left-0");
    expect(rowHeader.className).toContain("min-w-[200px]");
    const everyCellClass = Array.from(document.querySelectorAll("th, td")).map((node) => node.className).join(" ");
    expect(everyCellClass).not.toMatch(/right-0|right-16/);
  });

  it("gives the header and body tables identical fixed column widths so they stay aligned", () => {
    mountGrid();
    const widths = (table: Element) => Array.from(table.querySelectorAll("col")).map((col) => (col as HTMLElement).style.width);
    const tables = document.querySelectorAll("table");
    expect(tables).toHaveLength(2);
    expect(widths(tables[0])).toEqual(widths(tables[1]));
    expect(widths(tables[0])[1]).toBe("160px");
    expect((tables[0] as HTMLElement).style.tableLayout).toBe("fixed");
  });

  it("keeps the header strip, the body and the sticky bottom scrollbar on the same horizontal offset", () => {
    mountGrid();
    const body = screen.getByTestId("journal-grid-region");
    const header = screen.getByTestId("journal-grid-header");
    const bar = screen.getByTestId("journal-grid-scrollbar");
    expect(bar.className).toContain("sticky");
    expect(bar.className).toContain("bottom-0");
    body.scrollLeft = 240;
    fireEvent.scroll(body);
    expect(header.scrollLeft).toBe(240);
    expect(bar.scrollLeft).toBe(240);
    bar.scrollLeft = 80;
    fireEvent.scroll(bar);
    expect(body.scrollLeft).toBe(80);
    expect(header.scrollLeft).toBe(80);
  });

  it("gives every lesson column at least 160px so three 44px controls fit", () => {
    mountGrid();
    expect((document.querySelector("col:nth-child(2)") as HTMLElement).style.width).toBe("160px");
    const cell = cellOf("Anvar", DATES[0]);
    const targets = [within(cell).getByRole("checkbox").closest("label"), ...within(cell).getAllByRole("button")];
    expect(targets).toHaveLength(3);
    targets.forEach((target) => expect(target?.className).toMatch(/h-11/));
  });

  it("marks the selected lesson column and lets a header select a lesson", () => {
    const grid = mountGrid({ selectedLesson: DATES[1] });
    const headers = screen.getAllByRole("columnheader");
    expect(headers[2].getAttribute("aria-current")).toBe("date");
    fireEvent.click(within(headers[3]).getByRole("button"));
    expect(grid.onSelectLesson).toHaveBeenCalledWith(DATES[2]);
  });

  it("keeps a permanent italic shortcut line out of the grid", () => {
    mountGrid();
    expect(screen.queryByText(/Use arrow keys to navigate/)).toBeNull();
    expect(document.querySelector("p.italic")).toBeNull();
  });

  it("does not hijack the vertical wheel into horizontal scrolling", () => {
    mountGrid();
    const region = screen.getByTestId("journal-grid-region");
    Object.defineProperty(region, "scrollWidth", { configurable: true, value: 3000 });
    Object.defineProperty(region, "clientWidth", { configurable: true, value: 800 });
    region.scrollLeft = 0;
    const notPrevented = fireEvent.wheel(region, { deltaY: 120 });
    expect(notPrevented).toBe(true);
    expect(region.scrollLeft).toBe(0);
  });
});

describe("JournalGrid read-only", () => {
  it("mounts no editors when the journal is read-only", () => {
    const grid = mountGrid({ editing: false });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelectorAll('[aria-haspopup="menu"], [aria-haspopup="dialog"]')).toHaveLength(0);
    const cell = screen.getAllByRole("group")[0];
    fireEvent.keyDown(cell, { key: "3" });
    fireEvent.keyDown(cell, { key: " " });
    expect(grid.onEntryCommand).not.toHaveBeenCalled();
  });

  it("still shows stored scores and attendance as text", () => {
    mountGrid({ editing: false, students: [student(1, "Anvar", { [DATES[0]]: 4 })] });
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getAllByText("Absent").length).toBeGreaterThan(0);
  });
});

describe("JournalGrid weekday headers", () => {
  it("shows Tajik weekday abbreviations when tg-TJ Intl data is missing", async () => {
    const supported = Intl.DateTimeFormat.supportedLocalesOf.bind(Intl.DateTimeFormat);
    vi.spyOn(Intl.DateTimeFormat, "supportedLocalesOf").mockImplementation((locales) => {
      const requested: string[] = typeof locales === "string" ? [locales] : Array.isArray(locales) ? locales.map(String) : [];
      return supported(requested.filter((locale) => !locale.startsWith("tg")));
    });
    await i18n.changeLanguage("tg");
    mountGrid();
    const headers = screen.getAllByRole("columnheader").slice(1, 4);
    expect(headers.map((header) => header.textContent?.slice(0, 2))).toEqual(["Дш", "Сш", "Чш"]);
  });
});
