import { fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";
import * as courseHooks from "../../lib/courses/hooks";
import type { CourseStaffProgressResponse, StaffProgressPeriodResult } from "../../lib/courses/types";

export const result = (periodId: number, score: number | null, maxScore: number | null, percentage: number | null): StaffProgressPeriodResult => ({
  period_id: periodId,
  grading_state: "missing" as const,
  score,
  max_score: maxScore,
  percentage,
});

const period = (id: number, label: string, start: string, end: string) => ({ id, period_label: label, period_start: start, period_end: end });

export const PERIODS = [
  period(1, "Month 8", "2026-08-01", "2026-08-31"),
  period(2, "Month 9", "2026-09-01", "2026-09-30"),
  period(3, "Month 10", "2026-10-01", "2026-10-31"),
  period(4, "Month 11", "2026-11-01", "2026-11-30"),
];

export const student = (id: number, name: string, results: StaffProgressPeriodResult[]) => ({
  student_id: id,
  first_name: name,
  last_name: "Tester",
  grading_provenance: "unknown" as const,
  period_results: results,
});

export const data: CourseStaffProgressResponse = {
  course_id: 1,
  periods: PERIODS,
  students: [
    student(11, "Anvar", [result(1, 18, 24, 75), result(2, null, null, null), result(3, 25, 24.5, 100), result(4, 0, 24, 0)]),
    student(12, "Bahor", [result(1, 12, 24, 50), result(2, 12, 24, 50), result(3, 12, 24, 50), result(4, 0, 24, 0)]),
    student(13, "Cyrus", [result(1, 0, 24, 0), result(2, 6, 24, 25), result(3, 0, 24, 0), result(4, 0, 24, 0)]),
  ],
};

export const manyStudents: CourseStaffProgressResponse = {
  ...data,
  students: Array.from({ length: 8 }, (_, index) =>
    student(100 + index, `Pupil${index}`, [result(1, index, 24, index * 10), result(2, index, 24, index * 10 + 5), result(3, index, 24, index * 10), result(4, 0, 24, 0)]),
  ),
};

export function mockProgress(response: CourseStaffProgressResponse): void {
  vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
    data: response,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);
}

export function mockClassProgress(response: CourseStaffProgressResponse): void {
  vi.mocked(courseHooks.useCourseClassProgress).mockReturnValue({
    data: response,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof courseHooks.useCourseClassProgress>);
}

export function chart(): SVGElement {
  return screen.getByTestId("progress-chart").querySelector("svg") as SVGElement;
}

export function visibleSeries(): HTMLElement[] {
  return screen.getAllByTestId("chart-series-student").filter((node) => node.getAttribute("data-visible") === "true");
}

export function pressKey(key: string): void {
  fireEvent.keyDown(chart(), { key });
}

export function tooltipNames(): string[] {
  return screen.getAllByTestId("chart-tooltip-entry").map((entry) => entry.querySelector("span.truncate")?.textContent ?? "");
}

export function tooltipLabels(): string[] {
  return screen.getAllByTestId("chart-tooltip-entry").map((entry) => entry.lastElementChild?.textContent ?? "");
}
