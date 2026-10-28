import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "../../i18n";
import { JournalProgressView } from "./JournalProgressView";
import { chart, data, manyStudents, mockProgress, pressKey, result, student, PERIODS } from "./JournalProgressTestSupport";
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

const lastPeriodValueOf = (key: string): number => Number(screen.getByTestId("progress-chart").querySelector(`[data-testid='chart-gridline'][data-value='${key}']`)?.getAttribute("y1"));

const spreadData: CourseStaffProgressResponse = {
  ...data,
  periods: PERIODS.slice(0, 3).map((periodRow) => ({ ...periodRow })),
  students: [
    student(21, "Dilnoza", [result(1, 40, 100, 40), result(2, 55, 100, 55), result(3, 62, 100, 62)]),
    student(22, "Eraj", [result(1, 90, 100, 90), result(2, 72, 100, 72), result(3, 88, 100, 88)]),
    student(23, "Firuza", [result(1, 65, 100, 65), result(2, 60, 100, 60), result(3, 70, 100, 70)]),
  ],
};

describe("Progress chart fitted domain and size", () => {
  it("spreads data that spans 40 to 90 over the full plot height instead of a 0 to 125 band", () => {
    mockProgress(spreadData);
    render(<JournalProgressView courseId={1} />);
    const gridValues: number[] = Array.from(screen.getByTestId("progress-chart").querySelectorAll("[data-testid='chart-gridline']")).map((line) => Number(line.getAttribute("data-value")));
    expect(gridValues[0]).toBe(40);
    expect(gridValues.at(-1)).toBe(90);
    const topY: number = lastPeriodValueOf("90");
    const bottomY: number = lastPeriodValueOf("40");
    const pointHeights: number[] = screen.getAllByTestId("chart-point").map((point) => Number(point.getAttribute("cy")));
    expect(Math.min(...pointHeights)).toBeCloseTo(topY, 5);
    expect(Math.max(...pointHeights)).toBeCloseTo(bottomY, 5);
    expect(bottomY - topY).toBeGreaterThan(200);
  });

  it("never lets the upper bound pass the period maximum and extends to it only when the maximum line is shown", () => {
    const withTopScore = (topScore: number): CourseStaffProgressResponse => ({
      ...spreadData,
      students: [student(21, "Dilnoza", [result(1, 40, 98, 40), result(2, 55, 98, 55), result(3, 62, 98, 62)]), student(22, "Eraj", [result(1, 90, 98, 90), result(2, 72, 98, 72), result(3, topScore, 98, 90)])],
    });
    const upperBound = (): number => Math.max(...Array.from(screen.getByTestId("progress-chart").querySelectorAll("[data-testid='chart-gridline']")).map((line) => Number(line.getAttribute("data-value"))));
    mockProgress(withTopScore(95));
    const first = render(<JournalProgressView courseId={1} />);
    expect(upperBound()).toBe(98);
    first.unmount();
    mockProgress(withTopScore(87));
    render(<JournalProgressView courseId={1} />);
    expect(upperBound()).toBe(90);
    fireEvent.click(screen.getByTestId("legend-maximum"));
    expect(upperBound()).toBe(98);
  });

  it("draws a 280 to 320 pixel tall chart for staff and students alike", () => {
    render(<JournalProgressView courseId={1} />);
    const height: number = Number(chart().getAttribute("height"));
    expect(height).toBeGreaterThanOrEqual(280);
    expect(height).toBeLessThanOrEqual(320);
  });

  it("uses only 150ms ease-out for the tooltip glide and series fades, never a custom curve", () => {
    render(<JournalProgressView courseId={1} />);
    const classes: string = [
      screen.getByTestId("chart-tooltip").getAttribute("class"),
      screen.getByTestId("chart-crosshair").getAttribute("class"),
      screen.getAllByTestId("chart-series-student")[0].getAttribute("class"),
      screen.getAllByTestId("chart-point")[0].getAttribute("class"),
    ].join(" ");
    expect(classes).not.toContain("cubic-bezier");
    expect(classes).toContain("duration-150");
    expect(classes).toContain("ease-out");
  });
});

describe("Progress chart tooltip header and legend", () => {
  it("labels the tooltip with a short month and year through the formatter instead of the full date range", () => {
    render(<JournalProgressView courseId={1} />);
    fireEvent.focus(chart());
    pressKey("Home");
    expect(screen.getByTestId("chart-tooltip-period").textContent).toBe("Aug 2026");
    expect(screen.getByTestId("chart-tooltip").textContent).not.toMatch(/08\.2026|01\.08|31\.08/);
  });

  it("titles the section with the performance trend and keeps the explanation in an info tooltip", () => {
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByRole("heading", { name: "Performance trend" })).toBeDefined();
    expect(screen.queryByText("Whole course, all periods")).toBeNull();
    expect(screen.getAllByRole("button", { name: /not per-lesson grades on the 1–5 scale/ })).toHaveLength(1);
  });

  it("lists every student with data in the legend, as a chip or in the more menu", () => {
    mockProgress(manyStudents);
    render(<JournalProgressView courseId={1} />);
    const chipNames: string[] = within(screen.getByRole("list", { name: "Chart series" })).getAllByRole("button").map((button) => button.getAttribute("title") ?? "").filter((name) => name !== "");
    fireEvent.click(screen.getByTestId("legend-more"));
    const optionNames: string[] = within(screen.getByRole("listbox")).getAllByRole("option").map((option) => option.textContent ?? "");
    for (const pupil of manyStudents.students) {
      const fullName: string = `${pupil.first_name} ${pupil.last_name}`;
      expect(chipNames.includes(fullName) || optionNames.some((name) => name.includes(fullName)), fullName).toBe(true);
    }
    expect(chipNames.length + (optionNames.length - chipNames.length)).toBe(manyStudents.students.length);
  });

  it("shows every student of a small roster as a legend chip", () => {
    render(<JournalProgressView courseId={1} />);
    const names: string[] = within(screen.getByRole("list", { name: "Chart series" })).getAllByRole("button").map((button) => button.textContent ?? "");
    for (const pupil of data.students) expect(names.some((name) => name.includes(pupil.first_name))).toBe(true);
  });
});
