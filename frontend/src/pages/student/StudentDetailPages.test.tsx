import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "../../i18n";
import { MyCourseDetail } from "./MyCourseDetail";
import type { CourseStaffProgressResponse } from "../../lib/courses/types";
import type { JournalDetailResponse, JournalStudentResponse } from "../../lib/journals/types";

const state = vi.hoisted(() => ({
  course: {} as Record<string, unknown>,
  profile: {} as Record<string, unknown>,
  periods: {} as Record<string, unknown>,
  progress: {} as Record<string, unknown>,
  courseJournals: {} as Record<string, unknown>,
  scopedJournal: {} as Record<string, unknown>,
}));

vi.mock("../../lib/courses/hooks", () => ({
  useCourse: () => state.course,
  useCourseSchedule: () => ({ data: [] }),
  useCourseClassProgress: () => state.progress,
  useCourseStaffProgress: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useCourseJournals: () => state.courseJournals,
}));
vi.mock("../../lib/users/hooks", () => ({
  useMyStudentProfile: () => state.profile,
  useMyStudentJournals: () => state.periods,
  useMentorProfile: () => ({ data: { user: { first_name: "Demo", last_name: "Mentor" } }, isLoading: false }),
}));
vi.mock("../../lib/journals/hooks", () => ({ useScopedJournal: () => state.scopedJournal }));
vi.mock("../../store/authStore", () => ({ useAuthStore: (select: (value: { userId: number }) => unknown) => select({ userId: 42 }) }));

const classmates = ["Shahnoza Mansurova", "Nozima Yusupova"];

const progress: CourseStaffProgressResponse = {
  course_id: 4,
  periods: [{ id: 16, period_label: "Week 5", period_start: "2026-08-29", period_end: "2026-08-31" }],
  students: [
    { student_id: 42, first_name: "Demo", last_name: "Student", grading_provenance: "unknown", period_results: [{ period_id: 16, grading_state: "unknown", score: 86, max_score: 117, percentage: 73.5 }] },
    ...classmates.map((name, index) => ({
      student_id: 1 + index,
      first_name: name.split(" ")[0],
      last_name: name.split(" ")[1],
      grading_provenance: "unknown" as const,
      period_results: [{ period_id: 16, grading_state: "unknown" as const, score: 100, max_score: 117, percentage: 85 }],
    })),
  ],
};

function journalStudent(id: number, firstName: string, lastName: string, isSelf: boolean): JournalStudentResponse {
  return {
    student_id: id, first_name: firstName, last_name: lastName, color_hex: "#123456", is_self: isSelf,
    entries: [{ id: id, lesson_date: "2026-08-29", attendance: true, score: 4, comment: isSelf ? "Keep going" : null, has_comment: isSelf, version: 1 }],
    summary: { id, homework_score: 20, attendance_score: 2, exam_score: 60, bonus_score: 4, sum_score: 86, max_period_score: 117, percentage: 73.5, attendance_count: 1, total_lessons: 1, version: 1 },
  };
}

const classJournal: JournalDetailResponse = {
  journal_id: 16, course_id: 4, period_label: "Week 5", period_start: "2026-08-29", period_end: "2026-08-31", period_type: "week", exam_max_score: 90,
  lesson_dates: ["2026-08-29", "2026-08-31"],
  students: [journalStudent(1, "Shahnoza", "Mansurova", false), journalStudent(42, "Demo", "Student", true), journalStudent(2, "Nozima", "Yusupova", false)],
};

function renderCourse(path = "/my/courses/4") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/my/courses/:courseId" element={<MyCourseDetail />} /></Routes>
    </MemoryRouter>,
  );
}

const periodRows = [{ journal_id: 16, course_id: 4, course_title: "Web", period_label: "Week 5", period_start: "2026-08-29", period_end: "2026-08-31", homework_score: 20, attendance_score: 2, exam_score: 60, bonus_score: 4, sum_score: 86, max_period_score: 117, percentage: 73.5, attendance_count: 1, total_lessons: 2, state: "graded" }];

beforeEach(async () => {
  await i18n.changeLanguage("ru");
  state.course = { data: { id: 4, title: "Web Frontend", description: "About the course", photo_path: null, start_date: "2026-08-01", end_date: "2026-08-31", mentor_id: 7, status: "active" }, isLoading: false, isError: false, refetch: vi.fn() };
  state.profile = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [{ course: { id: 4 }, bucket: "active", my_total_score: 86, my_total_max_score: 117, my_rank: 9, class_size: 9, class_avg_percentage: 58.4 }] } };
  state.periods = { data: periodRows, isLoading: false, isError: false, refetch: vi.fn() };
  state.progress = { data: progress, isLoading: false, isError: false, refetch: vi.fn() };
  state.courseJournals = { data: [{ id: 16, course_id: 4, period_label: "Week 5", period_start: "2026-08-29", period_end: "2026-08-31", period_type: "week" }], isLoading: false, isError: false, refetch: vi.fn() };
  state.scopedJournal = { data: classJournal, isLoading: false, isError: false, isPlaceholderData: false, refetch: vi.fn() };
});
afterEach(cleanup);

describe("student course page journal", () => {
  it("shows the read-only class journal with classmates, own row first, no ranking and no comments of others", () => {
    renderCourse();
    const rows: HTMLElement[] = screen.getAllByRole("row").slice(1);
    expect(rows[0].getAttribute("data-self")).toBe("true");
    expect(rows[0].textContent).toContain("Demo Student");
    const text: string = document.body.textContent ?? "";
    for (const name of classmates) expect(text).toContain(name);
    expect(text).not.toContain("Private note");
    expect(text).not.toMatch(/Ранг|9 из 9/);
    expect(document.querySelectorAll("input, textarea, [data-control]")).toHaveLength(0);
  });

  it("keeps the progress chart collapsed by default", () => {
    renderCourse();
    expect(screen.getByTestId("progress-collapse-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelectorAll("[data-testid='chart-series-student']")).toHaveLength(0);
  });
});

describe("student course page", () => {
  it("leads with score over maximum with the percentage muted and no card around a card", () => {
    const { container } = renderCourse();
    const tile = container.querySelector("[data-stat-tile]") as HTMLElement;
    expect(tile.textContent).toContain("86/ 117");
    expect(tile.querySelector("[data-score-percentage]")?.className).toContain("text-muted");
    expect(container.querySelectorAll("[data-stat-group]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-page-container]")).toHaveLength(1);
  });

  it("no longer renders the study periods list", () => {
    renderCourse();
    expect(screen.queryByTestId("period-list")).toBeNull();
  });

  it("uses an initial tile for a course without a photo", () => {
    const { container } = renderCourse();
    expect(container.querySelectorAll("[data-initial-tile]")).toHaveLength(1);
  });

  it("offers a working retry when the course fails to load", () => {
    const refetch = vi.fn();
    state.course = { data: undefined, isLoading: false, isError: true, error: new Error("boom"), refetch };
    renderCourse();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an explained empty state for a malformed course id", () => {
    renderCourse("/my/courses/abc");
    expect(screen.getByText("Курс не найден")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
