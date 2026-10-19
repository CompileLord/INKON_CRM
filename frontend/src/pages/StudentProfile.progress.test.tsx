import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthApiError } from "../lib/auth/errors";
import { useAuthStore } from "../store/authStore";
import * as userHooks from "../lib/users/hooks";
import * as userEndpoints from "../lib/users/endpoints";
import * as courseEndpoints from "../lib/courses/endpoints";
import type { StudentProfileResponse } from "../lib/users/types";
import { mockProfileResponse, staffProgressFixture, renderStudentProfile, registerStudentProfileHooks } from "./StudentProfileTestSupport";

registerStudentProfileHooks();

describe("StudentProfile Component", () => {
  it("moves tab focus with arrows and activates panes with Enter and Space", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const coursesTab = screen.getByRole("tab", { name: /Courses/i });
    const performanceTab = screen.getByRole("tab", { name: /Progress/i });
    const documentsTab = screen.getByRole("tab", { name: /Documents/i });

    expect(coursesTab.getAttribute("aria-selected")).toBe("true");
    expect(coursesTab.getAttribute("tabindex")).toBe("0");
    expect(performanceTab.getAttribute("tabindex")).toBe("-1");

    coursesTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(coursesTab.getAttribute("aria-selected")).toBe("true");
    expect(performanceTab.getAttribute("aria-selected")).toBe("false");
    expect(document.activeElement).toBe(performanceTab);
    expect(screen.getByRole("tabpanel", { name: /Courses/i })).toBeDefined();

    await user.keyboard("{Enter}");
    expect(performanceTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: /Progress/i })).toBeDefined();

    await user.keyboard("{End}");
    expect(performanceTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(documentsTab);
    await user.keyboard(" ");
    expect(documentsTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: /Documents/i })).toBeDefined();

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(coursesTab);
    expect(documentsTab.getAttribute("aria-selected")).toBe("true");
    await user.keyboard(" ");
    expect(coursesTab.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the selected tab in the profile history entry through a course round trip", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    await user.click(screen.getByRole("tab", { name: /Progress/i }));
    await user.click(screen.getByRole("link", { name: "Advanced Mathematics" }));
    await user.click(screen.getByRole("button", { name: "Return to profile" }));

    expect(screen.getByRole("tab", { name: /Progress/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: /Progress/i })).toBeDefined();
  });

  it("never substitutes legacy aggregate defaults for absent provenance data", () => {
    const profileWithoutPerformance: StudentProfileResponse = {
      ...mockProfileResponse,
      avg_score: 87.5,
      absences: 2,
      total_lessons: 24,
      performance: undefined,
    };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => {
      return {
        data: profileWithoutPerformance,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof userHooks.useStudentProfile>;
    });

    renderStudentProfile();

    expect(screen.getByText("Score unavailable", { selector: ".sr-only" }).parentElement?.querySelector('[aria-hidden="true"]')?.textContent).toBe("—");
    expect(screen.getAllByText("Attendance unavailable")).toHaveLength(2);
    expect(screen.queryByText("87.5")).toBeNull();
    expect(screen.queryByText("24")).toBeNull();
  });

  it("preserves a genuine stored zero as an unverified raw score", () => {
    const basePerformance = mockProfileResponse.performance;
    if (!basePerformance) throw new Error("The test fixture must include performance totals");
    const zeroScoreProfile: StudentProfileResponse = {
      ...mockProfileResponse,
      performance: {
        ...basePerformance,
        raw_avg_percentage: 0,
        grading_state: "unknown",
      },
    };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => {
      return {
        data: zeroScoreProfile,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof userHooks.useStudentProfile>;
    });

    renderStudentProfile();

    expect(screen.getByText("0.0")).toBeDefined();
    expect(screen.queryByText("Score unavailable")).toBeNull();
  });

  it("keeps the method notes in one info tooltip beside the Progress heading instead of a visible block", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));

    expect(await screen.findByRole("heading", { name: "Progress" })).toBeDefined();
    expect(screen.queryByText(/All recorded student period summaries across all courses/i)).toBeNull();
    expect(screen.queryByText(/Stored period total lessons/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: "How progress is measured" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("All recorded student period summaries across all courses");
    expect(tooltip.textContent).toContain("Stored period total lessons");
    expect(tooltip.textContent).toContain("Stored without explicit assessment provenance");
    expect(tooltip.textContent).toContain("Period summaries recorded (status unknown)");
  });

  it("draws one smooth line per course by period for staff and lists compact per-course rows", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));

    const chart = await screen.findByTestId("student-progress-chart");
    const lines = chart.querySelectorAll('[data-testid="student-chart-line"]');
    expect(lines).toHaveLength(2);
    lines.forEach((line) => expect(line.getAttribute("d")).toContain("C"));
    expect(chart.querySelectorAll('[data-testid="student-chart-point"]')).toHaveLength(4);
    expect(courseEndpoints.getCourseStaffProgress).toHaveBeenCalledWith(101);
    expect(courseEndpoints.getCourseStaffProgress).toHaveBeenCalledWith(102);

    const legend = screen.getByTestId("student-chart-legend");
    expect(legend.textContent).toContain("Advanced Mathematics");
    expect(legend.textContent).toContain("English Literature");

    const rows = screen.getAllByTestId("course-progress-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Advanced Mathematics");
    expect(rows[0].textContent).toContain("90.0");
    expect(rows[0].textContent).toContain("95%");
    expect(rows[0].textContent).toContain("1 of 12");
    expect(screen.queryByText(/Recorded period summaries for this course/i)).toBeNull();
  });

  it("shows a crosshair tooltip with each course value when a period is inspected", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    const chart = await screen.findByTestId("student-progress-chart");
    const group = chart.querySelector('svg[role="group"]') as SVGElement;

    group.focus();
    await user.keyboard("{Home}");

    const tooltip = screen.getByTestId("student-chart-tooltip");
    expect(tooltip.getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("student-chart-crosshair").getAttribute("data-active")).toBe("true");
    expect(tooltip.textContent).toContain("Week 1");
    expect(tooltip.textContent).toContain("80%");
    expect(tooltip.textContent).toContain("70%");
    await user.keyboard("{Escape}");
    expect(tooltip.getAttribute("data-active")).toBe("false");
  });

  it("draws a single line when the student has one course", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: { ...mockProfileResponse, courses: [mockProfileResponse.courses[0]] }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    const chart = await screen.findByTestId("student-progress-chart");
    expect(chart.querySelectorAll('[data-testid="student-chart-line"]')).toHaveLength(1);
    expect(screen.getAllByTestId("course-progress-row")).toHaveLength(1);
  });

  it("uses the student's own journals for a student self-view instead of staff-only endpoints", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ role: "student", userId: 42 });
    renderStudentProfile([{ pathname: "/students/42", state: { from: "/my/courses" } }]);
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    const chart = await screen.findByTestId("student-progress-chart");
    expect(chart.querySelectorAll('[data-testid="student-chart-line"]')).toHaveLength(2);
    expect(userEndpoints.getMyStudentJournals).toHaveBeenCalled();
    expect(courseEndpoints.getCourseStaffProgress).not.toHaveBeenCalled();
  });

  it("explains why the chart is empty when no course has two graded periods", async () => {
    const user = userEvent.setup();
    vi.spyOn(courseEndpoints, "getCourseStaffProgress").mockImplementation(async (courseId: number) => {
      const fixture = staffProgressFixture(courseId);
      fixture.students[0].period_results[1] = { period_id: courseId * 10 + 2, grading_state: "missing", score: null, max_score: null, percentage: null };
      return fixture;
    });
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    expect(await screen.findByText("Not enough graded periods")).toBeDefined();
    expect(screen.getByText(/at least two graded periods/i)).toBeDefined();
    expect(screen.queryByTestId("student-progress-chart")).toBeNull();
    expect(screen.getAllByTestId("course-progress-row")).toHaveLength(2);
  });

  it("shows a progress skeleton while period results load and an error with a working retry when they fail", async () => {
    const user = userEvent.setup();
    const failing = vi.spyOn(courseEndpoints, "getCourseStaffProgress").mockImplementation(() => new Promise((_resolve, reject) => setTimeout(() => reject(new AuthApiError(500, "boom")), 400)));
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    expect(screen.getByTestId("progress-chart-skeleton")).toBeDefined();
    expect(await screen.findByText("Could not load the progress chart")).toBeDefined();

    failing.mockImplementation(async (courseId: number) => staffProgressFixture(courseId));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("student-progress-chart")).toBeDefined();
  });
});
