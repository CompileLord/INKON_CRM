import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { useAuthStore } from "../store/authStore";
import * as courseHooks from "../lib/courses/hooks";
import * as enrollmentHooks from "../lib/enrollments/hooks";
import { AuthApiError } from "../lib/auth/errors";
import { mockErrorResult, renderCourseProfile, registerCourseProfileHooks } from "./CourseProfileTestSupport";

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
  describe("Role Privacy and Permissions", () => {
    it("renders mutable action controls for superadmin", () => {
      renderCourseProfile();

      expect(screen.getAllByText("Frontend Development Mastery").length).toBeGreaterThan(0);
      const actionsMenuTriggers = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" });
      expect(actionsMenuTriggers.length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Mentor assignment history" })).toBeDefined();
    });

    it("renders read-only view for assigned mentor with no admin action menu", () => {
      useAuthStore.setState({
        role: "mentor",
        userId: 101,
        status: "authenticated",
        mustSetPassword: false,
      });

      renderCourseProfile();

      expect(screen.getAllByText("Frontend Development Mastery").length).toBeGreaterThan(0);
      const actionsMenuTriggers = screen.queryAllByRole("button", { name: "Course actions: Frontend Development Mastery" });
      expect(actionsMenuTriggers.length).toBe(0);
      expect(screen.queryByRole("button", { name: "Mentor assignment history" })).toBeNull();
      expect(screen.getAllByRole("link", { name: "Open journal" }).length).toBeGreaterThan(0);
    });

    it("displays translated access denied message on 403 error without leaking course identity", () => {
      vi.mocked(courseHooks.useCourse).mockReturnValue(
        mockErrorResult(new AuthApiError(403, "Access denied")),
      );

      renderCourseProfile();

      expect(screen.queryByText("Frontend Development Mastery")).toBeNull();
      expect(screen.getByText("No access")).toBeDefined();
      expect(screen.getByText("You can't view this course.")).toBeDefined();
      expect(screen.getByRole("link", { name: "Back to courses" })).toBeDefined();
    });

    it("displays translated not found state on 404 error without leaking course identity", () => {
      vi.mocked(courseHooks.useCourse).mockReturnValue(
        mockErrorResult(new AuthApiError(404, "Not found")),
      );

      renderCourseProfile();

      expect(screen.queryByText("Frontend Development Mastery")).toBeNull();
      expect(screen.getByText("Course not found")).toBeDefined();
      expect(screen.getByRole("link", { name: "Back to courses" })).toBeDefined();
    });
  });

  describe("Tabs Accessibility and Query Isolation", () => {
    it("renders accessible tablist and panel structure", () => {
      renderCourseProfile();

      const tablist = screen.getByRole("tablist");
      expect(tablist).toBeDefined();

      const overviewTab = screen.getByRole("tab", { name: "Overview" });
      const studentsTab = screen.getByRole("tab", { name: "Students" });
      const progressTab = screen.getByRole("tab", { name: "Performance" });

      expect(overviewTab.getAttribute("aria-selected")).toBe("true");
      expect(studentsTab.getAttribute("aria-selected")).toBe("false");
      expect(progressTab.getAttribute("aria-selected")).toBe("false");

      const panel = screen.getByRole("tabpanel");
      expect(panel.id).toBe("course-panel-overview");
      expect(panel.getAttribute("aria-labelledby")).toBe("course-tab-overview");
    });

    it("isolates inactive panes by not mounting roster or progress chart in overview", () => {
      renderCourseProfile();

      expect(enrollmentHooks.useCourseRosterPage).not.toHaveBeenCalled();
      expect(courseHooks.useCourseProgressChart).not.toHaveBeenCalled();
      expect(courseHooks.useCourseStaffProgress).not.toHaveBeenCalled();
    });

    it("mounts students pane when switching tabs", async () => {
      const { getLocation } = renderCourseProfile();

      const studentsTab = screen.getByRole("tab", { name: "Students" });
      fireEvent.click(studentsTab);

      await waitFor(() => {
        expect(getLocation().search).toContain("tab=students");
        expect(enrollmentHooks.useCourseRosterPage).toHaveBeenCalledWith(42, expect.anything());
      });
    });

    it("supports keyboard navigation across tabs with immediate activation", () => {
      const { getLocation } = renderCourseProfile();

      const overviewTab = screen.getByRole("tab", { name: "Overview" });
      fireEvent.keyDown(overviewTab, { key: "ArrowRight" });

      expect(getLocation().search).toContain("tab=students");
      const studentsTab = screen.getByRole("tab", { name: "Students" });
      expect(studentsTab.getAttribute("aria-selected")).toBe("true");

      fireEvent.keyDown(studentsTab, { key: "End" });
      expect(getLocation().search).toContain("tab=progress");

      const progressTab = screen.getByRole("tab", { name: "Performance" });
      fireEvent.keyDown(progressTab, { key: "Home" });
      expect(getLocation().search).toBe("");
    });

    it("normalizes invalid URL tab param to overview", () => {
      renderCourseProfile(["/courses/42?tab=unknown_tab"]);

      const overviewTab = screen.getByRole("tab", { name: "Overview" });
      expect(overviewTab.getAttribute("aria-selected")).toBe("true");
    });
  });
});
