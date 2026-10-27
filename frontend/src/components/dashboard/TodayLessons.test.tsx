import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { UseQueryResult } from "@tanstack/react-query";
import i18n from "../../i18n";
import { TodayLessons } from "./TodayLessons";
import * as courseHooks from "../../lib/courses/hooks";
import * as userHooks from "../../lib/users/hooks";
import type { CourseListItemResponse, PaginatedCourses } from "../../lib/courses/types";
import type { PaginatedUsers } from "../../lib/users/types";

vi.mock("../../lib/courses/hooks");
vi.mock("../../lib/users/hooks");

function courseFixture(id: number, title: string, mentorId: number, timeStart: string, timeEnd: string, dayOfWeek: number): CourseListItemResponse {
  return {
    id,
    title,
    description: "",
    photo_path: null,
    start_date: "2026-09-01",
    end_date: "2026-12-31",
    exam_type: "weekly",
    price: "100.00",
    mentor_id: mentorId,
    status: "active",
    is_deleted: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    schedules: [{ id: id, course_id: id, day_of_week: dayOfWeek, time_start: timeStart, time_end: timeEnd }],
    active_student_count: 8,
  };
}

function coursesResult(overrides: Record<string, unknown>): UseQueryResult<PaginatedCourses> {
  return { data: undefined, isLoading: false, isError: false, isFetching: false, refetch: vi.fn(), ...overrides } as unknown as UseQueryResult<PaginatedCourses>;
}

function renderToday(showMentor: boolean): void {
  render(
    <MemoryRouter>
      <TodayLessons showMentor={showMentor} />
    </MemoryRouter>,
  );
}

describe("TodayLessons", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
    await i18n.changeLanguage("en");
    vi.mocked(userHooks.useMentors).mockReturnValue({
      data: { items: [{ id: 5, first_name: "Ali", last_name: "Valiev" }] },
    } as unknown as UseQueryResult<PaginatedUsers>);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("lists only today's lessons sorted by time with journal links, students and mentor for admins", () => {
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      coursesResult({
        data: {
          items: [
            courseFixture(2, "Afternoon Group", 5, "16:00:00", "17:30:00", 0),
            courseFixture(1, "Morning Group", 5, "09:00:00", "10:30:00", 0),
            courseFixture(3, "Tuesday Group", 5, "09:00:00", "10:30:00", 1),
          ],
        },
      }),
    );
    renderToday(true);
    const items: HTMLElement[] = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("09:00–10:30");
    expect(items[0].textContent).toContain("Morning Group");
    expect(items[0].textContent).toContain("Ali Valiev");
    expect(items[0].textContent).toContain("8 students");
    expect(items[1].textContent).toContain("16:00–17:30");
    expect(screen.queryByText("Tuesday Group")).toBeNull();
    expect(screen.getByRole("link", { name: /Morning Group/ }).getAttribute("href")).toBe("/journals/1");
  });

  it("hides the mentor name for the mentor dashboard", () => {
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      coursesResult({ data: { items: [courseFixture(1, "Morning Group", 5, "09:00:00", "10:30:00", 0)] } }),
    );
    renderToday(false);
    expect(screen.queryByText(/Ali Valiev/)).toBeNull();
    expect(screen.getByText(/8 students/)).toBeTruthy();
  });

  it("renders one slim line with the next lesson instead of a card when nothing is scheduled today", () => {
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      coursesResult({ data: { items: [courseFixture(3, "Tuesday Group", 5, "09:00:00", "10:30:00", 1)] } }),
    );
    renderToday(false);
    expect(screen.getByText("No lessons today · Next: tomorrow, 09:00")).toBeTruthy();
    expect(document.querySelector("[data-section-card]")).toBeNull();
    expect(document.querySelector("[data-empty-state]")).toBeNull();
  });

  it("renders the loading state", () => {
    vi.mocked(courseHooks.useCourses).mockReturnValue(coursesResult({ isLoading: true }));
    renderToday(false);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
  });

  it("renders the error state with a working retry", () => {
    const refetch = vi.fn();
    vi.mocked(courseHooks.useCourses).mockReturnValue(coursesResult({ isError: true, refetch }));
    renderToday(false);
    expect(screen.getByText("Could not load today's lessons")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
