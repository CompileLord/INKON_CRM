import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent, within } from "@testing-library/react";
import { type Location } from "react-router-dom";
import * as courseHooks from "../lib/courses/hooks";
import type { CourseListItemResponse, PaginatedCourses } from "../lib/courses/types";
import type { Paginated } from "../lib/pagination";
import { configureCoursesMocks, mockInitialErrorResult, mockInitialLoadingResult, mockPlaceholderTransitionResult, mockStaleErrorResult, mockSuccessResult, renderCoursesPage, sampleCourses } from "./CoursesTestSupport";

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

  describe("Four states & retry handling", () => {
    it("renders loading skeleton with BrandActivityIndicator on initial fetch", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(mockInitialLoadingResult());

      renderCoursesPage();

      expect(screen.getByTestId("brand-activity-indicator")).toBeTruthy();
      expect(screen.getByText("Loading courses...")).toBeTruthy();
    });

    it("displays updating activity indicator on background refetch without blowing away loaded items", () => {
      const staleData: Paginated<CourseListItemResponse> = {
        items: [sampleCourses[0]],
        total: 1,
        page: 1,
        page_size: 12,
        total_pages: 1,
      };
      const result = mockSuccessResult(staleData);
      result.isFetching = true;
      vi.mocked(courseHooks.useCourses).mockReturnValue(result);

      renderCoursesPage();

      expect(screen.getByText("Python Fundamentals")).toBeTruthy();
      expect(screen.getByText("Updating…")).toBeTruthy();
    });

    it("renders loading skeleton while query is transitioning with isPlaceholderData", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockPlaceholderTransitionResult<Paginated<CourseListItemResponse>>({
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
      expect(screen.getByText("Loading courses...")).toBeTruthy();
    });

    it("preserves ordering helper allocation and role-specific geometry during loading", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(mockInitialLoadingResult());

      const { unmount } = renderCoursesPage({
        initialUrl: "/courses?sort=price&q=Python",
        role: "superadmin",
      });

      expect(screen.queryByText(/Current page order/)).toBeNull();
      expect(screen.queryByText(/Found on this page/i)).toBeNull();
      unmount();

      renderCoursesPage({
        initialUrl: "/courses?sort=newest",
        role: "mentor",
      });

      expect(screen.queryByText(/Current page order/)).toBeNull();
    });

    it("renders initial error state with functional Retry button", () => {
      const refetchFn = vi.fn();
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockInitialErrorResult<PaginatedCourses>(refetchFn),
      );

      renderCoursesPage();

      expect(screen.getByText("Failed to load course")).toBeTruthy();

      const retryButton = screen.getByRole("button", { name: "Retry" });
      fireEvent.click(retryButton);

      expect(refetchFn).toHaveBeenCalledTimes(1);
    });

    it("retains loaded cards and shows retry notice on background refetch failure", () => {
      const refetchFn = vi.fn();
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockStaleErrorResult<PaginatedCourses>(
          {
            items: [sampleCourses[0]],
            total: 1,
            page: 1,
            page_size: 12,
            total_pages: 1,
          },
          refetchFn,
        ),
      );

      renderCoursesPage();

      expect(screen.getByText("Python Fundamentals")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toContain("Failed to update courses");

      const retryBtn = within(screen.getByRole("alert")).getByRole("button", {
        name: "Retry",
      });
      fireEvent.click(retryBtn);
      expect(refetchFn).toHaveBeenCalledTimes(1);
    });

    it("displays genuine empty catalog state with role-specific guidance", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [],
          total: 0,
          page: 1,
          page_size: 12,
          total_pages: 0,
        }),
      );

      const { unmount } = renderCoursesPage({ role: "superadmin" });
      expect(screen.getByText("No courses in the catalog yet")).toBeTruthy();
      expect(screen.getAllByRole("button", { name: "Create Course" }).length).toBe(2);
      unmount();

      renderCoursesPage({ role: "mentor" });
      expect(screen.getByText("No courses assigned")).toBeTruthy();
      expect(
        screen.getByText(
          "You don't have any assigned courses yet. Contact an administrator for assignments.",
        ),
      ).toBeTruthy();
    });
  });

  describe("Phone responsive presentation and toolbar pickers", () => {
    it("renders list rows without a view switch on phone and applies the sort picker to the URL", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [sampleCourses[0], sampleCourses[1]],
          total: 2,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      let currentLocation: Location | undefined;
      const { container } = renderCoursesPage({
        isTablet: false,
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      expect(screen.queryByRole("radiogroup", { name: "View" })).toBeNull();
      expect(container.querySelectorAll("[data-course-card]")).toHaveLength(0);
      expect(container.querySelectorAll("[data-list-row]")).toHaveLength(2);
      expect(screen.queryByRole("dialog")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
      fireEvent.click(screen.getByRole("option", { name: "By price" }));

      expect(currentLocation?.search).toContain("sort=price");
    });

    it("displays explicit active sort status on current page for custom sort, default sort, and alongside search", () => {
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
        initialUrl: "/courses?sort=price",
      });

      expect(screen.queryByRole("status")).toBeNull();
      unmount();

      const { unmount: unmountDefault } = renderCoursesPage({
        initialUrl: "/courses",
      });
      expect(screen.queryByRole("status")).toBeNull();
      unmountDefault();

      renderCoursesPage({
        initialUrl: "/courses?q=Python",
      });
      expect(screen.getByRole("status").textContent).toContain("Found on this page: 1 of 3");
    });

    it("keeps the whole phone row a single wrapping link to the course", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      const { container } = renderCoursesPage({ isTablet: false });
      const rowLink = container.querySelector("[data-list-row] a") as HTMLAnchorElement;
      expect(rowLink.getAttribute("href")).toBe("/courses/1");
      expect(rowLink.textContent).toContain("Python Fundamentals");
      expect(rowLink.className).toContain("min-w-0");
      expect(screen.getByText("Python Fundamentals").className).toContain("break-words");
    });

    it("renders each desktop list entry as one row link with a title, mentor and price", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      const { container } = renderCoursesPage({
        initialUrl: "/courses?view=list",
        isTablet: true,
      });

      expect(container.querySelectorAll("[data-list-row]")).toHaveLength(3);
      const titleLink = screen.getByRole("link", { name: /Python Fundamentals/ });
      expect(titleLink.getAttribute("href")).toBe("/courses/1");
      expect(titleLink.className).not.toContain("transform");
    });

    it("overrides stored list preference when explicit view=grid is present in URL", () => {
      localStorage.setItem("kitob_courses_view_preference", "list");

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
        initialUrl: "/courses?view=grid",
        isTablet: true,
      });

      const gridToggle = screen.getByRole("radio", { name: "Grid" });
      expect(gridToggle.getAttribute("aria-checked")).toBe("true");

      localStorage.removeItem("kitob_courses_view_preference");
    });

    it("changes the status filter from the phone toolbar through the shared picker", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        isTablet: false,
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });
      fireEvent.click(screen.getByRole("button", { name: /Status/ }));
      fireEvent.click(screen.getByRole("option", { name: "Archive" }));
      expect(currentLocation?.search).toContain("status=archived");
    });
  });
});
