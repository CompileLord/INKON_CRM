import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import { type Location } from "react-router-dom";
import * as courseHooks from "../lib/courses/hooks";
import type { CourseListItemResponse } from "../lib/courses/types";
import type { Paginated } from "../lib/pagination";
import { configureCoursesMocks, mockPlaceholderTransitionResult, mockSuccessResult, renderCoursesPage, sampleCourses } from "./CoursesTestSupport";

vi.mock("../lib/courses/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/hooks")>();
  return {
    ...actual,
    useCourses: vi.fn(),
    useDeleteCourse: vi.fn(),
    useCopyCourse: vi.fn(),
  };
});

vi.mock("../lib/courses/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/endpoints")>();
  return {
    ...actual,
    getCourseSchedule: vi.fn(),
  };
});

vi.mock("../lib/users/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/users/hooks")>();
  return {
    ...actual,
    useMentors: vi.fn(),
  };
});

describe("Courses page directory", () => {
  beforeEach(() => {
    configureCoursesMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("schedule and student count on course entries", () => {
    it("shows schedule days with time range, student count and no sort echo line in grid and list views", () => {
      const scheduled: CourseListItemResponse = {
        ...sampleCourses[0],
        schedules: [0, 2, 4].map((day) => ({ id: day + 1, course_id: 1, day_of_week: day, time_start: "14:00:00", time_end: "15:30:00" })),
        active_student_count: 8,
      };
      const unscheduled: CourseListItemResponse = { ...sampleCourses[1], schedules: [], active_student_count: 1 };
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [scheduled, unscheduled],
          total: 2,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      for (const view of ["grid", "list"]) {
        const { unmount } = renderCoursesPage({ initialUrl: `/courses?view=${view}` });
        expect(screen.getByText("Mon, Wed, Fri · 14:00–15:30")).toBeTruthy();
        expect(screen.getByText("No schedule")).toBeTruthy();
        expect(screen.getByText("8 students")).toBeTruthy();
        expect(screen.getByText("1 student")).toBeTruthy();
        expect(screen.queryByText(/Current page order/)).toBeNull();
        unmount();
      }
    });
  });

  describe("URL parameter ownership & defaults", () => {
    it("defaults to status=all, page=1, empty search, newest sort, and grid desktop view", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses",
      });

      expect(courseHooks.useCourses).toHaveBeenCalledWith({
        status: undefined,
        page: 1,
        page_size: 12,
      });

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent).toContain("Courses & Groups");
      expect(screen.getByText("(3)").className).toContain("tabular-nums");
      expect(screen.queryByText(/Course catalog/)).toBeNull();
    });

    it("gracefully falls back on invalid URL params", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses?status=invalid_status&page=-5&sort=fake_sort&view=unknown_view",
      });

      expect(courseHooks.useCourses).toHaveBeenCalledWith({
        status: undefined,
        page: 1,
        page_size: 12,
      });
    });

    it("falls back to page 1 when encountering malformed page parameter like 2abc or 2.5", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      const { unmount } = renderCoursesPage({
        initialUrl: "/courses?page=2abc",
      });

      expect(courseHooks.useCourses).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 }),
      );
      unmount();

      renderCoursesPage({
        initialUrl: "/courses?page=2.5",
      });

      expect(courseHooks.useCourses).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 }),
      );
    });

    it("resets page to 1 when server status filter changes", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 2,
          page_size: 12,
          total_pages: 2,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        initialUrl: "/courses?status=all&page=2",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      fireEvent.click(screen.getByRole("button", { name: /Status/ }));
      fireEvent.click(screen.getByRole("option", { name: "Active" }));

      expect(currentLocation?.search).toContain("status=active");
      expect(currentLocation?.search).not.toContain("page=2");
    });

    it("preserves server page ownership when typing local search query", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: sampleCourses,
          total: 24,
          page: 2,
          page_size: 12,
          total_pages: 2,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        initialUrl: "/courses?page=2",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      const searchInput = screen.getByPlaceholderText("Search course by title...");
      fireEvent.change(searchInput, { target: { value: "Python" } });

      expect(currentLocation?.search).toContain("page=2");
      expect(currentLocation?.search).toContain("q=Python");
    });
  });

  describe("Ownership transitions with placeholder data", () => {
    it("renders loading skeleton instead of mislabeling old data when isPlaceholderData is true", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockPlaceholderTransitionResult({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses?page=2",
      });

      expect(screen.getByTestId("brand-activity-indicator")).toBeTruthy();
      expect(screen.queryByText("Python Fundamentals")).toBeNull();
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent).not.toContain("(1)");
    });
  });

  describe("Scope honesty & current page pagination", () => {
    it("displays honest current page match count and retains pagination when search has 0 matches", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: sampleCourses,
          total: 24,
          page: 2,
          page_size: 12,
          total_pages: 2,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses?page=2&q=NothingMatchesHere",
      });

      expect(screen.getByText("No matches on this page")).toBeTruthy();
      expect(
        screen.getByText(
          'No courses on the current page match "NothingMatchesHere". Try a different search or check other pages.',
        ),
      ).toBeTruthy();

      expect(screen.getByRole("button", { name: /Previous/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Next/i })).toBeTruthy();
    });

    it("handles out of range page gracefully by offering return to page 1 while retaining pagination", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [],
          total: 12,
          page: 5,
          page_size: 12,
          total_pages: 1,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        initialUrl: "/courses?page=5",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      expect(screen.getByText("No matches on this page")).toBeTruthy();
      const backButton = screen.getByRole("button", { name: "Back" });
      fireEvent.click(backButton);
      expect(currentLocation?.search).not.toContain("page=5");
    });

    it("allows resetting search while keeping server page", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: sampleCourses,
          total: 24,
          page: 2,
          page_size: 12,
          total_pages: 2,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        initialUrl: "/courses?page=2&q=Nothing",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      const clearSearchBtns = screen.getAllByRole("button", { name: "Clear search" });
      fireEvent.click(clearSearchBtns[0]);

      expect(currentLocation?.search).not.toContain("q=");
      expect(currentLocation?.search).toContain("page=2");
    });
  });

  describe("Sorting & Decimal precision", () => {
    it("sorts by price using arbitrary-precision decimal strings without float corruption", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [
            sampleCourses[2],
            sampleCourses[0],
            sampleCourses[1],
          ],
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses?sort=price",
      });

      const links = screen
        .getAllByRole("link")
        .filter((l) => l.getAttribute("href")?.startsWith("/courses/"));
      const courseTitles = links.map((l) => l.textContent?.trim()).filter(Boolean);

      expect(courseTitles).toEqual([
        "English IELTS Master",
        "Python Fundamentals",
        "Archived Foundation",
      ]);
    });
  });

  describe("Domain correctness & school timezone", () => {
    it("formats course start and end dates with school timezone avoiding negative timezone shifts", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage();

      expect(screen.getByText(/10\.01\.2026/)).toBeTruthy();
      expect(screen.getByText(/31\.12\.2026/)).toBeTruthy();
    });
  });

});
