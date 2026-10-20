import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { StudentDashboard } from "./StudentDashboard";
import type { StudentCourseProfile, StudentJournalPeriod, StudentProfileResponse } from "../../lib/users/types";

const state = vi.hoisted(() => ({ profile: {} as Record<string, unknown>, journals: {} as Record<string, unknown>, mentor: {} as Record<string, unknown> }));

vi.mock("../../lib/users/hooks", () => ({
  useMyStudentProfile: () => state.profile,
  useMyStudentJournals: () => state.journals,
  useMentorProfile: () => state.mentor,
}));
vi.mock("../../i18n/formatters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/formatters")>();
  return { ...actual, getSchoolCalendarDate: () => "2026-10-15" };
});

function courseEntry(id: number, title: string, nextLessonAt: string | null, bucket: "active" | "archive" = "active"): StudentCourseProfile {
  return {
    course: { id, title, description: "", photo_path: null, start_date: "2026-06-01", end_date: "2026-12-31", exam_type: "weekly", price: "1.00", mentor_id: 10, status: "active", is_deleted: false, created_at: "", updated_at: "" },
    enrollment_status: "active", bucket, my_avg_percentage: 70, my_total_score: 92, my_total_max_score: 130, attendance_percentage: 90, absences: 1,
    periods_total: 4, periods_graded: 1, my_rank: 3, class_size: 9, class_avg_percentage: 60, next_lesson_at: nextLessonAt,
  };
}

function profile(courses: StudentCourseProfile[], totals: Partial<StudentProfileResponse["totals"]> = {}): { data: unknown; isLoading: boolean; isError: boolean; refetch: () => void } {
  return {
    data: {
      user: { first_name: "Faridun", last_name: "Nazarov", photo_path: null, thumbnail_path: null },
      totals: { avg_percentage: 70.8, total_score: 92, total_max_score: 130, attendance_percentage: 90, absences: 3, total_lessons: 30, active_course_count: courses.length, archived_course_count: 0, ...totals },
      courses,
    },
    isLoading: false, isError: false, refetch: vi.fn(),
  };
}

function periodRow(id: number, label: string, start: string, score: number, maximum: number): StudentJournalPeriod {
  return { journal_id: id, course_id: 1, course_title: "Physics", period_label: label, period_start: start, period_end: start, homework_score: 40, attendance_score: 10, exam_score: 30, bonus_score: 6, sum_score: score, max_period_score: maximum, percentage: 0, attendance_count: 5, total_lessons: 5, state: "graded" };
}

function renderDashboard() {
  return render(<MemoryRouter><StudentDashboard /></MemoryRouter>);
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  state.profile = profile([courseEntry(1, "Physics", null)]);
  state.journals = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  state.mentor = { data: { user: { first_name: "Davron", last_name: "Karimov", photo_path: null, thumbnail_path: null } }, isLoading: false, isError: false };
});
afterEach(cleanup);

describe("StudentDashboard", () => {
  it("renders the name as the single page title on the shared page primitives", () => {
    const { container } = renderDashboard();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Faridun Nazarov");
    expect(container.querySelectorAll("[data-page-container]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-stat-group]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-section-card][data-section-flattened]")).toHaveLength(0);
  });

  it("leads the stats with the score over its maximum and keeps the percentage as a muted hint", () => {
    const { container } = renderDashboard();
    const tiles = container.querySelectorAll("[data-stat-tile]");
    expect(tiles).toHaveLength(3);
    expect(tiles[0].textContent).toContain("92/ 130");
    expect(tiles[0].querySelector("[data-score-percentage]")?.className).toContain("text-muted");
    expect(tiles[1].textContent).toContain("90%");
    expect(tiles[2].textContent).toContain("3");
    expect(tiles[2].textContent).toContain("of 30 lessons");
  });

  it("keeps a recorded zero score as a number and shows a dash only when the backend has no score", () => {
    state.profile = profile([courseEntry(1, "Physics", null)], { total_score: 0, total_max_score: 600 });
    const first = renderDashboard();
    expect(first.container.querySelectorAll("[data-stat-tile]")[0].textContent).toContain("0/ 600");
    first.unmount();
    state.profile = profile([courseEntry(1, "Physics", null)], { total_score: undefined, total_max_score: undefined });
    const second = renderDashboard();
    expect(second.container.querySelectorAll("[data-stat-tile]")[0].querySelector("[data-stat-missing]")).not.toBeNull();
  });

  it("selects the earliest upcoming lesson among active courses and links to its course", () => {
    state.profile = profile([courseEntry(1, "Physics", "2026-10-20T13:00:00Z"), courseEntry(2, "Chemistry", "2026-10-18T05:00:00Z"), courseEntry(3, "Old", "2026-10-16T05:00:00Z", "archive")]);
    renderDashboard();
    const card = screen.getByRole("heading", { name: "Next lesson" }).closest("section") as HTMLElement;
    expect(within(card).getByText("Chemistry")).toBeTruthy();
    expect(within(card).getByText("Davron Karimov")).toBeTruthy();
    expect(within(card).getByRole("link").getAttribute("href")).toBe("/my/courses/2");
    expect(within(card).getByText("10:00")).toBeTruthy();
  });

  it("explains when no active course has an upcoming lesson and survives a mentor lookup failure", () => {
    state.mentor = { data: undefined, isLoading: false, isError: true };
    renderDashboard();
    expect(screen.getByText("No upcoming lessons scheduled")).toBeTruthy();
    state.profile = profile([courseEntry(1, "Physics", "2026-10-20T13:00:00Z")]);
    cleanup();
    renderDashboard();
    expect(screen.getAllByText("Physics").length).toBeGreaterThan(0);
  });

  it("lists active courses as rows with the score over the maximum", () => {
    state.profile = profile([courseEntry(1, "Physics", null), courseEntry(2, "Chemistry", null)]);
    const { container } = renderDashboard();
    const coursesCard = screen.getByRole("heading", { name: "My courses" }).closest("section") as HTMLElement;
    expect(within(coursesCard).getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/my/courses/"))).toHaveLength(2);
    expect(within(coursesCard).getAllByTestId("course-score")[0].textContent).toBe("92/ 130");
    expect(container.querySelectorAll("[data-initial-tile]").length).toBeGreaterThanOrEqual(2);
  });

  it("explains an empty course list", () => {
    state.profile = profile([]);
    renderDashboard();
    expect(screen.getByText(/not enrolled in any course/i)).toBeTruthy();
  });

  it("shows no ranking, class average or classmate data", () => {
    renderDashboard();
    expect(document.body.textContent).not.toMatch(/rank|3 of 9|class average/i);
  });
});

describe("StudentDashboard latest result", () => {
  it("shows the latest started period score first with its contributions and a translated name", async () => {
    await i18n.changeLanguage("ru");
    state.journals = { data: [periodRow(3, "Week 5", "2026-11-20", 1, 1), periodRow(2, "Week 4", "2026-10-10", 86, 117), periodRow(1, "Week 3", "2026-10-03", 10, 117)], isLoading: false, isError: false, refetch: vi.fn() };
    renderDashboard();
    const card = screen.getByTestId("latest-result-score");
    expect(card.textContent).toContain("86/ 117");
    expect(card.querySelector("[data-score-percentage]")?.textContent).toBe("73,5%");
    expect(screen.getByText(/Неделя 4/)).toBeTruthy();
    expect(screen.queryByText(/Неделя 5/)).toBeNull();
    expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === "/my/journal/2")).toBe(true);
  });

  it("keeps a recorded zero and shows a dash for a missing contribution instead of zero", () => {
    const row = periodRow(2, "Week 4", "2026-10-10", 0, 117);
    row.bonus_score = undefined;
    state.journals = { data: [row], isLoading: false, isError: false, refetch: vi.fn() };
    renderDashboard();
    expect(screen.getByTestId("latest-result-score").textContent).toContain("0/ 117");
    const bonus = screen.getByText("Bonus").nextElementSibling as HTMLElement;
    expect(bonus.textContent).toBe("—");
  });

  it("explains periods that have not started yet and a missing period list differently", () => {
    state.journals = { data: [periodRow(3, "Week 5", "2026-11-20", 0, 100)], isLoading: false, isError: false, refetch: vi.fn() };
    const first = renderDashboard();
    expect(screen.getByText("Your periods have not started yet")).toBeTruthy();
    first.unmount();
    state.journals = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    renderDashboard();
    expect(screen.getByText("No periods available yet")).toBeTruthy();
  });

  it("shows a loading skeleton and a working retry without claiming there are no grades", () => {
    state.journals = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    const first = renderDashboard();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    first.unmount();
    const refetch = vi.fn();
    state.journals = { data: undefined, isLoading: false, isError: true, refetch };
    renderDashboard();
    expect(screen.queryByText("No periods available yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("retains the loaded result with a local retry when a refresh fails", () => {
    const refetch = vi.fn();
    state.journals = { data: [periodRow(2, "Week 4", "2026-10-10", 86, 117)], isLoading: false, isError: true, refetch };
    renderDashboard();
    expect(screen.getByTestId("latest-result-score").textContent).toContain("86/ 117");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("has exactly one formula tooltip on the whole page", () => {
    state.journals = { data: [periodRow(2, "Week 4", "2026-10-10", 86, 117)], isLoading: false, isError: false, refetch: vi.fn() };
    renderDashboard();
    expect(screen.getAllByRole("button", { name: /Total score is the sum/ })).toHaveLength(1);
  });
});

describe("StudentDashboard profile failures", () => {
  it("shows an error with a working retry and never invents zero metrics after an initial failure", () => {
    const refetch = vi.fn();
    state.profile = { data: undefined, isLoading: false, isError: true, refetch };
    const { container } = renderDashboard();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\b0\b/);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the loaded profile and offers a retry when a refresh fails", () => {
    const refetch = vi.fn();
    state.profile = { ...profile([courseEntry(1, "Physics", null)]), isError: true, refetch };
    renderDashboard();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Faridun Nazarov");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows a skeleton while the profile loads", () => {
    state.profile = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    renderDashboard();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Student Dashboard");
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });
});
