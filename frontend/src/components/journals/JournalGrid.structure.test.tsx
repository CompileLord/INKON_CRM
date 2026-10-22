import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { JournalGrid } from "./JournalGrid";
import i18n from "../../i18n";
import type { JournalStudentResponse } from "../../lib/journals/types";
import { DATES, STUDENTS, cellOf, mountGrid, registerGridHooks, student } from "./JournalGridTestSupport";

registerGridHooks();

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
    expect(widths(tables[0])[1]).toBe("128px");
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

  it("keeps lesson columns compact at 128px with a checkbox, score box and comment control", () => {
    mountGrid();
    expect((document.querySelector("col:nth-child(2)") as HTMLElement).style.width).toBe("128px");
    const cell = cellOf("Anvar", DATES[0]);
    const targets = [within(cell).getByRole("checkbox").closest("label"), ...within(cell).getAllByRole("button")];
    expect(targets).toHaveLength(3);
    targets.forEach((target) => expect(target?.className).toMatch(/pointer-coarse:h-11/));
  });

  it("shows the comment icon only on hover or focus unless a comment exists, where it stays visible and filled", () => {
    const withComment: JournalStudentResponse = {
      ...student(1, "Anvar"),
      entries: student(1, "Anvar").entries.map((entry, index) => (index === 0 ? { ...entry, comment: "Late", has_comment: true } : entry)),
    };
    mountGrid({ students: [withComment] });
    const quiet = within(cellOf("Anvar", DATES[1])).getByRole("button", { name: /Add comment/ });
    expect(quiet.className).toContain("opacity-0");
    expect(quiet.className).toContain("group-hover/cell:opacity-100");
    expect(quiet.className).toContain("group-focus-within/cell:opacity-100");
    expect(quiet.className).toContain("focus-visible:opacity-100");
    expect(quiet.getAttribute("tabindex")).toBeDefined();
    const filled = within(cellOf("Anvar", DATES[0])).getByRole("button", { name: /Comment for/ });
    expect(filled.className).not.toContain("opacity-0");
  });

  it("renders the score of an absent student muted without a bordered box and keeps it clickable", () => {
    mountGrid();
    const absent = within(cellOf("Anvar", DATES[0])).getByRole("button", { name: "—" });
    expect(absent.className).toContain("border-transparent");
    expect(absent.className).toContain("text-muted");
    fireEvent.click(absent);
    expect(screen.getByRole("menu")).toBeDefined();
  });

  it("seals the sticky student column with an opaque background and a separator in header and body", () => {
    mountGrid();
    const headerCell = screen.getByRole("columnheader", { name: "Students" });
    const bodyCell = screen.getByRole("rowheader", { name: /Anvar Tester/ });
    [headerCell, bodyCell].forEach((cell) => {
      expect(cell.className).toMatch(/\bbg-(card|beige)\b/);
      expect(cell.className).toContain("shadow-[1px_0_0_0_var(--color-border)]");
      expect(cell.className).toMatch(/\bz-(20|30)\b/);
    });
  });

  it("marks the selected lesson column and lets a header select a lesson", () => {
    const grid = mountGrid({ selectedLesson: DATES[1] });
    const headers = screen.getAllByRole("columnheader");
    expect(headers[2].getAttribute("aria-current")).toBe("date");
    fireEvent.click(within(headers[3]).getAllByRole("button")[0]);
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
    expect(screen.getAllByRole("img", { name: "Absent" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Absent")).toBeNull();
  });

  it("shows attendance as an icon with an accessible name and no visible status word", () => {
    const present = student(1, "Anvar", { [DATES[0]]: 4 });
    present.entries[0] = { ...present.entries[0], attendance: true };
    mountGrid({ editing: false, students: [present] });
    const mark = screen.getAllByTestId("attendance-present")[0];
    expect(mark.getAttribute("aria-label")).toBe("Present");
    expect(mark.getAttribute("title")).toBe("Present");
    expect(mark.querySelector("svg")).not.toBeNull();
    expect(mark.textContent).toBe("");
    expect(screen.queryByText("Present")).toBeNull();
    expect(screen.getAllByTestId("attendance-absent")[0].querySelector("svg")).not.toBeNull();
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

describe("JournalGrid total column", () => {
  it("shows the total as the score only with no percentage line, in one column", () => {
    const scored = student(1, "Anvar");
    scored.summary = { ...(scored.summary as NonNullable<JournalStudentResponse["summary"]>), sum_score: 86, max_period_score: 117, percentage: 73.5 };
    mountGrid({ students: [scored] });
    const cell = screen.getByTestId("total-cell");
    expect(cell.textContent).toContain("86");
    expect(cell.textContent).not.toContain("/");
    expect(screen.getByTestId("total-maximum").textContent).toBe("/ 117");
    expect(cell.textContent).toBe("86");
    expect(cell.textContent).not.toContain("%");
    expect(screen.queryByTestId("total-percentage")).toBeNull();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).not.toContain("%");
  });

  it("states a shared maximum once in the header and keeps every row free of it", () => {
    const first = student(1, "Anvar");
    const second = student(2, "Bahor");
    mountGrid({ students: [first, second] });
    expect(screen.getAllByTestId("total-maximum")).toHaveLength(1);
    expect(screen.getByTestId("total-maximum").textContent).toBe("/ 100");
    expect(screen.queryAllByTestId("total-row-maximum")).toHaveLength(0);
    screen.getAllByTestId("total-cell").forEach((cell) => expect(cell.textContent).not.toContain("/"));
  });

  it("falls back to the row maximum only on rows that differ from the shared header maximum", () => {
    const first = student(1, "Anvar");
    const second = student(2, "Bahor");
    const odd = student(3, "Chiroq");
    odd.summary = { ...(odd.summary as NonNullable<JournalStudentResponse["summary"]>), max_period_score: 80 };
    mountGrid({ students: [first, second, odd] });
    expect(screen.getByTestId("total-maximum").textContent).toBe("/ 100");
    const rowMaximums = screen.getAllByTestId("total-row-maximum");
    expect(rowMaximums).toHaveLength(1);
    expect(rowMaximums[0].textContent).toContain("/ 80");
  });

  it("shows only the score when the period has no maximum", () => {
    const noMaximum = student(1, "Anvar");
    noMaximum.summary = { ...(noMaximum.summary as NonNullable<JournalStudentResponse["summary"]>), sum_score: 5, max_period_score: 0, percentage: 0 };
    mountGrid({ students: [noMaximum] });
    expect(screen.getByTestId("total-cell").textContent).toBe("5");
    expect(screen.queryByTestId("total-percentage")).toBeNull();
    expect(screen.queryByTestId("total-maximum")).toBeNull();
  });
});

describe("JournalGrid initial scroll position", () => {
  const stubGeometry = (region: HTMLElement, headerLeft: number): void => {
    vi.spyOn(region, "getBoundingClientRect").mockReturnValue({ left: 0, right: 358, top: 0, bottom: 100, width: 358, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    const header = screen.getAllByRole("columnheader").find((node) => node.getAttribute("aria-current") === "date") as HTMLElement;
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ left: headerLeft, right: headerLeft + 128, top: 0, bottom: 56, width: 128, height: 56, x: headerLeft, y: 0, toJSON: () => ({}) });
  };

  const gridElement = (selectedLesson: string) => (
    <JournalGrid journalId={7} periodLabel="Month 10" students={STUDENTS} lessonDates={DATES} selectedLesson={selectedLesson} cellStatus={new Map()} summaryStatus={new Map()} editing={null} examMaximum={24} onSelectLesson={() => undefined} />
  );

  it("opens at the first lesson column even when a later lesson is selected", () => {
    render(gridElement(DATES[2]));
    expect((screen.getByTestId("journal-grid-region") as HTMLElement).scrollLeft).toBe(0);
  });

  it("still brings a lesson into view when the user selects a different one afterwards", () => {
    const view = render(gridElement(DATES[0]));
    const region = screen.getByTestId("journal-grid-region");
    view.rerender(gridElement(DATES[2]));
    stubGeometry(region, 900);
    view.rerender(gridElement(DATES[1]));
    view.rerender(gridElement(DATES[2]));
    expect(region.scrollLeft).toBeGreaterThan(0);
  });
});
