import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import i18n from "../i18n";
import * as courseHooks from "../lib/courses/hooks";
import { mockSuccessResult, mockErrorResult, renderCourseProfile, registerCourseProfileHooks } from "./CourseProfileTestSupport";

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
  describe("Overview figures and schedule summary", () => {
    it("renders three tiles in one group with the enrollment count, class average as score over maximum and attendance", () => {
      vi.mocked(courseHooks.useCourseJournalMetrics).mockReturnValue(
        mockSuccessResult({ class_avg_percentage: 68.4, class_avg_score: 80.7, class_avg_max_score: 118, attendance_rate: 92.4, periods_total: 4, periods_complete: 2, at_risk_count: 1, at_risk_threshold: 60 }),
      );
      renderCourseProfile();

      const group = document.querySelector("[data-stat-group]") as HTMLElement;
      expect(group.querySelectorAll("[data-stat-tile]")).toHaveLength(3);
      const tile = (label: string) => screen.getByText(label, { selector: "dt" }).closest("[data-stat-tile]") as HTMLElement;
      expect(tile("Students").textContent).toContain("15");
      expect(tile("Class average").textContent).toContain("80.7 / 118");
      expect(tile("Class average").textContent).toContain("68%");
      expect(tile("Attendance").textContent).toContain("92%");
    });

    it("shows a dash instead of a fake zero when no period is graded yet", () => {
      vi.mocked(courseHooks.useCourseJournalMetrics).mockReturnValue(
        mockSuccessResult({ class_avg_percentage: 0.0, attendance_rate: 0.0, periods_total: 0, periods_complete: 0, at_risk_count: 0, at_risk_threshold: 60 }),
      );
      renderCourseProfile();
      expect(document.querySelectorAll("[data-stat-missing]")).toHaveLength(2);
    });

    it("never shows a class average percentage above 100", () => {
      vi.mocked(courseHooks.useCourseJournalMetrics).mockReturnValue(
        mockSuccessResult({ class_avg_percentage: 112, class_avg_score: 130, class_avg_max_score: 116, attendance_rate: 90, periods_total: 1, periods_complete: 1, at_risk_count: 0, at_risk_threshold: 60 }),
      );
      renderCourseProfile();
      const tile = screen.getByText("Class average", { selector: "dt" }).closest("[data-stat-tile]") as HTMLElement;
      expect(tile.textContent).toContain("130 / 116");
      expect(tile.textContent).not.toContain("112%");
    });

    it("renders the failed figures with a working retry", () => {
      const refetchMetrics = vi.fn();
      vi.mocked(courseHooks.useCourseJournalMetrics).mockReturnValue({ ...mockErrorResult(new Error("boom")), refetch: refetchMetrics });
      renderCourseProfile();
      fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
      expect(refetchMetrics).toHaveBeenCalled();
    });

    it("summarizes the schedule in one line with grouped weekdays and 24-hour times", () => {
      renderCourseProfile();
      const line = screen.getByText("Schedule").closest("div") as HTMLElement;
      expect(line.textContent).toBe("ScheduleMon · 09:00–10:30; Wed · 14:00–15:30");
      expect(document.querySelectorAll("[role='tabpanel'] li")).toHaveLength(0);
    });

    it("groups weekdays with the same time into one entry", () => {
      vi.mocked(courseHooks.useCourseSchedule).mockReturnValue(
        mockSuccessResult([
          { id: 1, course_id: 42, day_of_week: 0, time_start: "15:00:00", time_end: "16:30:00" },
          { id: 2, course_id: 42, day_of_week: 2, time_start: "15:00:00", time_end: "16:30:00" },
          { id: 3, course_id: 42, day_of_week: 4, time_start: "15:00:00", time_end: "16:30:00" },
        ]),
      );
      renderCourseProfile();
      expect((screen.getByText("Schedule").closest("div") as HTMLElement).textContent).toBe("ScheduleMon, Wed, Fri · 15:00–16:30");
    });

    it("localizes the schedule summary and the labels in Russian and Tajik", async () => {
      await i18n.changeLanguage("ru");
      const { unmount: unmountRu } = renderCourseProfile();
      expect((screen.getByText("Расписание").closest("div") as HTMLElement).textContent).toBe("РасписаниеПн · 09:00–10:30; Ср · 14:00–15:30");
      expect(screen.getByText("Средний балл группы")).toBeDefined();
      unmountRu();

      await i18n.changeLanguage("tg");
      renderCourseProfile();
      expect((screen.getByText("Ҷадвал").closest("div") as HTMLElement).textContent).toBe("ҶадвалДш · 09:00–10:30; Чш · 14:00–15:30");
    });
  });

  describe("Schedule and History Independent States", () => {
    it("preserves identity card and description when schedule fails with working retry", () => {
      const refetchSchedule = vi.fn();
      vi.mocked(courseHooks.useCourseSchedule).mockReturnValue({
        ...mockErrorResult(new Error("Network error")),
        refetch: refetchSchedule,
      });

      renderCourseProfile();

      expect(screen.getAllByText("Frontend Development Mastery").length).toBeGreaterThan(0);
      expect(screen.getByText("Comprehensive practical curriculum covering TypeScript, React, and CSS architecture.")).toBeDefined();
      expect(screen.getByText("Couldn't load the schedule")).toBeDefined();

      const retryBtn = screen.getByRole("button", { name: "Retry" });
      fireEvent.click(retryBtn);
      expect(refetchSchedule).toHaveBeenCalled();
    });

    it("lazily fetches mentor history only when disclosure is opened", () => {
      renderCourseProfile();

      expect(courseHooks.useCourseMentorHistory).toHaveBeenCalledWith(42, false);

      const disclosureBtn = screen.getByRole("button", { name: "Mentor assignment history" });
      fireEvent.click(disclosureBtn);

      expect(courseHooks.useCourseMentorHistory).toHaveBeenCalledWith(42, true);
    });
  });
});
