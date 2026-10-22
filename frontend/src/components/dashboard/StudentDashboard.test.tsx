import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { StudentDashboard } from "./StudentDashboard";
import type { StudentCourseProfile } from "../../lib/users/types";

const state = vi.hoisted(() => ({ profile: {} as Record<string, unknown>, history: {} as Record<string, unknown> }));

vi.mock("../../lib/users/hooks", () => ({
  useMyStudentProfile: () => state.profile,
  useMyStudentJournalHistory: () => state.history,
}));
function courseEntry(id: number, title: string, nextLessonAt: string | null, bucket: "active" | "archive" = "active"): StudentCourseProfile {
  return {
    course: { id, title, description: "", photo_path: null, start_date: "2020-06-01", end_date: "2099-12-31", exam_type: "weekly", price: "1.00", mentor_id: 10, status: "active", is_deleted: false, created_at: "", updated_at: "" },
    enrollment_status: "active", bucket, my_avg_percentage: 70, my_total_score: 92, my_total_max_score: 130, attendance_percentage: 90, absences: 1,
    periods_total: 4, periods_graded: 1, my_rank: 3, class_size: 9, class_avg_percentage: 60, next_lesson_at: nextLessonAt,
  };
}

function profile(courses: StudentCourseProfile[]): Record<string, unknown> {
  return {
    data: { user: { first_name: "Faridun", last_name: "Nazarov", photo_path: null, thumbnail_path: null }, totals: {}, courses },
    isLoading: false, isError: false, refetch: vi.fn(),
  };
}

function renderDashboard() {
  return render(<MemoryRouter><StudentDashboard /></MemoryRouter>);
}

function period(courseId: number, sumScore: number, start: string, end: string, graded: boolean = true): Record<string, unknown> {
  return { journal_id: courseId * 10, course_id: courseId, course_title: "x", period_label: "Month 3", period_start: start, period_end: end, state: graded ? "graded" : "in_progress", percentage: 82, sum_score: sumScore, max_period_score: 120, attendance_count: 0, total_lessons: 1 };
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  state.profile = profile([courseEntry(1, "Physics", null), courseEntry(2, "Chemistry", null), courseEntry(3, "Old", null, "archive")]);
  state.history = { data: { pages: [{ items: [period(1, 99, "2026-03-01", "2026-03-31"), period(2, 5, "2026-03-01", "2026-03-31", false)] }] }, isLoading: false, isError: false };
});
afterEach(cleanup);

describe("StudentDashboard", () => {
  it("does not repeat My courses: no course card grid and no stat tiles", () => {
    const { container } = renderDashboard();
    expect(screen.queryAllByTestId("student-course-card")).toHaveLength(0);
    expect(screen.queryByTestId("student-course-cards")).toBeNull();
    expect(container.querySelectorAll("[data-stat-group]")).toHaveLength(0);
    expect(screen.queryByText("Davron Karimov")).toBeNull();
    expect(screen.queryByText(/Attendance/)).toBeNull();
  });

  it("shows one compact row per active course with the latest graded total and a Continue link", () => {
    renderDashboard();
    const rows: HTMLElement[] = screen.getAllByTestId("student-home-course");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Physics")).toBeTruthy();
    expect(within(rows[0]).getByTestId("latest-total").textContent).toBe("99");
    expect(rows[0].textContent).not.toMatch(/%|\/ 120|Month/);
    expect(within(rows[0]).getByRole("link", { name: "Continue" }).getAttribute("href")).toBe("/my/courses/1/journal");
    expect(within(rows[1]).queryByTestId("latest-total")).toBeNull();
    expect(within(rows[1]).getByText("Not graded yet")).toBeTruthy();
  });

  it("shows the soonest next lesson across active courses with its course name", () => {
    state.profile = profile([courseEntry(1, "Physics", "2099-10-21T05:00:00Z"), courseEntry(2, "Chemistry", "2099-10-20T05:00:00Z"), courseEntry(3, "Old", "2099-10-19T05:00:00Z", "archive")]);
    renderDashboard();
    const next: HTMLElement = screen.getByTestId("student-next-lesson");
    expect(next.textContent).toContain("Chemistry");
    expect(next.textContent).not.toContain("Physics");
  });

  it("omits the next lesson block when no lesson is scheduled", () => {
    renderDashboard();
    expect(screen.queryByTestId("student-next-lesson")).toBeNull();
  });

  it("shows a skeleton with the row geometry while loading", () => {
    state.profile = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    renderDashboard();
    expect(screen.getByTestId("student-courses-skeleton").children.length).toBeGreaterThan(1);
  });

  it("shows an error with a working retry", () => {
    const refetch = vi.fn();
    state.profile = { data: undefined, isLoading: false, isError: true, refetch };
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("explains an empty course list", () => {
    state.profile = profile([]);
    renderDashboard();
    expect(screen.getByText(/not enrolled in any course/i)).toBeTruthy();
  });

  it("shows no ranking or class average", () => {
    renderDashboard();
    expect(document.body.textContent).not.toMatch(/rank|class average/i);
  });
});
