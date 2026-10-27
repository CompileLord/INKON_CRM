import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { MentorCourses } from "./MentorCourses";
import * as courseHooks from "../../lib/courses/hooks";
import type { CourseResponse, CourseScheduleResponse } from "../../lib/courses/types";

const mockCourse: CourseResponse = {
  id: 1,
  title: "Mental Arithmetic",
  description: "Course description",
  photo_path: null,
  start_date: "2026-09-01",
  end_date: "2027-05-31",
  exam_type: "weekly",
  price: "500.00",
  mentor_id: 10,
  status: "active",
  is_deleted: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockSchedules: CourseScheduleResponse[] = [
  { id: 101, course_id: 1, day_of_week: 0, time_start: "09:00:00", time_end: "11:00:00" },
  { id: 102, course_id: 1, day_of_week: 2, time_start: "09:00:00", time_end: "11:00:00" },
  { id: 103, course_id: 1, day_of_week: 4, time_start: "09:00:00", time_end: "11:00:00" },
];

function renderWithRouter(ui: JSX.Element) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("MentorCourses", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru");
    vi.spyOn(courseHooks, "useCourseSchedule").mockReturnValue({
      data: mockSchedules,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof courseHooks.useCourseSchedule>);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders empty state when there are no courses", () => {
    renderWithRouter(<MentorCourses courses={[]} />);
    expect(screen.getByText("Активных курсов нет")).toBeDefined();
  });

  it("renders course row with schedule chip, journal link, and shared TJS price", () => {
    renderWithRouter(<MentorCourses courses={[mockCourse]} />);

    expect(screen.getByText("Mental Arithmetic")).toBeDefined();
    expect(screen.getByText("Пн, Ср, Пт · 09:00–11:00")).toBeDefined();
    expect(screen.getByText("500 TJS / мес")).toBeDefined();

    const journalLink: HTMLAnchorElement = screen.getByRole("link", { name: "В журнал" });
    expect(journalLink.getAttribute("href")).toBe("/journals/1");
  });
});
