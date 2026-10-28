import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "../../i18n";
import { JournalProgressView } from "./JournalProgressView";
import * as courseHooks from "../../lib/courses/hooks";
import { chart, data, manyStudents, mockProgress, pressKey, result, student, tooltipLabels, tooltipNames, visibleSeries, PERIODS } from "./JournalProgressTestSupport";
import type { CourseStaffProgressResponse } from "../../lib/courses/types";

vi.mock("../../lib/courses/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/courses/hooks")>();
  return { ...actual, useCourseStaffProgress: vi.fn(), useCourseClassProgress: vi.fn(() => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() })), useCourseJournals: vi.fn(() => ({ data: undefined })) };
});

vi.mock("../../i18n/formatters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/formatters")>();
  return { ...actual, getSchoolCalendarDate: () => "2026-10-15" };
});

beforeEach(async () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: query.includes("1024px"), addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  window.localStorage.clear();
  await i18n.changeLanguage("en");
  mockProgress(data);
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as { animate?: unknown }).animate;
});

describe("Progress score chart", () => {
  it("plots started periods only with one line per visible student plus a dashed class average", () => {
    render(<JournalProgressView courseId={1} />);
    const labels = Array.from(screen.getByTestId("progress-chart").querySelectorAll("svg text")).map((node) => node.textContent);
    expect(labels).toContain("Month 10");
    expect(labels).not.toContain("Month 11");
    expect(visibleSeries()).toHaveLength(3);
    expect(screen.getByTestId("chart-series-average").querySelector("path")?.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(screen.getAllByTestId("chart-line")[0].getAttribute("d")).toMatch(/C/);
  });

  it("draws the y-axis in score points with round ticks that cover the highest score", () => {
    render(<JournalProgressView courseId={1} />);
    const gridlines = Array.from(screen.getByTestId("progress-chart").querySelectorAll("[data-testid='chart-gridline']"));
    expect(gridlines.map((line) => line.getAttribute("data-value"))).toEqual(["0", "5", "10", "15", "20", "25"]);
    expect(screen.getByTestId("progress-chart").querySelector("svg")?.textContent).not.toContain("%");
  });

  it("states the shared maximum once as a single muted label and never prints score over maximum on the plot", () => {
    render(<JournalProgressView courseId={1} />);
    const svg: Element = screen.getByTestId("progress-chart").querySelector("svg") as Element;
    expect(svg.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
    expect(svg.querySelectorAll("[data-testid='chart-maximum-label']").length).toBeLessThanOrEqual(1);
  });

  it("places a score above the first period maximum inside the domain and plots scores, not percentages", () => {
    render(<JournalProgressView courseId={1} />);
    const top = Number(screen.getByTestId("progress-chart").querySelector("[data-testid='chart-gridline'][data-value='25']")?.getAttribute("y1"));
    const highest = screen.getAllByTestId("chart-point").find((point) => point.getAttribute("data-value") === "25") as Element;
    expect(Number(highest.getAttribute("cy"))).toBeCloseTo(top, 5);
    expect(screen.getAllByTestId("chart-point").some((point) => point.getAttribute("data-value") === "75")).toBe(false);
  });

  it("draws the per-period maximum as a step line that differs between periods and can be toggled", () => {
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByTestId("chart-series-maximum").getAttribute("data-visible")).toBe("false");
    fireEvent.click(screen.getByTestId("legend-maximum"));
    const path = screen.getByTestId("chart-maximum-line").getAttribute("d") ?? "";
    expect(path).toMatch(/^M[\d.-]+,[\d.]+H[\d.]+V[\d.]+H[\d.]+V[\d.]+H[\d.]+$/);
    const [startX, endX] = [Number(path.match(/^M([\d.-]+),/)?.[1]), Number(path.match(/H([\d.]+)$/)?.[1])];
    expect(startX).toBeGreaterThanOrEqual(42);
    expect(endX).toBeLessThanOrEqual(640 - 24);
    const verticals = Array.from(path.matchAll(/V([\d.]+)/g)).map((match) => Number(match[1]));
    expect(new Set(verticals).size).toBe(2);
    expect(screen.getByTestId("chart-series-maximum").getAttribute("data-visible")).toBe("true");
    fireEvent.click(screen.getByTestId("legend-maximum"));
    expect(screen.getByTestId("chart-series-maximum").getAttribute("data-visible")).toBe("false");
  });

  it("breaks a student's line at a missing value instead of drawing zero", () => {
    render(<JournalProgressView courseId={1} />);
    const anvar = screen.getAllByTestId("chart-series-student").find((node) => node.getAttribute("data-student-id") === "11") as HTMLElement;
    expect(anvar.querySelectorAll("[data-testid='chart-line']")).toHaveLength(0);
    expect(Array.from(anvar.querySelectorAll("[data-testid='chart-point']")).map((point) => point.getAttribute("data-value"))).toEqual(["18", "25"]);
  });

  it("hides a line from its legend chip and moves the student under the +N more chip", () => {
    render(<JournalProgressView courseId={1} />);
    const legend = screen.getByRole("list", { name: "Chart series" });
    expect(screen.queryByTestId("legend-more")).toBeNull();
    fireEvent.click(within(legend).getByRole("button", { name: "Bahor Tester" }));
    expect(screen.getByTestId("legend-more").textContent).toBe("+1 more");
    expect(visibleSeries()).toHaveLength(2);
    const hidden = screen.getAllByTestId("chart-series-student").find((node) => node.getAttribute("data-visible") === "false") as HTMLElement;
    expect(hidden.style.opacity).toBe("0");
    expect(hidden.getAttribute("class")).toContain("duration-150");
    expect(hidden.getAttribute("class")).toContain("ease-out");
    fireEvent.click(screen.getByTestId("legend-more"));
    fireEvent.click(within(screen.getByRole("listbox", { name: "Choose students to plot" })).getByRole("option", { name: /Bahor Tester/ }));
    expect(visibleSeries()).toHaveLength(3);
    fireEvent.click(within(legend).getByRole("button", { name: "Class average" }));
    expect(screen.getByTestId("chart-series-average").getAttribute("data-visible")).toBe("false");
  });

  it("plots the top six for a large roster and lists the rest in a +N more listbox", () => {
    mockProgress(manyStudents);
    render(<JournalProgressView courseId={1} />);
    expect(visibleSeries().map((node) => node.getAttribute("data-student-id")).sort()).toEqual(["102", "103", "104", "105", "106", "107"]);
    const more = screen.getByTestId("legend-more");
    expect(more.textContent).toBe("+2 more");
    fireEvent.click(more);
    const listbox = screen.getByRole("listbox", { name: "Choose students to plot" });
    expect(within(listbox).getAllByRole("option")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(visibleSeries()).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Hide all" }));
    expect(visibleSeries()).toHaveLength(0);
    expect(screen.getByTestId("chart-series-average").getAttribute("data-visible")).toBe("true");
  });

  it("moves through the options with the arrow keys, closes with Escape and on an outside press", () => {
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
    fireEvent.click(more);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("gives every plotted line a distinct look once the eight colours run out", () => {
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
    expect(new Set(looks).size).toBe(18);
    expect(screen.getAllByTestId("swatch-dashed").length).toBeGreaterThan(0);
  });

  it("lists the students ranked high to low and keeps the class average as the last row without a maximum row", () => {
    render(<JournalProgressView courseId={1} />);
    fireEvent.focus(chart());
    pressKey("Home");
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("Aug 2026");
    expect(tooltipNames()).toEqual(["Anvar Tester", "Bahor Tester", "Cyrus Tester", "Class average"]);
    expect(tooltipLabels()).toEqual(["18", "12", "0", "10"]);
    const entryTexts: string[] = screen.getAllByTestId("chart-tooltip-entry").map((entry) => entry.textContent ?? "");
    expect(entryTexts[0]).toBe("Anvar Tester18");
    entryTexts.forEach((text) => expect(text).not.toContain("%"));
    expect(screen.queryByTestId("chart-tooltip-dates")).toBeNull();
    expect(tooltipNames()).not.toContain("Maximum");
    pressKey("ArrowRight");
    expect(tooltipNames()).toEqual(["Bahor Tester", "Cyrus Tester", "Class average"]);
    pressKey("ArrowRight");
    expect(tooltipLabels()[0]).toBe("25");
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
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("Aug 2026");
    pressKey("End");
    pressKey("ArrowRight");
    expect(screen.getByTestId("chart-live").textContent).toContain("Month 10");
    expect(screen.getByTestId("chart-live").textContent).toContain("Anvar Tester 25");
    pressKey("Escape");
    expect(screen.getByTestId("chart-tooltip").getAttribute("data-active")).toBe("false");
  });

  it("glides the same crosshair and card element to the new x instead of re-mounting them", () => {
    render(<JournalProgressView courseId={1} />);
    fireEvent.focus(chart());
    pressKey("Home");
    const card = screen.getByTestId("chart-tooltip");
    const guide = screen.getByTestId("chart-crosshair");
    const before = [card.style.transform, guide.style.transform];
    pressKey("ArrowRight");
    expect(screen.getByTestId("chart-tooltip")).toBe(card);
    expect(card.style.transform).not.toBe(before[0]);
    expect(guide.style.transform).not.toBe(before[1]);
    expect(card.getAttribute("class")).toContain("motion-safe:transition-[transform,opacity]");
    expect(card.getAttribute("class")).toContain("transition-opacity");
  });

  it("flips the card to the left near the right edge and stays inside the chart", () => {
    render(<JournalProgressView courseId={1} />);
    fireEvent.focus(chart());
    pressKey("Home");
    const card = screen.getByTestId("chart-tooltip");
    expect(card.getAttribute("data-side")).toBe("right");
    pressKey("End");
    expect(card.getAttribute("data-side")).toBe("left");
    const x = Number((card.style.transform.match(/-?[\d.]+/) as RegExpMatchArray)[0]);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + 252).toBeLessThanOrEqual(640);
  });

  it("narrows the card on small widths and titles every name", () => {
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
    expect(card.style.width).toBe("192px");
    expect(card.getAttribute("class")).toContain("text-xs");
    for (const entry of screen.getAllByTestId("chart-tooltip-entry")) {
      const name = entry.querySelector("span.break-words") as HTMLElement;
      expect(name.getAttribute("title")).toBe(name.textContent);
      expect((entry.lastElementChild as HTMLElement).className).toContain("tabular-nums");
    }
    vi.unstubAllGlobals();
  });

  it("follows the pointer to the nearest period and hides on mouse leave", () => {
    render(<JournalProgressView courseId={1} />);
    const area = screen.getByTestId("chart-hit-area");
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100, top: 0, right: 100, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(area, { clientX: 100 });
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("Oct 2026");
    fireEvent.pointerMove(area, { clientX: 0 });
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("Aug 2026");
    fireEvent.pointerLeave(area, { pointerType: "mouse" });
    expect(screen.getByTestId("chart-tooltip").getAttribute("data-active")).toBe("false");
  });

  it("crossfades the lines over 150ms ease-out on mount and on data change", () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    (Element.prototype as unknown as { animate: unknown }).animate = animate;
    const { rerender } = render(<JournalProgressView courseId={1} />);
    expect(animate).toHaveBeenLastCalledWith([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "ease-out" });
    mockProgress(manyStudents);
    rerender(<JournalProgressView courseId={1} />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalled();
  });

  it("keeps movement behind motion-safe", () => {
    render(<JournalProgressView courseId={1} />);
    const pointClasses = (screen.getAllByTestId("chart-point")[0].getAttribute("class") ?? "").split(" ");
    expect(pointClasses).toContain("motion-safe:transition-transform");
    expect(pointClasses).not.toContain("transition-transform");
  });

  it("translates period names on the axis, in the card and for screen readers", async () => {
    await i18n.changeLanguage("ru");
    render(<JournalProgressView courseId={1} />);
    expect(Array.from(screen.getByTestId("progress-chart").querySelectorAll("svg text")).map((node) => node.textContent)).toContain("Месяц 10");
    fireEvent.focus(chart());
    pressKey("End");
    expect(screen.getByTestId("chart-live").textContent).toContain("Месяц 10");
    expect(screen.queryByText("Month 10")).toBeNull();
  });
});

describe("Progress chart visibility", () => {
  it("renders nothing when no period has graded data", () => {
    mockProgress({ ...data, students: data.students.map((entry) => ({ ...entry, period_results: entry.period_results.map((periodResult) => result(periodResult.period_id, null, null, null)) })) });
    expect(render(<JournalProgressView courseId={1} />).container.innerHTML).toBe("");
  });

  it("renders nothing when no period has started", () => {
    mockProgress({ ...data, periods: [PERIODS[3]], students: data.students.map((entry) => ({ ...entry, period_results: [result(4, 0, 24, 0)] })) });
    expect(render(<JournalProgressView courseId={1} />).container.innerHTML).toBe("");
  });

  it("labels the y-axis as period totals so it is not read as the 1–5 lesson scale", () => {
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByTestId("progress-axis-label").textContent).toBe("Period totals, points");
    expect(screen.getByRole("button", { name: /period totals \(sum of points\)/ })).toBeDefined();
  });

  it("is a single section with one info tooltip and no table", () => {
    render(<JournalProgressView courseId={1} />);
    expect(screen.queryByTestId("progress-table")).toBeNull();
    expect(screen.queryByTestId("student-row")).toBeNull();
    expect(screen.getAllByRole("button", { name: /not per-lesson grades on the 1–5 scale/ })).toHaveLength(1);
    expect(vi.mocked(courseHooks.useCourseStaffProgress)).toHaveBeenLastCalledWith(1, true);
  });
});
