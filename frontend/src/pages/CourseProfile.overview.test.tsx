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
  describe("Overview Quiet Aggregate Strip", () => {
    it("renders authoritative enrollment count and explains unavailable grades under existing contract", () => {
      renderCourseProfile();

      expect(screen.getByText("15")).toBeDefined();
      expect(screen.getByText("Grading information unavailable")).toBeDefined();
      expect(screen.getByText("Attendance information unavailable")).toBeDefined();
      expect(screen.queryByText(/not recorded yet/i)).toBeNull();
      const dashes = screen.getAllByLabelText("Unavailable");
      expect(dashes.length).toBe(2);
    });

    it("displays unavailable dash when no journal periods or grades exist rather than fake zero", () => {
      vi.mocked(courseHooks.useCourseJournalMetrics).mockReturnValue(
        mockSuccessResult({
          class_avg_percentage: 0.0,
          attendance_rate: 0.0,
          periods_total: 0,
          periods_complete: 0,
          at_risk_count: 0,
          at_risk_threshold: 60,
        }),
      );

      renderCourseProfile();

      const dashes = screen.getAllByLabelText("Unavailable");
      expect(dashes.length).toBe(2);
    });

    it("renders truthful unknown wording in Russian and Tajik without claiming not recorded yet", async () => {
      await i18n.changeLanguage("ru");
      const { unmount: unmountRu } = renderCourseProfile();

      expect(screen.getByText("Информация об оценках недоступна")).toBeDefined();
      expect(screen.getByText("Информация о посещаемости недоступна")).toBeDefined();
      expect(screen.queryByText(/пока не выставлены/i)).toBeNull();
      unmountRu();

      await i18n.changeLanguage("tg");
      const { unmount: unmountTg } = renderCourseProfile();

      expect(screen.getByText("Маълумот оид ба баҳоҳо дастнорас аст")).toBeDefined();
      expect(screen.getByText("Маълумот оид ба иштирок дастнорас аст")).toBeDefined();
      expect(screen.queryByText(/ҳанӯз/i)).toBeNull();
      unmountTg();
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
      expect(screen.getByText("Failed to load schedule")).toBeDefined();

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
