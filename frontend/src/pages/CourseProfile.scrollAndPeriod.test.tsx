import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../i18n";
import { CourseProfile } from "./CourseProfile";
import * as courseHooks from "../lib/courses/hooks";
import * as returnContext from "../lib/courses/returnContext";
import type { CourseProgressChartResponse } from "../lib/courses/types";
import { mockSuccessResult, mockJournals, renderCourseProfile, registerCourseProfileHooks } from "./CourseProfileTestSupport";
import { CourseChartFixtures } from "../lib/courses/CourseChartFixtures";

vi.mock("../lib/courses/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/hooks")>();
  return {
    ...actual,
    useCourse: vi.fn(),
    useCourseSchedule: vi.fn(),
    useCourseJournalMetrics: vi.fn(),
    useCourseMentorHistory: vi.fn(),
    useCourseProgressChart: vi.fn(),
    useCourseStaffProgress: vi.fn(),
    useCopyCourse: vi.fn(),
    useDeleteCourse: vi.fn(),
    useCourseJournals: vi.fn(),
  };
});
vi.mock("../lib/courses/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/endpoints")>();
  return {
    ...actual,
    getCourseSchedule: vi.fn(),
  };
});
vi.mock("../lib/enrollments/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/enrollments/hooks")>();
  return {
    ...actual,
    useCourseEnrollmentsCount: vi.fn(),
    useCourseRoster: vi.fn(),
    useCourseRosterPage: vi.fn(),
  };
});
vi.mock("../lib/users/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/users/hooks")>();
  return {
    ...actual,
    useMentorProfile: vi.fn(),
  };
});

registerCourseProfileHooks();

describe("CourseProfile Component", () => {
  describe("Safe Back and Outbound Journal Context", () => {
    it("restores saved nonzero scroll position after course data is loaded", async () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      returnContext.recordCourseDetailNavigation(42, {
        tab: "overview",
        scrollY: 450,
      });

      renderCourseProfile([
        { pathname: "/courses/42", state: { fromInternalReturn: true } },
      ]);

      await waitFor(() => {
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 450, behavior: "instant" });
      });
    });

    it("cleans up invalid period query param when journals list is empty", async () => {
      vi.mocked(courseHooks.useCourseJournals).mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseJournals>);

      const { getLocation } = renderCourseProfile(["/courses/42?tab=progress&period=999"]);

      await waitFor(() => {
        expect(getLocation().search).toBe("?tab=progress");
      });
    });

    it("cleans up negative or non-integer period query param", async () => {
      vi.mocked(courseHooks.useCourseJournals).mockReturnValue({
        data: mockJournals,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseJournals>);

      const { getLocation } = renderCourseProfile(["/courses/42?tab=progress&period=-12"]);

      await waitFor(() => {
        expect(getLocation().search).toBe("?tab=progress");
      });
    });

    it("retains valid period param on journals query failure and does not strip it as if empty", async () => {
      vi.mocked(courseHooks.useCourseJournals).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("500 internal server error"),
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseJournals>);

      const { getLocation } = renderCourseProfile(["/courses/42?tab=progress&period=5"]);

      await waitFor(() => {
        expect(getLocation().search).toBe("?tab=progress&period=5");
      });
    });

    it("displays local translated 44px retry on journals query failure while preserving identity, loaded progress, and selected period", async () => {
      const mockRefetchJournals = vi.fn().mockResolvedValue({});
      vi.mocked(courseHooks.useCourseJournals).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("500 internal server error"),
        refetch: mockRefetchJournals,
      } as unknown as ReturnType<typeof courseHooks.useCourseJournals>);

      const mockChartData: CourseProgressChartResponse = {
        ...CourseChartFixtures.staffMetadata(2, 1),
        labels: ["Week 1", "Week 2"],
        periods: [{ id: 5, period_label: "Week 1" }, { id: 6, period_label: "Week 2" }],
        datasets: [
          {
            student_id: 1,
            name: "Alice Smith",
            color_hex: "#6366f1",
            scores: [85, 90],
            max_scores: [100, 100],
            percentages: [85, 90],
            grading_states: ["graded", "graded"],
            graded_periods_count: 2,
            eligible_periods_count: 2,
          },
        ],
        class_avg_series: [85, 90],
        class_eligible_counts: [1, 1],
      };
      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(mockSuccessResult(mockChartData));
      vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue(
        mockSuccessResult({
          course_id: 42,
          periods: [
            { id: 5, period_label: "Week 1", period_start: "2026-01-01", period_end: "2026-01-07" },
          ],
          students: [
            {
              student_id: 1,
              first_name: "Alice",
              last_name: "Smith",
              period_results: [
                { period_id: 5, grading_state: "unknown", score: 85, max_score: 100, percentage: 85 },
              ],
              grading_provenance: "unknown",
            },
          ],
        }),
      );

      const { getLocation } = renderCourseProfile(["/courses/42?tab=progress&period=5"]);

      await waitFor(() => {
        expect(getLocation().search).toBe("?tab=progress&period=5");
      });

      expect(screen.getAllByText("Frontend Development Mastery").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Alice Smith").length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText(i18n.t("courseDetail:progress.searchPlaceholder"))).toBeDefined();

      expect(screen.getByText(i18n.t("courseDetail:journalsLoadError"))).toBeDefined();

      const retryButtons = screen.getAllByRole("button", { name: i18n.t("common:retry") });
      const metadataRetryBtn = retryButtons[0];
      expect(metadataRetryBtn.className).toContain("min-h-[44px]");
      expect(metadataRetryBtn.className).toContain("min-w-[44px]");

      fireEvent.click(metadataRetryBtn);
      expect(mockRefetchJournals).toHaveBeenCalledTimes(1);
    });

    it("cancels pending scroll restoration on user wheel interaction", async () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      returnContext.recordCourseDetailNavigation(42, {
        tab: "progress",
        scrollY: 450,
      });

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseProgressChart>);
      vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

      renderCourseProfile([
        { pathname: "/courses/42", state: { fromInternalReturn: true } },
      ]);

      window.dispatchEvent(new Event("wheel"));

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(
        mockSuccessResult({ ...CourseChartFixtures.staffMetadata(1, 0), labels: ["Week 1"], periods: [{ id: 5, period_label: "Week 1" }], datasets: [], class_avg_series: [null], class_eligible_counts: [0] }),
      );
      vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue(
        mockSuccessResult({ course_id: 42, periods: [], students: [] }),
      );

      await waitFor(() => {
        expect(scrollToSpy).not.toHaveBeenCalled();
      });
    });

    it("cancels pending scroll restoration on user keyboard interaction", async () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      returnContext.recordCourseDetailNavigation(42, {
        tab: "progress",
        scrollY: 450,
      });

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseProgressChart>);
      vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

      renderCourseProfile([
        { pathname: "/courses/42", state: { fromInternalReturn: true } },
      ]);

      window.dispatchEvent(new Event("keydown"));

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(
        mockSuccessResult({ ...CourseChartFixtures.staffMetadata(1, 0), labels: ["Week 1"], periods: [{ id: 5, period_label: "Week 1" }], datasets: [], class_avg_series: [null], class_eligible_counts: [0] }),
      );
      vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue(
        mockSuccessResult({ course_id: 42, periods: [], students: [] }),
      );

      await waitFor(() => {
        expect(scrollToSpy).not.toHaveBeenCalled();
      });
    });

    it("preserves pending scroll target across StrictMode remount and restores once target pane is ready", async () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      returnContext.recordCourseDetailNavigation(42, {
        tab: "progress",
        scrollY: 280,
      });

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(
        mockSuccessResult({ ...CourseChartFixtures.staffMetadata(1, 0), labels: ["Week 1"], periods: [{ id: 5, period_label: "Week 1" }], datasets: [], class_avg_series: [null], class_eligible_counts: [0] }),
      );
      vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue(
        mockSuccessResult({ course_id: 42, periods: [], students: [] }),
      );

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
        },
      });

      render(
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            <I18nextProvider i18n={i18n}>
              <MemoryRouter initialEntries={[{ pathname: "/courses/42", state: { fromInternalReturn: true } }] as unknown as string[]}>
                <Routes>
                  <Route path="/courses/:id" element={<CourseProfile />} />
                </Routes>
              </MemoryRouter>
            </I18nextProvider>
          </QueryClientProvider>
        </StrictMode>,
      );

      await waitFor(() => {
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 280, behavior: "instant" });
      });
    });
  });
});
