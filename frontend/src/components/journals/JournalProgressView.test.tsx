import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "../../i18n";
import { JournalProgressView } from "./JournalProgressView";
import * as courseHooks from "../../lib/courses/hooks";
import { data, manyStudents, mockClassProgress, mockProgress, visibleSeries } from "./JournalProgressTestSupport";

vi.mock("../../lib/courses/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/courses/hooks")>();
  return { ...actual, useCourseStaffProgress: vi.fn(), useCourseClassProgress: vi.fn(() => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() })) };
});

vi.mock("../../i18n/formatters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/formatters")>();
  return { ...actual, getSchoolCalendarDate: () => "2026-10-15" };
});

beforeEach(async () => {
  window.localStorage.clear();
  await i18n.changeLanguage("en");
  mockProgress(data);
});

afterEach(cleanup);

describe("Progress view as a read-only student", () => {
  it("shows only the student's own line, never a classmate's name, line or legend chip", () => {
    mockClassProgress(data);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={12} />);
    expect(visibleSeries()).toHaveLength(1);
    expect(screen.getAllByTestId("chart-series-student")).toHaveLength(1);
    expect(screen.getAllByTestId("chart-series-student")[0].getAttribute("data-student-id")).toBe("12");
    const text: string = document.body.textContent ?? "";
    expect(text).toContain("Bahor Tester");
    expect(text).not.toContain("Anvar");
    expect(text).not.toContain("Cyrus");
    expect(screen.queryByTestId("legend-more")).toBeNull();
  });

  it("keeps the class average computed from every classmate as an aggregate and labels the own chip", () => {
    mockClassProgress(data);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={12} />);
    const average = screen.getByTestId("chart-series-average");
    expect(average.getAttribute("data-visible")).toBe("true");
    const legend = within(screen.getByTestId("progress-legend"));
    expect(legend.getByRole("button", { name: "Class average" })).toBeDefined();
    expect(legend.getByRole("button", { name: /Bahor Tester/ }).textContent).toContain("You");
  });

  it("selects the own line even when the roster is large and renders no ranking table", () => {
    mockClassProgress(manyStudents);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={100} />);
    expect(visibleSeries()).toHaveLength(1);
    expect(screen.queryByTestId("progress-table")).toBeNull();
    expect(screen.queryByTestId("student-row")).toBeNull();
    expect(document.body.textContent).not.toContain("Pupil7");
  });

  it("reads the class endpoint, not the staff endpoint", () => {
    mockClassProgress(manyStudents);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={107} />);
    expect(vi.mocked(courseHooks.useCourseClassProgress)).toHaveBeenLastCalledWith(1, true);
    expect(vi.mocked(courseHooks.useCourseStaffProgress)).toHaveBeenLastCalledWith(1, false);
  });

  it("shows a student-phrased load error with a working retry", () => {
    const refetch = vi.fn();
    vi.mocked(courseHooks.useCourseClassProgress).mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch } as unknown as ReturnType<typeof courseHooks.useCourseClassProgress>);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={107} />);
    expect(screen.getByText("Your results are not affected. Try again in a moment.")).toBeTruthy();
    expect(screen.queryByText(/gradebook|unsaved/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("Progress view as staff", () => {
  it("keeps the mentor-phrased load error", () => {
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByText("Your gradebook and unsaved changes are not affected.")).toBeTruthy();
  });

  it("shows a loading skeleton with the same heading while data loads", () => {
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByTestId("journal-progress-skeleton")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Whole course, all periods" })).toBeDefined();
  });

  it("keeps the loaded chart and offers a retry when a refresh fails", () => {
    const refetch = vi.fn();
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({ data, isLoading: false, isError: true, refetch } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByTestId("progress-chart")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("collapses and expands the chart and remembers the collapsed state in localStorage", () => {
    const first = render(<JournalProgressView courseId={1} />);
    const toggle: HTMLElement = screen.getByTestId("progress-collapse-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(screen.queryByTestId("progress-chart")).toBeNull();
    expect(screen.getByTestId("progress-collapse-toggle").getAttribute("aria-expanded")).toBe("false");
    first.unmount();
    render(<JournalProgressView courseId={1} />);
    expect(screen.queryByTestId("progress-chart")).toBeNull();
    fireEvent.click(screen.getByTestId("progress-collapse-toggle"));
    expect(screen.getByTestId("progress-chart")).toBeDefined();
  });
});

describe("student course chart default", (): void => {
  it("opens by default for a student with a graded period", (): void => {
    mockClassProgress(data);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={12} />);
    expect(screen.getByTestId("progress-collapse-toggle").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("progress-chart")).toBeDefined();
  });

  it("shows the empty line when the profile reports no graded period even though zero rows are stored", () => {
    mockClassProgress(data);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={12} gradedPeriodCount={0} />);
    expect(screen.getByTestId("progress-no-graded")).toBeDefined();
    expect(screen.queryByTestId("progress-chart")).toBeNull();
  });

  it("keeps the chart open when the profile reports graded periods", () => {
    mockClassProgress(data);
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={12} gradedPeriodCount={2} />);
    expect(screen.getByTestId("progress-chart")).toBeDefined();
  });

  it("shows a short empty line instead of a collapsed panel when nothing is graded", (): void => {
    mockClassProgress({ ...data, students: data.students.map((student) => ({ ...student, period_results: student.period_results.map((result) => ({ ...result, score: null, max_score: null, percentage: null })) })) });
    render(<JournalProgressView courseId={1} readOnlySelfStudentId={12} />);
    expect(screen.getByTestId("progress-no-graded").textContent).toBe("No graded periods yet");
    expect(screen.queryByTestId("progress-collapse-toggle")).toBeNull();
  });
});
