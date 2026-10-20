import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { StudentDashboard } from "./StudentDashboard";
import type { StudentCourseProfile } from "../../lib/users/types";

const state = vi.hoisted(() => ({ profile: {} as Record<string, unknown>, mentor: {} as Record<string, unknown>, schedule: {} as Record<string, unknown> }));

vi.mock("../../lib/users/hooks", () => ({
  useMyStudentProfile: () => state.profile,
  useMentorProfile: () => state.mentor,
}));
vi.mock("../../lib/courses/hooks", () => ({
  useCourseSchedule: () => state.schedule,
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

beforeEach(async () => {
  await i18n.changeLanguage("en");
  state.profile = profile([courseEntry(1, "Physics", null), courseEntry(2, "Chemistry", null), courseEntry(3, "Old", null, "archive")]);
  state.mentor = { data: { user: { first_name: "Davron", last_name: "Karimov" } }, isLoading: false, isError: false };
  state.schedule = { data: [{ id: 1, course_id: 1, day_of_week: 0, time_start: "10:00:00", time_end: "11:30:00" }, { id: 2, course_id: 1, day_of_week: 2, time_start: "10:00:00", time_end: "11:30:00" }], isLoading: false, isError: false };
});
afterEach(cleanup);

describe("StudentDashboard", () => {
  it("renders one card per active course and no stat tiles, next lesson card or latest period card", () => {
    const { container } = renderDashboard();
    expect(screen.getAllByTestId("student-course-card")).toHaveLength(2);
    expect(container.querySelectorAll("[data-stat-group]")).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Next lesson" })).toBeNull();
    expect(screen.queryByText(/latest result/i)).toBeNull();
  });

  it("shows title, mentor, schedule, computed next lesson, score over max, attendance and an Open journal link", () => {
    renderDashboard();
    const card: HTMLElement = screen.getAllByTestId("student-course-card")[0];
    expect(within(card).getByText("Physics")).toBeTruthy();
    expect(within(card).getByText("Davron Karimov")).toBeTruthy();
    expect(card.textContent).toMatch(/10:00.11:30/);
    expect(within(card).queryByText("No upcoming lesson")).toBeNull();
    expect(within(card).getByTestId("course-card-score").textContent).toContain("92/ 130");
    expect(card.textContent).toContain("Attendance 90%");
    expect(within(card).getByRole("link", { name: "Open journal" }).getAttribute("href")).toBe("/my/courses/1/journal");
  });

  it("falls back to the profile next lesson and then to an explicit empty line", () => {
    state.schedule = { data: [], isLoading: false, isError: false };
    state.profile = profile([courseEntry(1, "Physics", "2099-10-20T05:00:00Z"), courseEntry(2, "Chemistry", null)]);
    renderDashboard();
    const cards: HTMLElement[] = screen.getAllByTestId("student-course-card");
    expect(within(cards[0]).queryByText("No upcoming lesson")).toBeNull();
    expect(within(cards[1]).getByText("No upcoming lesson")).toBeTruthy();
  });

  it("shows a skeleton with the card geometry while loading", () => {
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
