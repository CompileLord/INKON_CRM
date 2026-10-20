import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import * as courseHooks from "../lib/courses/hooks";
import * as courseEndpoints from "../lib/courses/endpoints";
import * as returnContext from "../lib/courses/returnContext";
import type { CourseResponse, CourseScheduleResponse } from "../lib/courses/types";
import { AuthApiError } from "../lib/auth/errors";
import { mockSuccessResult, mockCourse, mockSchedules, renderCourseProfile, registerCourseProfileHooks } from "./CourseProfileTestSupport";

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
    it("blocks duplication when schedule is empty and shows accessible inline error", async () => {
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce([]);

      renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      expect(screen.getByText("Duplicate course")).toBeDefined();
      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeDefined();
        expect(screen.getByText(i18n.t("courseDetail:duplicate.missingSchedule"))).toBeDefined();
      });

      expect(courseHooks.useCopyCourse().mutateAsync).not.toHaveBeenCalled();
    });

    it("duplicates course preserving schedule seconds and navigates to new course", async () => {
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce(mockSchedules);
      const mutateCopyAsync = vi.fn().mockResolvedValueOnce({ id: 88, title: "Frontend Development Mastery (copy)" });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: mutateCopyAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      const { getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateCopyAsync).toHaveBeenCalledWith({
          id: 42,
          payload: expect.objectContaining({
            schedules: [
              { day_of_week: 0, time_start: "09:00:00", time_end: "10:30:00" },
              { day_of_week: 2, time_start: "14:00:00", time_end: "15:30:00" },
            ],
          }),
        });
        expect(getLocation().pathname).toBe("/courses/88");
      });
    });

    it("duplicates course with photo source omitting photo_path in exact CourseCreate schema and keeping schedule seconds", async () => {
      const courseWithPhoto: CourseResponse = {
        ...mockCourse,
        photo_path: "storage/courses/42/photo.jpg",
      };
      vi.mocked(courseHooks.useCourse).mockReturnValue(mockSuccessResult(courseWithPhoto));
      const schedulesWithExactSeconds: CourseScheduleResponse[] = [
        { id: 1, course_id: 42, day_of_week: 1, time_start: "10:00:15", time_end: "11:30:45" },
      ];
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce(schedulesWithExactSeconds);
      const mutateCopyAsync = vi.fn().mockResolvedValueOnce({ id: 89, title: "Frontend Development Mastery (copy)" });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: mutateCopyAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      const { getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateCopyAsync).toHaveBeenCalledTimes(1);
        const callArgs = mutateCopyAsync.mock.calls[0][0];
        expect(callArgs.id).toBe(42);
        const payload = callArgs.payload;
        expect("photo_path" in payload).toBe(false);
        const permittedKeys = [
          "description",
          "end_date",
          "exam_type",
          "mentor_id",
          "price",
          "schedules",
          "start_date",
          "title",
        ];
        expect(Object.keys(payload).sort()).toEqual(permittedKeys);
        expect(payload.schedules).toEqual([
          { day_of_week: 1, time_start: "10:00:15", time_end: "11:30:45" },
        ]);
        expect(getLocation().pathname).toBe("/courses/89");
      });
    });

    it("deletes course and navigates to preserved safe return URL", async () => {
      const mutateDeleteAsync = vi.fn().mockResolvedValueOnce(undefined);
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: mutateDeleteAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      returnContext.recordCourseListNavigation("?status=active&page=3");

      const { getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      expect(screen.getByText("Delete course")).toBeDefined();
      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateDeleteAsync).toHaveBeenCalledWith(42);
        expect(getLocation().pathname).toBe("/courses");
        expect(getLocation().search).toBe("?status=active&page=3");
      });
    });

    it.each(["en", "ru", "tg"] as const)(
      "renders translated courseCopyError on duplicate failure in %s, preserves dialog and retry, and never exposes raw backend sentinel",
      async (locale) => {
        await i18n.changeLanguage(locale);
        vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValue(mockSchedules);
        const mutateCopyAsync = vi.fn().mockRejectedValueOnce(new AuthApiError(500, "Внутренняя ошибка: raw_copy_sentinel"));
        vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
          mutateAsync: mutateCopyAsync,
          isPending: false,
        } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

        renderCourseProfile();

        const actionsTrigger = screen.getByRole("button", {
          name: `${i18n.t("courses:courseActions")}: ${mockCourse.title}`,
        });
        fireEvent.click(actionsTrigger);

        const duplicateMenuItem = screen.getByRole("menuitem", { name: i18n.t("courses:duplicate") });
        fireEvent.click(duplicateMenuItem);

        const confirmBtn = screen.getByRole("button", { name: i18n.t("courses:duplicate") });
        fireEvent.click(confirmBtn);

        await waitFor(() => {
          expect(mutateCopyAsync).toHaveBeenCalledTimes(1);
          expect(screen.getByRole("dialog")).toBeDefined();
          expect(screen.getByText(i18n.t("courseDetail:duplicate.error"))).toBeDefined();
        });

        expect(screen.queryByText(/raw_copy_sentinel/i)).toBeNull();
        expect(screen.queryByText(/Внутренняя ошибка/i)).toBeNull();

        mutateCopyAsync.mockResolvedValueOnce({
          ...mockCourse,
          id: 88,
          title: "Frontend Development Mastery (copy)",
        });
        fireEvent.click(confirmBtn);

        await waitFor(() => {
          expect(mutateCopyAsync).toHaveBeenCalledTimes(2);
        });
      },
    );

    it.each(["en", "ru", "tg"] as const)(
      "renders translated courseDeleteError on delete failure in %s, preserves dialog and retry, and never exposes raw backend sentinel",
      async (locale) => {
        await i18n.changeLanguage(locale);
        const mutateDeleteAsync = vi.fn().mockRejectedValueOnce(new AuthApiError(400, "ConstraintViolation: raw_delete_sentinel"));
        vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
          mutateAsync: mutateDeleteAsync,
          isPending: false,
        } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

        renderCourseProfile();

        const actionsTrigger = screen.getByRole("button", {
          name: `${i18n.t("courses:courseActions")}: ${mockCourse.title}`,
        });
        fireEvent.click(actionsTrigger);

        const deleteMenuItem = screen.getByRole("menuitem", { name: i18n.t("courses:delete") });
        fireEvent.click(deleteMenuItem);

        const confirmBtn = screen.getByRole("button", { name: i18n.t("courses:delete") });
        fireEvent.click(confirmBtn);

        await waitFor(() => {
          expect(mutateDeleteAsync).toHaveBeenCalledTimes(1);
          expect(screen.getByRole("dialog")).toBeDefined();
          expect(screen.getByText(i18n.t("courseDetail:delete.error"))).toBeDefined();
        });

        expect(screen.queryByText(/raw_delete_sentinel/i)).toBeNull();
        expect(screen.queryByText(/ConstraintViolation/i)).toBeNull();

        mutateDeleteAsync.mockResolvedValueOnce(undefined);
        fireEvent.click(confirmBtn);

        await waitFor(() => {
          expect(mutateDeleteAsync).toHaveBeenCalledTimes(2);
        });
      },
    );
  });
});
