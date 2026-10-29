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
  it("moves selection and focus together with arrows, Home and End and reflects the tab in the URL", async () => {
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
    expect(performanceTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(performanceTab);
    expect(screen.getByRole("tabpanel", { name: /Progress/i })).toBeDefined();

    await user.keyboard("{End}");
    expect(documentsTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(documentsTab);
    expect(screen.getByRole("tabpanel", { name: /Documents/i })).toBeDefined();

    await user.keyboard("{Home}");
    expect(coursesTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(coursesTab);
  });

  it("stores the selected tab in the tab query parameter and restores it on direct entry", () => {
    renderStudentProfile(["/students/42?tab=documents"]);
    expect(screen.getByRole("tab", { name: /Documents/i }).getAttribute("aria-selected")).toBe("true");
  });

  it("falls back to the history-state tab only when no tab parameter is present", () => {
    renderStudentProfile([{ pathname: "/students/42", state: { profileTab: "performance" } }]);
    expect(screen.getByRole("tab", { name: /Progress/i }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the selected tab in the profile history entry through a course round trip", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    await user.click(screen.getByRole("tab", { name: /Progress/i }));
    await user.click(screen.getByRole("link", { name: /Advanced Mathematics/ }));
    await user.click(screen.getByRole("button", { name: "Return to profile" }));

    expect(screen.getByRole("tab", { name: /Progress/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: /Progress/i })).toBeDefined();
  });

  it("never substitutes legacy aggregate defaults for absent performance data", () => {
    const profileWithoutPerformance: StudentProfileResponse = { ...mockProfileResponse, avg_score: 87.5, absences: 2, total_lessons: 24, performance: undefined };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: profileWithoutPerformance, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    expect(screen.queryByText("Attendance")).toBeNull();
    expect(document.querySelector("[data-stat-group] [data-stat-missing]")).toBeNull();
    expect(screen.queryByText("87.5")).toBeNull();
    expect(screen.queryByText("24")).toBeNull();
  });

  it("preserves a genuine zero score as 0", () => {
    const zeroScoreProfile: StudentProfileResponse = { ...mockProfileResponse, courses: mockProfileResponse.courses.map((item) => ({ ...item, my_total_score: 0, my_total_max_score: 400 })) };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: zeroScoreProfile, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    const tile = screen.getByText("Points, active courses").closest("[data-stat-tile]") as HTMLElement;
    expect(tile.textContent).toContain("0");
    expect(tile.textContent).not.toContain("400");
    expect(tile.querySelector("[data-stat-missing]")).toBeNull();
  });

  it("keeps the method notes in one info tooltip beside the Progress heading instead of a visible block", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));

    expect(await screen.findByRole("heading", { name: "Progress" })).toBeDefined();
    expect(screen.queryByText(/The percentage is the share of the maximum/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Points add up homework/ }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("The percentage is the share of the maximum");
    expect(document.querySelectorAll("[data-info-tooltip], [role='tooltip']")).toHaveLength(1);
  });

  it("draws one smooth line per course by period for staff and lists compact per-course rows", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));

    const chart = await screen.findByTestId("student-progress-chart");
    const lines = chart.querySelectorAll('[data-testid="student-chart-line"]');
    expect(lines).toHaveLength(2);
    lines.forEach((line) => expect(line.getAttribute("d")).toContain("C"));
    expect(chart.querySelector("svg")?.getAttribute("class")).toContain("motion-safe:animate-[tab-panel-in_300ms_ease-out]");
    expect(chart.querySelectorAll('[data-testid="student-chart-point"]')).toHaveLength(4);
    expect(courseEndpoints.getCourseStaffProgress).toHaveBeenCalledWith(101);
    expect(courseEndpoints.getCourseStaffProgress).toHaveBeenCalledWith(102);

    const legend = screen.getByTestId("student-chart-legend");
    expect(legend.textContent).toContain("Advanced Mathematics");
    expect(legend.textContent).toContain("English Literature");

    const rows = screen.getAllByTestId("course-progress-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Advanced Mathematics");
    expect(rows[0].querySelector("[data-course-score]")?.textContent).toBe("9 / 10");
    expect(rows[0].textContent).toContain("latest period");
    expect(rows[0].textContent).not.toContain("340 / 400");
    expect(rows[0].textContent).not.toContain("—");
    expect(rows[0].textContent).not.toContain("85%");
    expect(rows[0].textContent).toContain("95% attendance");
    expect(rows[0].textContent).toContain("1 of 12 missed");
    expect(screen.queryByText(/Recorded period summaries for this course/i)).toBeNull();
  });

  it("hides the chart legend when only one course has graded periods and keeps it for several", async () => {
    const user = userEvent.setup();
    vi.spyOn(courseEndpoints, "getCourseStaffProgress").mockImplementation(async (courseId: number) => {
      const progress = staffProgressFixture(courseId);
      return courseId === 101 ? progress : { ...progress, students: [{ ...progress.students[0], period_results: progress.students[0].period_results.map((result) => ({ ...result, score: null, max_score: null, percentage: null })) }] };
    });
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    const chart = await screen.findByTestId("student-progress-chart");
    expect(chart.querySelectorAll('[data-testid="student-chart-line"]')).toHaveLength(1);
    expect(screen.queryByTestId("student-chart-legend")).toBeNull();
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
    expect(userEndpoints.getMyStudentJournalPage).toHaveBeenCalled();
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
    expect(screen.getByText(/two graded periods/i)).toBeDefined();
    expect(screen.queryByTestId("student-progress-chart")).toBeNull();
    expect(screen.getAllByTestId("course-progress-row")).toHaveLength(2);
  });

  it("shows a progress skeleton while period results load and an error with a working retry when they fail", async () => {
    const user = userEvent.setup();
    const failing = vi.spyOn(courseEndpoints, "getCourseStaffProgress").mockImplementation(() => new Promise((_resolve, reject) => setTimeout(() => reject(new AuthApiError(500, "boom")), 400)));
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    expect(screen.getByTestId("progress-chart-skeleton")).toBeDefined();
    expect(await screen.findByText("Couldn't load the progress chart")).toBeDefined();

    failing.mockImplementation(async (courseId: number) => staffProgressFixture(courseId));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("student-progress-chart")).toBeDefined();
  });
});
