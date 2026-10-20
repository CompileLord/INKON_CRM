import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { type Location } from "react-router-dom";
import * as courseHooks from "../lib/courses/hooks";
import * as userHooks from "../lib/users/hooks";
import type { CourseListItemResponse } from "../lib/courses/types";
import type { Paginated } from "../lib/pagination";
import { configureCoursesMocks, mockSuccessResult, renderCoursesPage, sampleCourses } from "./CoursesTestSupport";

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

  describe("Role-specific presentation: superadmin vs mentor", () => {
    it("superadmin sees Create course button, bounded mentor lookup, and admin overflow menu", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      expect(screen.getAllByText("Aziz Rahimov").length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByRole("button", { name: "Course actions: Python Fundamentals" }),
      ).toBeTruthy();

      expect(screen.queryByRole("link", { name: /Go to journal/ })).toBeNull();
    });

    it("opens delete confirmation dialog and only executes deleteCourse when confirmed", async () => {
      const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: deleteMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });
      fireEvent.click(actionsBtn);

      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      expect(screen.getByText("Delete course")).toBeTruthy();
      expect(deleteMutateAsync).not.toHaveBeenCalled();

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      expect(deleteMutateAsync).not.toHaveBeenCalled();

      fireEvent.click(actionsBtn);
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(deleteMutateAsync).toHaveBeenCalledWith(1);
      });
      expect(deleteMutateAsync).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Course deleted")).toBeTruthy();
    });

    it("disables cancel button while delete mutation is pending", () => {
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });
      fireEvent.click(actionsBtn);

      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      const cancelBtn = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
      expect(cancelBtn.disabled).toBe(true);
    });

    it("restores focus to surviving search control on successful deletion and to trigger button on cancellation", async () => {
      const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: deleteMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      const searchInput = screen.getByPlaceholderText("Search courses…");
      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });

      fireEvent.click(actionsBtn);
      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      expect(screen.getByRole("dialog")).toBeTruthy();

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(actionsBtn);
      });

      fireEvent.click(actionsBtn);
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(deleteMutateAsync).toHaveBeenCalledWith(1);
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(searchInput);
      });
    });

    it("retains delete confirmation dialog, displays accessible in-dialog alert, and preserves URL when delete mutation fails", async () => {
      const deleteMutateAsync = vi.fn().mockRejectedValue(new Error("Simulated delete failure"));
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: deleteMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        role: "superadmin",
        initialUrl: "/courses?page=1",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });
      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });
      fireEvent.click(actionsBtn);
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(deleteMutateAsync).toHaveBeenCalledWith(1);
      });
      const alert = within(screen.getByRole("dialog")).getByRole("alert");
      expect(alert.textContent).toBe("Failed to delete course");
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(currentLocation?.pathname).toBe("/courses");
      expect(currentLocation?.search).toBe("?page=1");
    });

    it("restores prior history.scrollRestoration policy on unmount", () => {
      history.scrollRestoration = "auto";
      const { unmount } = renderCoursesPage();
      expect(history.scrollRestoration).toBe("manual");
      unmount();
      expect(history.scrollRestoration).toBe("auto");
    });

    it("mentor sees assigned courses, secondary Open journal link, and NO admin controls or mentor fetch", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "mentor" });

      expect(screen.queryByRole("button", { name: "Create Course" })).toBeNull();
      expect(userHooks.useMentors).toHaveBeenCalledWith({ page_size: 100 }, false);
      expect(screen.queryByRole("button", { name: /Course actions/ })).toBeNull();

      const titleLink = screen.getByRole("link", { name: "Python Fundamentals" });
      expect(titleLink.getAttribute("href")).toBe("/courses/1");

      const journalLink = screen.getByRole("link", {
        name: "Go to journal: Python Fundamentals",
      });
      expect(journalLink.getAttribute("href")).toBe("/journals/1");

      expect(screen.queryByText(/mentors not assigned/i)).toBeNull();
    });
  });

});
