import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { type Location } from "react-router-dom";
import * as courseHooks from "../lib/courses/hooks";
import * as courseEndpoints from "../lib/courses/endpoints";
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

  describe("Course duplication", () => {
    it("opens duplicate confirmation, fetches real schedule, and creates copy with copy suffix", async () => {
      sessionStorage.removeItem("kitob_course_list_last_url");
      const targetCourse: CourseListItemResponse = {
        ...sampleCourses[0],
        title: "Schedule precision audit",
      };
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 99 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: [targetCourse],
          total: 1,
          page: 2,
          page_size: 12,
          total_pages: 2,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        role: "superadmin",
        initialUrl: "/courses?page=2&q=Schedule%20precision%20audit",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Schedule precision audit",
      });
      fireEvent.click(actionsBtn);

      const dupMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(dupMenuItem);

      expect(screen.getByText("Duplicate course")).toBeTruthy();
      expect(copyMutateAsync).not.toHaveBeenCalled();

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      expect(copyMutateAsync).not.toHaveBeenCalled();

      fireEvent.click(actionsBtn);
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      expect(confirmBtn.className).toContain("bg-maroon");
      expect(confirmBtn.className).not.toContain("bg-destructive");
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(courseEndpoints.getCourseSchedule).toHaveBeenCalledWith(1);
      });
      await waitFor(() => {
        expect(copyMutateAsync).toHaveBeenCalledWith({
          id: 1,
          payload: expect.objectContaining({
            title: "Schedule precision audit (copy)",
          }),
        });
      });
      expect(screen.getByText("Course copied")).toBeTruthy();
      expect(currentLocation?.pathname).toBe("/courses/99");
      expect(sessionStorage.getItem("kitob_course_list_last_url")).toBe(
        "/courses?page=2&q=Schedule+precision+audit",
      );
    });

    it("aborts duplicate with distinct missing-schedule guidance inside dialog and zero POST", async () => {
      sessionStorage.removeItem("kitob_course_list_last_url");
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce([]);
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 99 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

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

      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => {
        expect(courseEndpoints.getCourseSchedule).toHaveBeenCalledWith(1);
      });
      expect(copyMutateAsync).not.toHaveBeenCalled();
      const alert = within(screen.getByRole("dialog")).getByRole("alert");
      expect(alert.textContent).toBe(
        "Course has no schedule and cannot be copied. Cancel and choose a course with a schedule.",
      );
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(sessionStorage.getItem("kitob_course_list_last_url")).toBeNull();
    });

    it("retains duplicate dialog with accessible error and performs zero POST when schedule lookup fails", async () => {
      sessionStorage.removeItem("kitob_course_list_last_url");
      vi.mocked(courseEndpoints.getCourseSchedule).mockRejectedValueOnce(
        new Error("SIMULATION: schedule temporarily unavailable"),
      );
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 99 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

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

      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => {
        expect(courseEndpoints.getCourseSchedule).toHaveBeenCalledWith(1);
      });
      expect(copyMutateAsync).not.toHaveBeenCalled();
      const alert = within(screen.getByRole("dialog")).getByRole("alert");
      expect(alert.textContent).toBe("Failed to copy course");
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(sessionStorage.getItem("kitob_course_list_last_url")).toBeNull();

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(actionsBtn);
      });
    });

    it("clears stale error on new duplicate attempt or target switch", async () => {
      vi.mocked(courseEndpoints.getCourseSchedule).mockRejectedValueOnce(
        new Error("Initial schedule lookup failure"),
      );
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 99 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseListItemResponse>>({
          items: sampleCourses,
          total: 3,
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
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => {
        expect(courseEndpoints.getCourseSchedule).toHaveBeenCalledWith(1);
      });
      expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toBe(
        "Failed to copy course",
      );

      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce([
        {
          id: 1,
          course_id: 1,
          day_of_week: 1,
          time_start: "10:00:00",
          time_end: "11:30:00",
        },
      ]);
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => {
        expect(copyMutateAsync).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it("preserves exact schedule seconds and multiple weekdays in duplicate payload", async () => {
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce([
        {
          id: 101,
          course_id: 1,
          day_of_week: 1,
          time_start: "10:00:15",
          time_end: "11:30:45",
        },
        {
          id: 102,
          course_id: 1,
          day_of_week: 3,
          time_start: "14:15:30",
          time_end: "15:45:50",
        },
      ]);
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 88 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

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
      fireEvent.click(screen.getByRole("button", { name: "Course actions: Python Fundamentals" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => {
        expect(copyMutateAsync).toHaveBeenCalledWith({
          id: 1,
          payload: {
            title: "Python Fundamentals (copy)",
            description: "Intro to Python programming",
            start_date: "2026-01-10",
            end_date: "2026-12-31",
            exam_type: "monthly",
            price: "1200.00",
            mentor_id: 10,
            schedules: [
              { day_of_week: 1, time_start: "10:00:15", time_end: "11:30:45" },
              { day_of_week: 3, time_start: "14:15:30", time_end: "15:45:50" },
            ],
          },
        });
      });
    });

    it("renders duplicate confirmation with primary variant and restores trigger focus on cancellation", async () => {
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 99 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

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
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      expect(confirmBtn.className).toContain("bg-maroon");
      expect(confirmBtn.className).not.toContain("bg-destructive");

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(actionsBtn);
      });
    });
  });
});
