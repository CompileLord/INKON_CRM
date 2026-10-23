import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { CourseProgressChartPanel } from "./CourseProgressChartPanel";
import { CourseChartFixtures } from "../../lib/courses/CourseChartFixtures";
import { CourseProgressChartQuery } from "../../lib/courses/CourseProgressChartQuery";
import * as endpoints from "../../lib/courses/endpoints";
import type {
  CourseProgressChartOptions,
  CourseProgressChartResponse,
  CourseProgressPeriod,
  StaffCourseProgressChartResponse,
  StudentCourseProgressChartResponse,
} from "../../lib/courses/types";

vi.mock("../../lib/courses/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/courses/endpoints")>();
  return { ...actual, getCourseProgressChart: vi.fn() };
});

const PERIOD_TOTAL: number = 30;

function periodsFor(offset: number, limit: number): CourseProgressPeriod[] {
  const newestIndex: number = PERIOD_TOTAL - offset;
  const oldestIndex: number = Math.max(1, newestIndex - limit + 1);
  const periods: CourseProgressPeriod[] = [];
  for (let index: number = oldestIndex; index <= newestIndex; index += 1) periods.push({ id: index, period_label: `Month ${index}` });
  return periods;
}

function staffChart(options: CourseProgressChartOptions, studentsTotal: number): StaffCourseProgressChartResponse {
  const periods: CourseProgressPeriod[] = periodsFor(options.periodOffset ?? 0, options.periodLimit ?? 12);
  const values: (number | null)[] = [...periods.map(() => 70), 70];
  return {
    ...CourseChartFixtures.staffMetadata(PERIOD_TOTAL, studentsTotal, options.periodOffset ?? 0, options.studentOffset ?? 0),
    labels: [...periods.map((period: CourseProgressPeriod) => period.period_label), "Average"],
    periods,
    datasets: [{ student_id: 1, name: "Alice Smith", color_hex: "#000000", scores: values, max_scores: values, percentages: values, grading_states: periods.map(() => "graded" as const), graded_periods_count: periods.length, eligible_periods_count: periods.length }],
    class_avg_series: values,
    class_eligible_counts: periods.map(() => 1),
  };
}

function studentChart(options: CourseProgressChartOptions): StudentCourseProgressChartResponse {
  const periods: CourseProgressPeriod[] = periodsFor(options.periodOffset ?? 0, options.periodLimit ?? 12);
  const values: (number | null)[] = [...periods.map(() => 80), 78];
  return {
    ...CourseChartFixtures.studentMetadata(PERIOD_TOTAL, options.periodOffset ?? 0),
    periods,
    my_series: values,
    class_avg_series: values,
    my_grading_states: periods.map(() => "graded" as const),
    my_graded_periods_count: periods.length,
    my_eligible_periods_count: periods.length,
    class_eligible_counts: periods.map(() => 4),
    my_rank: 2,
    class_size: 4,
  };
}

function renderPanel() {
  const client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <CourseProgressChartPanel courseId={7} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

function lastOptions(): CourseProgressChartOptions {
  const calls = vi.mocked(endpoints.getCourseProgressChart).mock.calls;
  return calls[calls.length - 1][1] as CourseProgressChartOptions;
}

describe("CourseProgressChartQuery", () => {
  it("includes all four resolved options in the query key", () => {
    expect(CourseProgressChartQuery.key(7)).toEqual(["courses", "progress-chart", 7, 0, 12, 0, 30]);
    expect(CourseProgressChartQuery.key(7, { periodOffset: 12, studentOffset: 30 })).toEqual(["courses", "progress-chart", 7, 12, 12, 30, 30]);
    expect(CourseProgressChartQuery.key(7, { periodLimit: 6, studentLimit: 10 })).not.toEqual(CourseProgressChartQuery.key(7));
  });
});

describe("CourseProgressChartPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    cleanup();
    vi.mocked(endpoints.getCourseProgressChart).mockReset();
  });

  it("steps through periods and disables the arrows at both ends", async () => {
    vi.mocked(endpoints.getCourseProgressChart).mockImplementation(async (_id: number, options?: CourseProgressChartOptions): Promise<CourseProgressChartResponse> => staffChart(options ?? {}, 5));
    renderPanel();

    const older: HTMLButtonElement = await screen.findByRole("button", { name: "Older periods" });
    const newer: HTMLButtonElement = screen.getByRole("button", { name: "Newer periods" });
    expect(older.disabled).toBe(false);
    expect(newer.disabled).toBe(true);
    expect(screen.getByText("Month 19 – Month 30")).toBeDefined();
    expect(lastOptions().periodOffset).toBe(0);

    fireEvent.click(older);
    await waitFor(() => expect(lastOptions().periodOffset).toBe(12));
    await waitFor(() => expect((screen.getByRole("button", { name: "Newer periods" }) as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: "Older periods" }));
    await waitFor(() => expect(lastOptions().periodOffset).toBe(24));
    await waitFor(() => expect((screen.getByRole("button", { name: "Older periods" }) as HTMLButtonElement).disabled).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Newer periods" }));
    await waitFor(() => expect(lastOptions().periodOffset).toBe(12));
  });

  it("hides the student pager when the roster fits one page", async () => {
    vi.mocked(endpoints.getCourseProgressChart).mockImplementation(async (_id: number, options?: CourseProgressChartOptions): Promise<CourseProgressChartResponse> => staffChart(options ?? {}, 30));
    renderPanel();
    await screen.findByRole("button", { name: "Older periods" });
    expect(screen.queryByTestId("course-chart-student-pager")).toBeNull();
  });

  it("pages student series when the roster has more than one page", async () => {
    vi.mocked(endpoints.getCourseProgressChart).mockImplementation(async (_id: number, options?: CourseProgressChartOptions): Promise<CourseProgressChartResponse> => staffChart(options ?? {}, 45));
    renderPanel();

    const next: HTMLButtonElement = await screen.findByRole("button", { name: "Next students" });
    expect((screen.getByRole("button", { name: "Previous students" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(next);
    await waitFor(() => expect(lastOptions().studentOffset).toBe(30));
    await waitFor(() => expect((screen.getByRole("button", { name: "Next students" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Previous students" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the student rank and range average with the scope tooltip and no student pager", async () => {
    vi.mocked(endpoints.getCourseProgressChart).mockImplementation(async (_id: number, options?: CourseProgressChartOptions): Promise<CourseProgressChartResponse> => studentChart(options ?? {}));
    renderPanel();

    expect(await screen.findByText(/Rank 2 of 4 · Average 78%/)).toBeDefined();
    expect(screen.queryByTestId("course-chart-student-pager")).toBeNull();
    expect(screen.getByTestId("course-chart-period-pager")).toBeDefined();
  });

  it("shows an error with a working retry", async () => {
    vi.mocked(endpoints.getCourseProgressChart).mockRejectedValueOnce(new Error("boom")).mockImplementation(async (_id: number, options?: CourseProgressChartOptions): Promise<CourseProgressChartResponse> => studentChart(options ?? {}));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: i18n.t("ui:retry") }));
    expect(await screen.findByText(/Rank 2 of 4/)).toBeDefined();
  });
});
