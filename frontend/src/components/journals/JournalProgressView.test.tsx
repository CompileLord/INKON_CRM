import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "../../i18n";
import { JournalProgressView } from "./JournalProgressView";
import * as courseHooks from "../../lib/courses/hooks";
import type { CourseStaffProgressResponse } from "../../lib/courses/types";

vi.mock("../../lib/courses/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/courses/hooks")>();
  return { ...actual, useCourseStaffProgress: vi.fn(), useCourseClassProgress: vi.fn(() => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() })) };
});

vi.mock("../../i18n/formatters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/formatters")>();
  return { ...actual, getSchoolCalendarDate: () => "2026-10-15" };
});

const result = (periodId: number, score: number | null, maxScore: number | null, percentage: number | null) => ({
  period_id: periodId,
  grading_state: "missing" as const,
  score,
  max_score: maxScore,
  percentage,
});

const period = (id: number, label: string, start: string, end: string) => ({ id, period_label: label, period_start: start, period_end: end });

const PERIODS = [
  period(1, "Month 8", "2026-08-01", "2026-08-31"),
  period(2, "Month 9", "2026-09-01", "2026-09-30"),
  period(3, "Month 10", "2026-10-01", "2026-10-31"),
  period(4, "Month 11", "2026-11-01", "2026-11-30"),
];

const student = (id: number, name: string, results: ReturnType<typeof result>[]) => ({
  student_id: id,
  first_name: name,
  last_name: "Tester",
  grading_provenance: "unknown" as const,
  period_results: results,
});

const data: CourseStaffProgressResponse = {
  course_id: 1,
  periods: PERIODS,
  students: [
    student(11, "Anvar", [result(1, 18, 24, 75), result(2, null, null, null), result(3, 25, 24.5, 114), result(4, 0, 24, 0)]),
    student(12, "Bahor", [result(1, 12, 24, 50), result(2, 12, 24, 50), result(3, 12, 24, 50), result(4, 0, 24, 0)]),
    student(13, "Cyrus", [result(1, 0, 24, 0), result(2, 6, 24, 25), result(3, 0, 24, 0), result(4, 0, 24, 0)]),
  ],
};

const manyStudents: CourseStaffProgressResponse = {
  ...data,
  students: Array.from({ length: 8 }, (_, index) =>
    student(100 + index, `Pupil${index}`, [result(1, index, 24, index * 10), result(2, index, 24, index * 10 + 5), result(3, index, 24, index * 10), result(4, 0, 24, 0)]),
  ),
};

function mockProgress(response: CourseStaffProgressResponse): void {
  vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
    data: response,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);
}

function chart(): SVGElement {
  return screen.getByTestId("progress-chart").querySelector("svg") as SVGElement;
}

function visibleSeries(): HTMLElement[] {
  return screen.getAllByTestId("chart-series-student").filter((node) => node.getAttribute("data-visible") === "true");
}

function pressKey(key: string): void {
  fireEvent.keyDown(chart(), { key });
}

function tooltipNames(): string[] {
  return screen.getAllByTestId("chart-tooltip-entry").map((entry) => entry.querySelector("span.truncate")?.textContent ?? "");
}

function tooltipValues(): number[] {
  return screen.getAllByTestId("chart-tooltip-entry").map((entry) => parseFloat((entry.lastElementChild?.textContent ?? "").replace(",", ".")));
}

beforeEach(async () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: query.includes("1024px"), addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  await i18n.changeLanguage("en");
  mockProgress(data);
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as { animate?: unknown }).animate;
});

describe("Progress line chart", () => {
  it("sits above the table, plots started periods only and draws one line per visible student plus a dashed average", () => {
    render(<JournalProgressView courseId={1} />);
    const container = screen.getByTestId("progress-chart");
    const table = screen.getByRole("table", { name: "Class results by period" });
    expect(container.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const labels = Array.from(container.querySelectorAll("svg text")).map((node) => node.textContent);
    expect(labels).toContain("Month 10");
    expect(labels).not.toContain("Month 11");
    expect(visibleSeries()).toHaveLength(3);
    expect(screen.getByTestId("chart-series-average").querySelector("path")?.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(visibleSeries()[1].querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("uses smooth curves and no box border", () => {
    render(<JournalProgressView courseId={1} />);
    expect(screen.getAllByTestId("chart-line")[0].getAttribute("d")).toMatch(/C/);
    expect(screen.getByTestId("progress-chart").className).not.toMatch(/border/);
    const gridlines = Array.from(screen.getByTestId("progress-chart").querySelectorAll("[data-testid='chart-gridline']"));
    expect(gridlines.map((line) => line.getAttribute("data-value"))).toEqual(["0", "25", "50", "75", "100"]);
    expect(gridlines.filter((line) => line.getAttribute("stroke-dasharray")).length).toBe(4);
  });

  it("keeps a value above 100 inside the domain", () => {
    render(<JournalProgressView courseId={1} />);
    const gridY = Number(screen.getByTestId("progress-chart").querySelector("[data-testid='chart-gridline'][data-value='100']")?.getAttribute("y1"));
    const above = screen.getAllByTestId("chart-point").find((point) => point.getAttribute("data-value") === "114") as Element;
    expect(Number(above.getAttribute("cy"))).toBeLessThan(gridY);
    expect(Number(above.getAttribute("cy"))).toBeGreaterThanOrEqual(0);
  });

  it("breaks a student's line at a missing value instead of drawing zero", () => {
    render(<JournalProgressView courseId={1} />);
    const anvar = screen.getAllByTestId("chart-series-student").find((node) => node.getAttribute("data-student-id") === "11") as HTMLElement;
    expect(anvar.querySelectorAll("[data-testid='chart-line']")).toHaveLength(0);
    expect(Array.from(anvar.querySelectorAll("[data-testid='chart-point']")).map((point) => point.getAttribute("data-value"))).toEqual(["75", "114"]);
    const bahor = screen.getAllByTestId("chart-series-student").find((node) => node.getAttribute("data-student-id") === "12") as HTMLElement;
    expect(bahor.querySelectorAll("[data-testid='chart-line']")).toHaveLength(1);
  });

  it("hides a line from its legend chip, fading it over 200ms, and moves the student under the +N more chip", () => {
    render(<JournalProgressView courseId={1} />);
    const legend = screen.getByRole("list", { name: "Chart series" });
    expect(screen.queryByTestId("legend-more")).toBeNull();
    fireEvent.click(within(legend).getByRole("button", { name: "Bahor Tester" }));
    expect(within(legend).queryByRole("button", { name: "Bahor Tester" })).toBeNull();
    expect(screen.getByTestId("legend-more").textContent).toBe("+1 more");
    expect(visibleSeries()).toHaveLength(2);
    const hidden = screen.getAllByTestId("chart-series-student").find((node) => node.getAttribute("data-visible") === "false") as HTMLElement;
    expect(hidden.style.opacity).toBe("0");
    expect(hidden.getAttribute("class")).toContain("transition-opacity");
    expect(hidden.getAttribute("class")).toContain("duration-200");
    fireEvent.click(screen.getByTestId("legend-more"));
    fireEvent.click(within(screen.getByRole("listbox", { name: "Choose students to plot" })).getByRole("option", { name: /Bahor Tester/ }));
    expect(visibleSeries()).toHaveLength(3);
    expect(screen.queryByTestId("legend-more")).toBeNull();
    fireEvent.click(within(legend).getByRole("button", { name: "Class average" }));
    expect(screen.getByTestId("chart-series-average").getAttribute("data-visible")).toBe("false");
  });

  it("plots the top six by latest value for a large roster and keeps the rest in a +N more listbox with checkboxes", () => {
    mockProgress(manyStudents);
    render(<JournalProgressView courseId={1} />);
    expect(visibleSeries()).toHaveLength(6);
    expect(visibleSeries().map((node) => node.getAttribute("data-student-id")).sort()).toEqual(["102", "103", "104", "105", "106", "107"]);
    expect(screen.getByTestId("chart-series-average").getAttribute("data-visible")).toBe("true");
    const legend = screen.getByRole("list", { name: "Chart series" });
    expect(within(legend).getAllByRole("button")).toHaveLength(7);
    const more = screen.getByTestId("legend-more");
    expect(more.textContent).toBe("+2 more");
    expect(more.getAttribute("aria-haspopup")).toBe("listbox");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const listbox = screen.getByRole("listbox", { name: "Choose students to plot" });
    expect(listbox.getAttribute("aria-multiselectable")).toBe("true");
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(8);
    expect(options.filter((option) => option.getAttribute("aria-selected") === "true")).toHaveLength(6);
    expect(screen.getByTestId("legend-more-popover").getAttribute("class")).toContain("motion-safe:animate-[card-scale-in_150ms");
    fireEvent.click(within(listbox).getByRole("option", { name: /Pupil0/ }));
    expect(visibleSeries()).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(visibleSeries()).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Hide all" }));
    expect(visibleSeries()).toHaveLength(0);
    expect(screen.getByTestId("chart-series-average").getAttribute("data-visible")).toBe("true");
  });

  it("moves through the options with the arrow keys and closes with Escape, returning focus to the chip", () => {
    mockProgress(manyStudents);
    render(<JournalProgressView courseId={1} />);
    const more = screen.getByTestId("legend-more");
    fireEvent.click(more);
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(document.activeElement).toBe(options[0]);
    fireEvent.keyDown(options[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(options[1], { key: "End" });
    expect(document.activeElement).toBe(options[7]);
    fireEvent.keyDown(options[7], { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("closes the popover on an outside press", () => {
    mockProgress(manyStudents);
    render(<JournalProgressView courseId={1} />);
    fireEvent.click(screen.getByTestId("legend-more"));
    expect(screen.getByRole("listbox")).toBeDefined();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("makes the legend a single horizontally scrollable row on phones", () => {
    render(<JournalProgressView courseId={1} />);
    const row = screen.getByRole("list", { name: "Chart series" });
    expect(row.className).toContain("flex-nowrap");
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className).toContain("lg:flex-wrap");
  });

  it("gives every plotted line a distinct look: palette slot plus dash pattern once the eight colours run out", () => {
    const wide: CourseStaffProgressResponse = {
      ...data,
      students: Array.from({ length: 18 }, (_, index) =>
        student(200 + index, `Wide${String(index).padStart(2, "0")}`, [result(1, index, 24, index * 5), result(2, index, 24, index * 5 + 1), result(3, index, 24, index * 5 + 2), result(4, 0, 24, 0)]),
      ),
    };
    mockProgress(wide);
    render(<JournalProgressView courseId={1} />);
    fireEvent.click(screen.getByTestId("legend-more"));
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    const looks = screen.getAllByTestId("chart-series-student").map((group) => {
      const path = group.querySelector("[data-testid='chart-line']") as Element;
      return `${path.getAttribute("class")}|${path.getAttribute("stroke-dasharray")}`;
    });
    expect(looks).toHaveLength(18);
    expect(new Set(looks).size).toBe(18);
    expect(screen.getAllByTestId("swatch-dashed").length).toBeGreaterThan(0);
  });

  it("narrows the card on small widths, sets type smaller, flips away from the pointer and titles every name", () => {
    class NarrowObserver {
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(): void {
        this.callback([{ contentRect: { width: 390 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect(): void {}
      unobserve(): void {}
    }
    vi.stubGlobal("ResizeObserver", NarrowObserver);
    render(<JournalProgressView courseId={1} />);
    fireEvent.focus(chart());
    pressKey("Home");
    const card = screen.getByTestId("chart-tooltip");
    expect(card.style.width).toBe("168px");
    expect(card.getAttribute("class")).toContain("text-xs");
    expect(card.getAttribute("data-side")).toBe("right");
    pressKey("End");
    expect(card.getAttribute("data-side")).toBe("left");
    const entries = screen.getAllByTestId("chart-tooltip-entry");
    for (const entry of entries) {
      const name = entry.querySelector("span.truncate") as HTMLElement;
      expect(name.getAttribute("title")).toBe(name.textContent);
      expect((entry.lastElementChild as HTMLElement).className).toContain("tabular-nums");
    }
    const x = Number((card.style.transform.match(/-?[\d.]+/) as RegExpMatchArray)[0]);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + 168).toBeLessThanOrEqual(390);
    vi.unstubAllGlobals();
  });

  it("lists every visible value at the focused period sorted from high to low", () => {
    render(<JournalProgressView courseId={1} />);
    fireEvent.focus(chart());
    pressKey("Home");
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("Month 8");
    expect(tooltipNames()).toEqual(["Anvar Tester", "Bahor Tester", "Class average", "Cyrus Tester"]);
    expect(tooltipValues()).toEqual([75, 50, 41.67, 0]);
    pressKey("ArrowRight");
    expect(tooltipNames()).toEqual(["Bahor Tester", "Class average", "Cyrus Tester"]);
    expect(tooltipValues()).toEqual([50, 37.5, 25]);
  });

  it("omits hidden students from the crosshair card", () => {
    render(<JournalProgressView courseId={1} />);
    fireEvent.click(within(screen.getByRole("list", { name: "Chart series" })).getByRole("button", { name: "Anvar Tester" }));
    fireEvent.focus(chart());
    pressKey("Home");
    expect(tooltipNames()).not.toContain("Anvar Tester");
  });

  it("moves between periods with the arrow keys, clamps at the ends and announces the values", () => {
    render(<JournalProgressView courseId={1} />);
    fireEvent.focus(chart());
    pressKey("Home");
    pressKey("ArrowLeft");
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("Month 8");
    pressKey("End");
    pressKey("ArrowRight");
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("Month 10");
    expect(screen.getByTestId("chart-live").textContent).toContain("Month 10");
    pressKey("Escape");
    expect(screen.getByTestId("chart-tooltip").getAttribute("data-active")).toBe("false");
  });

  it("glides the same crosshair and card element to the new x instead of re-mounting them", () => {
    render(<JournalProgressView courseId={1} />);
    fireEvent.focus(chart());
    pressKey("Home");
    const card = screen.getByTestId("chart-tooltip");
    const guide = screen.getByTestId("chart-crosshair");
    const cardTransformBefore = card.style.transform;
    const guideTransformBefore = guide.style.transform;
    pressKey("ArrowRight");
    expect(screen.getByTestId("chart-tooltip")).toBe(card);
    expect(screen.getByTestId("chart-crosshair")).toBe(guide);
    expect(card.style.transform).not.toBe(cardTransformBefore);
    expect(guide.style.transform).not.toBe(guideTransformBefore);
    expect(card.style.transform).toMatch(/translateX\(/);
    expect(guide.getAttribute("class")).toContain("duration-150");
    expect(card.getAttribute("class")).toContain("ease-[cubic-bezier(0.16,1,0.3,1)]");
    expect(card.getAttribute("class")).toContain("motion-safe:transition-[transform,opacity]");
    expect(card.getAttribute("class")).toContain("transition-opacity");
  });

  it("ends on the last requested period after rapid moves", () => {
    render(<JournalProgressView courseId={1} />);
    fireEvent.focus(chart());
    pressKey("Home");
    pressKey("End");
    pressKey("Home");
    pressKey("ArrowRight");
    pressKey("ArrowRight");
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("Month 10");
    expect(screen.getByTestId("chart-live").textContent).toContain("Month 10");
  });

  it("flips the card to the left of the crosshair near the right edge and stays inside the chart", () => {
    render(<JournalProgressView courseId={1} />);
    fireEvent.focus(chart());
    pressKey("Home");
    const card = screen.getByTestId("chart-tooltip");
    expect(card.getAttribute("data-side")).toBe("right");
    pressKey("End");
    expect(card.getAttribute("data-side")).toBe("left");
    const x = Number((card.style.transform.match(/-?[\d.]+/) as RegExpMatchArray)[0]);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + 244).toBeLessThanOrEqual(640);
  });

  it("grows the points of the hovered period slightly and restores the others", () => {
    render(<JournalProgressView courseId={1} />);
    fireEvent.focus(chart());
    pressKey("Home");
    const points = screen.getAllByTestId("chart-point");
    const scaled = points.filter((point) => (point as unknown as SVGElement).style.transform === "scale(1.4)");
    expect(scaled.length).toBeGreaterThan(0);
    expect(points.some((point) => (point as unknown as SVGElement).style.transform === "scale(1)")).toBe(true);
    expect(points[0].getAttribute("class")).toContain("motion-safe:duration-150");
    pressKey("Escape");
    expect(screen.getAllByTestId("chart-point").every((point) => (point as unknown as SVGElement).style.transform === "scale(1)")).toBe(true);
  });

  it("follows the pointer to the nearest period and hides on mouse leave", () => {
    render(<JournalProgressView courseId={1} />);
    const area = screen.getByTestId("chart-hit-area");
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100, top: 0, right: 100, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(area, { clientX: 100 });
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("Month 10");
    fireEvent.pointerMove(area, { clientX: 0 });
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("Month 8");
    fireEvent.pointerLeave(area, { pointerType: "mouse" });
    expect(screen.getByTestId("chart-tooltip").getAttribute("data-active")).toBe("false");
  });

  it("crossfades the lines over 200ms on mount and on data change, cancelling the interrupted fade", () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    (Element.prototype as unknown as { animate: unknown }).animate = animate;
    const { rerender } = render(<JournalProgressView courseId={1} />);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenLastCalledWith([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    mockProgress(manyStudents);
    rerender(<JournalProgressView courseId={1} />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalled();
    rerender(<JournalProgressView courseId={1} />);
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("keeps movement behind motion-safe and leaves opacity feedback for reduced motion", () => {
    render(<JournalProgressView courseId={1} />);
    for (const element of [screen.getByTestId("chart-crosshair"), screen.getByTestId("chart-tooltip")]) {
      const classes = element.getAttribute("class") ?? "";
      expect(classes).toContain("motion-safe:transition-[transform,opacity]");
      expect(classes.split(" ")).toContain("transition-opacity");
    }
    const pointClasses = (screen.getAllByTestId("chart-point")[0].getAttribute("class") ?? "").split(" ");
    expect(pointClasses).toContain("motion-safe:transition-transform");
    expect(pointClasses).not.toContain("transition-transform");
  });

  it("does not render the chart or table when no period has started and explains why", () => {
    mockProgress({ ...data, periods: [PERIODS[3]], students: data.students.map((entry) => ({ ...entry, period_results: [result(4, 0, 24, 0)] })) });
    render(<JournalProgressView courseId={1} />);
    expect(screen.queryByTestId("progress-chart")).toBeNull();
    expect(screen.queryByTestId("progress-table")).toBeNull();
    expect(screen.getByText("No period has started yet")).toBeDefined();
  });

  it("puts the explanation behind an info tooltip instead of a permanent line", async () => {
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByRole("button", { name: "About these results" })).toBeDefined();
    expect(screen.queryByText("Average of stored totals for every period of this course. Missing results show as Unavailable.", { selector: "p" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "About these results" }));
    });
    expect(screen.getByText(/Average of stored totals for every period/)).toBeDefined();
  });
});

function studentRows(): HTMLElement[] {
  return screen.getAllByTestId("student-row");
}

function rowNames(): string[] {
  return studentRows().map((row) => row.querySelector("span.truncate")?.textContent ?? "");
}

describe("Progress table", () => {
  it("is transposed: students down the side, started periods across with short labels and the range only in a title", () => {
    render(<JournalProgressView courseId={1} />);
    const table = screen.getByRole("table", { name: "Class results by period" });
    const headers = within(table).getAllByRole("columnheader").map((header) => header.textContent?.replace(/[↑↓]/g, "").trim());
    expect(headers).toEqual(["Student", "Month 8", "Month 9", "Month 10", "Average", "Trend"]);
    const monthButton = within(table).getByRole("button", { name: "Sort by Month 8" });
    expect(monthButton.getAttribute("title")).toMatch(/08\/01\/2026|01\.08\.2026|2026/);
    expect(table.textContent).not.toMatch(/Month 11|Upcoming|Not started/);
    for (const header of within(table).getAllByRole("columnheader")) {
      expect(header.className).not.toContain("uppercase");
      expect(header.className).not.toContain("tracking");
    }
  });

  it("lists every student, including those hidden from the chart, with no counts or totals sub-line", () => {
    mockProgress(manyStudents);
    render(<JournalProgressView courseId={1} />);
    expect(studentRows()).toHaveLength(8);
    expect(studentRows().filter((row) => row.getAttribute("data-visible") === "false")).toHaveLength(2);
    const text = screen.getByTestId("progress-table").textContent ?? "";
    expect(text).not.toMatch(/ of \d/);
    expect(text).not.toContain("Stored results");
    expect(screen.queryByText(/students$/)).toBeNull();
  });

  it("shows each cell as a bare percentage and a missing value as a muted dash, never zero", () => {
    render(<JournalProgressView courseId={1} />);
    const anvar = studentRows().find((row) => row.textContent?.includes("Anvar")) as HTMLElement;
    const cells = within(anvar).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["75%", "—Unavailable", "114%", "95%", "↑ 39up"]);
    expect(cells[1].querySelector("span.text-muted")).not.toBeNull();
    expect(cells[0].querySelector("span.tabular-nums")).not.toBeNull();
    const cyrus = studentRows().find((row) => row.textContent?.includes("Cyrus")) as HTMLElement;
    expect(within(cyrus).getAllByRole("cell")[0].textContent).toBe("0%");
  });

  it("adds a trend from the first to the last stored period with muted green, red or neutral tokens", () => {
    render(<JournalProgressView courseId={1} />);
    const trendOf = (name: string): HTMLElement => {
      const row = studentRows().find((candidate) => candidate.textContent?.includes(name)) as HTMLElement;
      return row.querySelector("[data-trend]") as HTMLElement;
    };
    expect(trendOf("Anvar").getAttribute("data-trend")).toBe("up");
    expect(trendOf("Anvar").className).toContain("text-success");
    expect(trendOf("Anvar").textContent).toContain("39");
    expect(trendOf("Bahor").getAttribute("data-trend")).toBe("flat");
    expect(trendOf("Bahor").className).toContain("text-muted");
    mockProgress({ ...data, students: [student(11, "Dara", [result(1, 18, 24, 80), result(2, 12, 24, 50), result(3, 12, 24, 59), result(4, 0, 24, 0)])] });
    cleanup();
    render(<JournalProgressView courseId={1} />);
    expect(trendOf("Dara").getAttribute("data-trend")).toBe("down");
    expect(trendOf("Dara").className).toContain("text-destructive");
    expect(trendOf("Dara").textContent).toContain("21");
  });

  it("shows a single stored value's trend as a dash", () => {
    mockProgress({ ...data, students: [student(11, "Eli", [result(1, 18, 24, 80), result(2, null, null, null), result(3, null, null, null), result(4, 0, 24, 0)])] });
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByTestId("student-row").querySelector("[data-trend]")).toBeNull();
  });

  it("pins a muted Class average row with the dashed swatch above the students", () => {
    render(<JournalProgressView courseId={1} />);
    const classRow = screen.getByTestId("class-row");
    expect(classRow.className).toContain("text-muted");
    expect(classRow.textContent).toContain("Class average");
    expect(classRow.querySelector("span.border-dashed")).not.toBeNull();
    expect(classRow.compareDocumentPosition(studentRows()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const cells = within(classRow).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells[0]).toBe("42%");
    expect(classRow.querySelector("td span.tabular-nums")?.getAttribute("title")).toBe("41.67%");
  });

  it("starts each row with the chart's swatch, hollow for a hidden student, and a row click toggles the chart line", () => {
    mockProgress(manyStudents);
    render(<JournalProgressView courseId={1} />);
    const hiddenRow = studentRows().find((row) => row.getAttribute("data-visible") === "false") as HTMLElement;
    expect(hiddenRow.querySelector("span.border-muted")).not.toBeNull();
    const shown = visibleSeries().length;
    const button = within(hiddenRow).getByRole("button");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(hiddenRow);
    expect(visibleSeries()).toHaveLength(shown + 1);
    expect(hiddenRow.getAttribute("data-visible")).toBe("true");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(visibleSeries()).toHaveLength(shown);
    expect(screen.getByTestId("legend-more")).toBeDefined();
  });

  it("sorts by the latest period high to low by default, nulls last", () => {
    render(<JournalProgressView courseId={1} />);
    expect(rowNames()).toEqual(["Anvar Tester", "Bahor Tester", "Cyrus Tester"]);
    expect(within(screen.getByTestId("progress-table")).getByRole("columnheader", { name: /Month 10/ }).getAttribute("aria-sort")).toBe("descending");
  });

  it("sorts by any period, the average or the trend from the column headers and toggles the direction", () => {
    render(<JournalProgressView courseId={1} />);
    const table = screen.getByTestId("progress-table");
    fireEvent.click(within(table).getByRole("button", { name: "Sort by Month 9" }));
    expect(rowNames()).toEqual(["Bahor Tester", "Cyrus Tester", "Anvar Tester"]);
    fireEvent.click(within(table).getByRole("button", { name: "Sort by Month 9" }));
    expect(rowNames()).toEqual(["Cyrus Tester", "Bahor Tester", "Anvar Tester"]);
    expect(within(table).getByRole("columnheader", { name: /Month 9/ }).getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(within(table).getByRole("button", { name: "Sort by Average" }));
    expect(rowNames()[0]).toBe("Anvar Tester");
    fireEvent.click(within(table).getByRole("button", { name: "Sort by Trend" }));
    expect(rowNames()[0]).toBe("Anvar Tester");
    expect(within(table).getByRole("columnheader", { name: /Trend/ }).getAttribute("aria-sort")).toBe("descending");
  });

  it("keeps horizontal scrolling inside the table with a sticky name column and compact 44px rows", () => {
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByTestId("progress-table-scroll").className).toContain("overflow-x-auto");
    const nameCell = studentRows()[0].querySelector("th") as HTMLElement;
    expect(nameCell.className).toContain("sticky");
    expect(nameCell.className).toContain("left-0");
    expect(studentRows()[0].className).toContain("h-11");
    expect(studentRows()[0].className).toContain("border-border/60");
  });
});

describe("Progress table number format", () => {
  it("rounds every table percentage to a whole number and keeps the exact value in the cell title", () => {
    mockProgress({
      ...data,
      students: [student(11, "Fay", [result(1, 13, 24, 55.8), result(2, 9, 24, 36.96), result(3, 6, 24, 26.18), result(4, 0, 24, 0)])],
    });
    render(<JournalProgressView courseId={1} />);
    const row = screen.getByTestId("student-row");
    const cells = within(row).getAllByRole("cell");
    expect(cells.slice(0, 4).map((cell) => cell.textContent)).toEqual(["56%", "37%", "26%", "40%"]);
    expect(cells[0].querySelector("span.tabular-nums")?.getAttribute("title")).toBe("55.8%");
    expect(cells[1].querySelector("span.tabular-nums")?.getAttribute("title")).toBe("36.96%");
    expect(screen.getByTestId("progress-table").textContent).not.toMatch(/\d[.,]\d+%/);
  });

  it("draws a dashed swatch as a 14 by 2 line segment and a solid one as a dot", () => {
    const wide: CourseStaffProgressResponse = {
      ...data,
      students: Array.from({ length: 10 }, (_, index) =>
        student(300 + index, `Wide${index}`, [result(1, index, 24, index * 5), result(2, index, 24, index * 5 + 1), result(3, index, 24, index * 5 + 2), result(4, 0, 24, 0)]),
      ),
    };
    mockProgress(wide);
    render(<JournalProgressView courseId={1} />);
    const dashed = screen.getAllByTestId("swatch-dashed");
    expect(dashed.length).toBeGreaterThan(0);
    expect(dashed[0].getAttribute("width")).toBe("14");
    expect(dashed[0].getAttribute("height")).toBe("2");
    expect(dashed[0].querySelector("circle")).toBeNull();
    expect(dashed[0].querySelector("line")?.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(studentRows()[0].querySelector("span.rounded-full")).not.toBeNull();
  });
});

describe("Progress view as a read-only student", () => {
  function mockClassProgress(response: CourseStaffProgressResponse): void {
    vi.mocked(courseHooks.useCourseClassProgress).mockReturnValue({
      data: response,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseClassProgress>);
  }

  it("shows a student-phrased load error that does not mention gradebooks or unsaved changes", () => {
    vi.mocked(courseHooks.useCourseClassProgress).mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() } as unknown as ReturnType<typeof courseHooks.useCourseClassProgress>);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={107} />);
    expect(screen.getByText("Your results are not affected. Try again in a moment.")).toBeTruthy();
    expect(screen.queryByText(/gradebook|unsaved/i)).toBeNull();
  });

  it("keeps the mentor-phrased load error for staff", () => {
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByText("Your gradebook and unsaved changes are not affected.")).toBeTruthy();
  });

  it("reads the class endpoint, not the staff endpoint", () => {
    mockClassProgress(manyStudents);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={107} />);
    expect(vi.mocked(courseHooks.useCourseClassProgress)).toHaveBeenLastCalledWith(1, true);
    expect(vi.mocked(courseHooks.useCourseStaffProgress)).toHaveBeenLastCalledWith(1, false);
  });

  it("selects the own line by default even when it ranks outside the top six, and pins it first with a You badge", () => {
    mockClassProgress(manyStudents);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={100} />);
    const ownGroup = screen.getAllByTestId("chart-series-student").find((node) => node.getAttribute("data-student-id") === "100");
    expect(ownGroup?.getAttribute("data-visible")).toBe("true");
    expect(visibleSeries()).toHaveLength(7);
    const legendButtons = within(screen.getByTestId("progress-legend")).getAllByRole("button");
    expect(legendButtons[1].textContent).toContain("Pupil0");
    expect(legendButtons[1].textContent).toContain("You");
    const rows = screen.getAllByTestId("student-row");
    expect(rows[0].getAttribute("data-student-id")).toBe("100");
    expect(rows[0].getAttribute("data-self")).toBe("true");
    expect(rows.filter((row) => row.getAttribute("data-self") === "true")).toHaveLength(1);
  });

  it("draws the own line thicker than classmates", () => {
    mockClassProgress(data);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={12} />);
    const widthOf = (id: string) =>
      screen.getAllByTestId("chart-series-student").find((node) => node.getAttribute("data-student-id") === id)?.querySelector("path")?.getAttribute("stroke-width");
    expect(Number(widthOf("12"))).toBeGreaterThan(Number(widthOf("13")));
  });
});

describe("Progress chart-only mode on the journal page", () => {
  it("renders the chart without the per-student table, scope heading or class row", () => {
    render(<JournalProgressView courseId={1} chartOnly />);
    expect(screen.getByTestId("progress-chart")).toBeDefined();
    expect(screen.queryByTestId("progress-table")).toBeNull();
    expect(screen.queryByTestId("student-row")).toBeNull();
  });

  it("renders nothing when no period has graded data", () => {
    const ungraded: CourseStaffProgressResponse = {
      ...data,
      students: data.students.map((entry) => ({
        ...entry,
        period_results: entry.period_results.map((periodResult) => result(periodResult.period_id, null, null, null)),
      })),
    };
    mockProgress(ungraded);
    const view = render(<JournalProgressView courseId={1} chartOnly />);
    expect(view.container.innerHTML).toBe("");
  });

  it("collapses and expands the chart and remembers the collapsed state in localStorage", () => {
    window.localStorage.clear();
    const first = render(<JournalProgressView courseId={1} chartOnly />);
    const toggle: HTMLElement = screen.getByTestId("progress-collapse-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(screen.queryByTestId("progress-chart")).toBeNull();
    expect(screen.getByTestId("progress-collapse-toggle").getAttribute("aria-expanded")).toBe("false");
    first.unmount();
    render(<JournalProgressView courseId={1} chartOnly />);
    expect(screen.queryByTestId("progress-chart")).toBeNull();
    fireEvent.click(screen.getByTestId("progress-collapse-toggle"));
    expect(screen.getByTestId("progress-chart")).toBeDefined();
    window.localStorage.clear();
  });

  it("still renders the full table in the default student mode", () => {
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByTestId("progress-table")).toBeDefined();
  });
});
