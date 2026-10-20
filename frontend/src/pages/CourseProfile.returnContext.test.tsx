import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import * as courseHooks from "../lib/courses/hooks";
import * as enrollmentHooks from "../lib/enrollments/hooks";
import * as returnContext from "../lib/courses/returnContext";
import { AuthApiError } from "../lib/auth/errors";
import { mockSuccessResult, mockErrorResult, mockCourse, renderCourseProfile, registerCourseProfileHooks } from "./CourseProfileTestSupport";

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
    it("uses safe list return URL for Back button", () => {
      returnContext.recordCourseListNavigation("?sort=price&page=2");

      renderCourseProfile();

      const backLink = screen.getByRole("link", { name: "Back to courses" });
      expect(backLink.getAttribute("href")).toBe("/courses?page=2&sort=price");
      expect(document.querySelectorAll("[data-page-back]")).toHaveLength(1);
    });

    it("outbound Open journal link carries course journal path", () => {
      renderCourseProfile();

      const journalLinks = screen.getAllByRole("link", { name: "Open journal" });
      expect(journalLinks[0].getAttribute("href")).toBe("/journals/42");
    });

    it("records departure return context only on explicit click of journal link", () => {
      renderCourseProfile(["/courses/42?tab=progress&period=5"]);

      expect(returnContext.getSavedCourseDetailContext(42)).toBeNull();

      const journalLink = screen.getByRole("link", { name: "Open journal" });
      fireEvent.click(journalLink);

      const saved = returnContext.getSavedCourseDetailContext(42);
      expect(saved).not.toBeNull();
      expect(saved?.tab).toBe("progress");
      expect(saved?.periodId).toBe(5);
    });

    it("retains progress search when toggling between tabs", () => {
      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(
        mockSuccessResult({
          labels: ["Period 1", "Total"],
          datasets: [
            {
              student_id: 1,
              name: "Alice Wonderland",
              color_hex: "#10b981",
              scores: [85, 85],
              percentages: [85, 85],
            },
          ],
        }),
      );
      vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue(
        mockSuccessResult({
          course_id: 42,
          periods: [
            { id: 1, period_label: "Period 1", period_start: "2026-09-01", period_end: "2026-09-07" },
          ],
          students: [
            {
              student_id: 1,
              first_name: "Alice",
              last_name: "Wonderland",
              period_results: [
                { period_id: 1, grading_state: "unknown", score: 85, max_score: 100, percentage: 85 },
              ],
              grading_provenance: "unknown",
            },
          ],
        }),
      );

      renderCourseProfile(["/courses/42?tab=progress"]);

      const searchInput = screen.getByRole("searchbox");
      fireEvent.change(searchInput, { target: { value: "Alice" } });
      expect(searchInput.getAttribute("value")).toBe("Alice");

      const overviewTab = screen.getByRole("tab", { name: "Overview" });
      fireEvent.click(overviewTab);

      const progressTab = screen.getByRole("tab", { name: "Performance" });
      fireEvent.click(progressTab);

      const restoredInput = screen.getByRole("searchbox");
      expect(restoredInput.getAttribute("value")).toBe("Alice");
    });

    it("renders working Retry button when metrics fail", () => {
      const refetchMetrics = vi.fn();
      vi.mocked(courseHooks.useCourseJournalMetrics).mockReturnValue({
        ...mockErrorResult(new Error("500")),
        refetch: refetchMetrics,
      });

      renderCourseProfile();

      const retryButtons = screen.getAllByRole("button", { name: "Retry" });
      expect(retryButtons.length).toBeGreaterThan(0);
      fireEvent.click(retryButtons[0]);
      expect(refetchMetrics).toHaveBeenCalled();
    });

    it("hides cached course when refetch returns 403 Access Denied", () => {
      vi.mocked(courseHooks.useCourse).mockReturnValue({
        data: mockCourse,
        isLoading: false,
        isError: true,
        error: new AuthApiError(403, "Access denied"),
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourse>);

      renderCourseProfile();

      expect(screen.queryByText("Frontend Development Mastery")).toBeNull();
      expect(screen.getByText("No access")).toBeDefined();
      expect(screen.getByText("You can't view this course.")).toBeDefined();
    });

    it("retains cached course and renders inline error banner with retry on ordinary network error", () => {
      const refetchCourse = vi.fn();
      vi.mocked(courseHooks.useCourse).mockReturnValue({
        data: mockCourse,
        isLoading: false,
        isError: true,
        error: new Error("Network timeout"),
        refetch: refetchCourse,
      } as unknown as ReturnType<typeof courseHooks.useCourse>);

      renderCourseProfile();

      expect(screen.getByText("Frontend Development Mastery")).toBeDefined();
      const retryButtons = screen.getAllByRole("button", { name: "Retry" });
      expect(retryButtons.length).toBeGreaterThan(0);
      fireEvent.click(retryButtons[0]);
      expect(refetchCourse).toHaveBeenCalled();
    });

    it("restores validated return context on explicit internal return signal and ignores it on direct entry", async () => {
      returnContext.recordCourseDetailNavigation(42, {
        tab: "progress",
        periodId: 5,
        search: "Zalina",
        sort: "name_asc",
        view: "table",
        scrollY: 200,
      });

      const { getLocation: getDirectLocation } = renderCourseProfile(["/courses/42"]);
      expect(getDirectLocation().pathname).toBe("/courses/42");
      expect(getDirectLocation().search).toBe("");
      expect(screen.queryByDisplayValue("Zalina")).toBeNull();

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(
        mockSuccessResult({
          labels: ["Period 5", "Total"],
          datasets: [
            {
              student_id: 1,
              name: "Zalina Student",
              color_hex: "#10b981",
              scores: [90, 90],
              percentages: [90, 90],
            },
          ],
        }),
      );
      vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue(
        mockSuccessResult({
          course_id: 42,
          periods: [
            { id: 5, period_label: "Period 5", period_start: "2026-09-01", period_end: "2026-09-07" },
          ],
          students: [
            {
              student_id: 1,
              first_name: "Zalina",
              last_name: "Student",
              period_results: [
                { period_id: 5, grading_state: "unknown", score: 90, max_score: 100, percentage: 90 },
              ],
              grading_provenance: "unknown",
            },
          ],
        }),
      );

      const { getLocation: getReturnLocation } = renderCourseProfile([
        { pathname: "/courses/42", state: { fromInternalReturn: true } },
      ]);

      await waitFor(() => {
        expect(getReturnLocation().search).toContain("tab=progress");
        expect(getReturnLocation().search).toContain("period=5");
        expect(screen.getByDisplayValue("Zalina")).toBeDefined();
      });
    });

    it("restores progress return context with score_asc and normalizes legacy avg_desc to score_desc", async () => {
      returnContext.recordCourseDetailNavigation(42, {
        tab: "progress",
        periodId: 5,
        search: "Alice",
        sort: "score_asc",
        scrollY: 100,
      });

      vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue(
        mockSuccessResult({
          course_id: 42,
          periods: [
            { id: 5, period_label: "Period 5", period_start: "2026-09-01", period_end: "2026-09-07" },
          ],
          students: [
            {
              student_id: 1,
              first_name: "Alice",
              last_name: "Wonderland",
              period_results: [
                { period_id: 5, grading_state: "unknown", score: 90, max_score: 100, percentage: 90 },
              ],
              grading_provenance: "unknown",
            },
          ],
        }),
      );

      renderCourseProfile([
        { pathname: "/courses/42", state: { fromInternalReturn: true } },
      ]);

      await waitFor(() => {
        expect(screen.getByDisplayValue("Alice")).toBeDefined();
        const sortPicker = screen.getByRole("button", { name: i18n.t("courseDetail:progress.sortLabel") });
        expect(sortPicker.textContent).toContain(i18n.t("courseDetail:progress.sort.score_asc"));
      });
    });

    it("restores Students tab return context with page, status, search, sort, and scroll without progress leakage or cross-course carryover", async () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      returnContext.recordCourseDetailNavigation(42, {
        tab: "students",
        rosterPage: 2,
        rosterStatus: "withdrawn",
        search: "Farrukh",
        sort: "name_desc",
        scrollY: 320,
      });

      const { getLocation: getCourse42Location } = renderCourseProfile([
        { pathname: "/courses/42", state: { fromInternalReturn: true } },
      ]);

      await waitFor(() => {
        expect(getCourse42Location().search).toContain("tab=students");
      });

      expect(getCourse42Location().search).not.toContain("period=");

      expect(enrollmentHooks.useCourseRosterPage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          page: 2,
          status: "withdrawn",
          search: "Farrukh",
          sort: "name_desc",
        }),
      );

      await waitFor(() => {
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 320, behavior: "instant" });
      });

      const { getLocation: getCourse99Location } = renderCourseProfile([
        { pathname: "/courses/99", state: { fromInternalReturn: true } },
      ]);

      expect(getCourse99Location().search).not.toContain("tab=students");
      expect(enrollmentHooks.useCourseRosterPage).not.toHaveBeenCalledWith(
        99,
        expect.objectContaining({
          page: 2,
          status: "withdrawn",
          search: "Farrukh",
          sort: "name_desc",
        }),
      );
    });
  });
});
