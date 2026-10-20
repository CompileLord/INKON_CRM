import { describe, expect, it, vi } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import * as courseHooks from "../lib/courses/hooks";
import * as courseEndpoints from "../lib/courses/endpoints";
import type { CourseResponse, CourseScheduleResponse } from "../lib/courses/types";
import { mockCourse, mockSchedules, renderCourseProfile, registerCourseProfileHooks } from "./CourseProfileTestSupport";

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
  describe("Admin Reachable Operations (Duplication and Deletion)", () => {
    it("safely handles duplicate resolution when user navigates away while write is pending", async () => {
      let resolveCopy: (val: CourseResponse) => void = () => {};
      const pendingPromise = new Promise<CourseResponse>((resolve) => {
        resolveCopy = resolve;
      });
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce(mockSchedules);
      const mutateCopyAsync = vi.fn().mockReturnValue(pendingPromise);
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: mutateCopyAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      const { navigate, getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateCopyAsync).toHaveBeenCalled();
      });

      navigate("/courses");
      expect(getLocation().pathname).toBe("/courses");

      const copiedCourse: CourseResponse = {
        ...mockCourse,
        id: 999,
        title: "Frontend Development Mastery (copy)",
      };

      await act(async () => {
        resolveCopy(copiedCourse);
        await Promise.resolve();
      });

      expect(getLocation().pathname).toBe("/courses");
      expect(screen.getByText("Mock Course List")).toBeDefined();
      expect(screen.queryByText("Frontend Development Mastery (copy)")).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("safely handles duplicate rejection when user navigates away while write is pending", async () => {
      let rejectCopy: (err: unknown) => void = () => {};
      const pendingPromise = new Promise<CourseResponse>((_, reject) => {
        rejectCopy = reject;
      });
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce(mockSchedules);
      const mutateCopyAsync = vi.fn().mockReturnValue(pendingPromise);
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: mutateCopyAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      const { navigate, getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateCopyAsync).toHaveBeenCalled();
      });

      navigate("/courses");
      expect(getLocation().pathname).toBe("/courses");

      await act(async () => {
        rejectCopy(new Error("Database failure"));
        await Promise.resolve();
      });

      expect(getLocation().pathname).toBe("/courses");
      expect(screen.getByText("Mock Course List")).toBeDefined();
      expect(screen.queryByText("Database failure")).toBeNull();
      expect(screen.queryByText(i18n.t("courses:courseCopyError"))).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("does not dispatch duplicate POST if user departs while schedule prefetch is pending", async () => {
      let resolveSchedule: (val: CourseScheduleResponse[]) => void = () => {};
      const pendingSchedulePromise = new Promise<CourseScheduleResponse[]>((resolve) => {
        resolveSchedule = resolve;
      });
      vi.mocked(courseEndpoints.getCourseSchedule).mockReturnValue(pendingSchedulePromise);
      const mutateCopyAsync = vi.fn();
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: mutateCopyAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      const { navigate, getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      expect(courseEndpoints.getCourseSchedule).toHaveBeenCalledWith(42);

      navigate("/courses");
      expect(getLocation().pathname).toBe("/courses");

      await act(async () => {
        resolveSchedule(mockSchedules);
        await Promise.resolve();
      });

      expect(mutateCopyAsync).not.toHaveBeenCalled();
      expect(getLocation().pathname).toBe("/courses");
      expect(screen.getByText("Mock Course List")).toBeDefined();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("safely handles delete resolution when user navigates away while delete is pending", async () => {
      let resolveDelete: () => void = () => {};
      const pendingPromise = new Promise<void>((resolve) => {
        resolveDelete = resolve;
      });
      const mutateDeleteAsync = vi.fn().mockReturnValue(pendingPromise);
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: mutateDeleteAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      const { navigate, getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateDeleteAsync).toHaveBeenCalledWith(42);
      });

      navigate("/courses/99");
      expect(getLocation().pathname).toBe("/courses/99");

      await act(async () => {
        resolveDelete();
        await Promise.resolve();
      });

      expect(getLocation().pathname).toBe("/courses/99");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("safely handles delete rejection when user navigates away while delete is pending", async () => {
      let rejectDelete: (err: unknown) => void = () => {};
      const pendingPromise = new Promise<void>((_, reject) => {
        rejectDelete = reject;
      });
      const mutateDeleteAsync = vi.fn().mockReturnValue(pendingPromise);
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: mutateDeleteAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      const { navigate, getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateDeleteAsync).toHaveBeenCalledWith(42);
      });

      navigate("/courses/99");
      expect(getLocation().pathname).toBe("/courses/99");

      await act(async () => {
        rejectDelete(new Error("Delete constraint error"));
        await Promise.resolve();
      });

      expect(getLocation().pathname).toBe("/courses/99");
      expect(screen.queryByText("Delete constraint error")).toBeNull();
      expect(screen.queryByText(i18n.t("courses:courseDeleteError"))).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
