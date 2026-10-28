import { afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../i18n";
import { JournalDetail } from "./JournalDetail";
import { useAuthStore } from "../store/authStore";
import { AuthApiError } from "../lib/auth/errors";
import * as courseEndpoints from "../lib/courses/endpoints";
import * as journalEndpoints from "../lib/journals/endpoints";
import * as userEndpoints from "../lib/users/endpoints";
import * as enrollmentEndpoints from "../lib/enrollments/endpoints";
import { formatSchoolLessonDate } from "../i18n/formatters";
import type { CourseResponse, CourseStaffProgressResponse, JournalPeriod } from "../lib/courses/types";
import type { JournalDetailResponse, JournalExamMaxScoreUpdateResponse } from "../lib/journals/types";
import { schoolToday, viewportState } from "./JournalDetailTestState";

export const COURSE_ID = 5;
export const AUGUST = 101;
export const SEPTEMBER = 102;
export const OCTOBER = 103;

export const PERIODS: JournalPeriod[] = [
  { id: AUGUST, course_id: COURSE_ID, period_label: "Month 8", period_start: "2026-08-01", period_end: "2026-08-31", period_type: "month", state: "complete" },
  { id: SEPTEMBER, course_id: COURSE_ID, period_label: "Month 9", period_start: "2026-09-01", period_end: "2026-09-30", period_type: "month", state: "partial" },
  { id: OCTOBER, course_id: COURSE_ID, period_label: "Month 10", period_start: "2026-10-01", period_end: "2026-10-31", period_type: "month", state: "partial" },
];

export const LESSONS: Record<number, string[]> = {
  [AUGUST]: ["2026-08-04", "2026-08-11"],
  [SEPTEMBER]: ["2026-09-01", "2026-09-08"],
  [OCTOBER]: ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"],
};

export function buildCourse(overrides: Partial<CourseResponse> = {}): CourseResponse {
  return {
    id: COURSE_ID,
    title: "Algebra Intensive",
    description: "",
    photo_path: null,
    start_date: "2026-08-01",
    end_date: "2026-12-31",
    exam_type: "monthly",
    price: "100.00",
    mentor_id: 77,
    status: "active",
    is_deleted: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function buildJournal(journalId: number): JournalDetailResponse {
  const period = PERIODS.find((candidate) => candidate.id === journalId) as JournalPeriod;
  const dates = LESSONS[journalId];
  const student = (id: number, first: string) => ({
    student_id: id,
    first_name: first,
    last_name: "Tester",
    email: `${first}@example.com`,
    color_hex: "",
    entries: dates.map((date, index) => ({
      id: id * 1000 + journalId + index,
      lesson_date: date,
      attendance: false,
      score: 0,
      comment: null,
      has_comment: false,
      is_graded: false,
      version: 1,
    })),
    summary: {
      id: id * 100 + journalId,
      journal_id: journalId,
      student_id: id,
      homework_score: 0,
      attendance_score: 0,
      exam_score: 0,
      bonus_score: 0,
      sum_score: 0,
      max_period_score: 100,
      percentage: 0,
      attendance_count: 0,
      total_lessons: dates.length,
      version: 1,
    },
  });
  return {
    journal_id: journalId,
    course_id: COURSE_ID,
    period_label: period.period_label,
    period_start: period.period_start,
    period_end: period.period_end,
    period_type: "month",
    exam_max_score: 100,
    lesson_dates: dates,
    students: [student(11, "Anvar"), student(12, "Bahor")],
  };
}

export function staffResult(periodId: number, score: number | null, maxScore: number | null, percentage: number | null) {
  return { period_id: periodId, grading_state: "missing" as const, score, max_score: maxScore, percentage };
}

export function buildStaffProgress(): CourseStaffProgressResponse {
  return {
    course_id: COURSE_ID,
    periods: PERIODS.map((period) => ({
      id: period.id,
      period_label: period.period_label,
      period_start: period.period_start,
      period_end: period.period_end,
    })),
    students: [
      {
        student_id: 11,
        first_name: "Anvar",
        last_name: "Tester",
        grading_provenance: "unknown",
        period_results: [staffResult(AUGUST, 18, 24, 75), staffResult(SEPTEMBER, 0, 24, 0), staffResult(OCTOBER, 25, 24.5, 102)],
      },
      {
        student_id: 12,
        first_name: "Bahor",
        last_name: "Tester",
        grading_provenance: "unknown",
        period_results: [staffResult(AUGUST, null, null, null), staffResult(SEPTEMBER, 12, 24, 50), staffResult(OCTOBER, 12, 24, 50)],
      },
    ],
  };
}

export const getCourseMock = vi.mocked(courseEndpoints.getCourse);
export const getCourseJournalsMock = vi.mocked(courseEndpoints.getCourseJournals);
export const getStaffProgressMock = vi.mocked(courseEndpoints.getCourseStaffProgress);
export const getJournalMock = vi.mocked(journalEndpoints.getJournal);
export const batchUpdateMock = vi.mocked(journalEndpoints.batchUpdateJournalEntries);
export const updateSummaryMock = vi.mocked(journalEndpoints.updateJournalStudentSummary);
export const updateExamMaxMock = vi.mocked(journalEndpoints.updateJournalExamMaxScore);
export const getMentorProfileMock = vi.mocked(userEndpoints.getMentorProfile);
export const listEnrollmentsMock = vi.mocked(enrollmentEndpoints.listEnrollments);

export let router: ReturnType<typeof createMemoryRouter>;

export function renderWorkspace(entries: string[] = [`/journals/${COURSE_ID}`], index: number = entries.length - 1) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  router = createMemoryRouter(
    [
      { path: "/journals", element: createElement("div", null, "hub page") },
      { path: "/students/:id", element: createElement("div", null, "student profile page") },
      { path: "/journals/:id", element: createElement(JournalDetail) },
    ],
    { initialEntries: entries, initialIndex: index },
  );
  return render(createElement(QueryClientProvider, { client: queryClient }, createElement(RouterProvider, { router })));
}

export function periodPicker(): HTMLElement {
  return screen.getByRole("button", { name: "Period" });
}

export function pickerSummary(): string {
  return periodPicker().textContent ?? "";
}

export function optionTextOf(label: string): string {
  if (!screen.queryByRole("listbox")) fireEvent.click(periodPicker());
  const option: HTMLElement = within(screen.getByRole("listbox")).getByRole("option", { name: new RegExp(`^${label}`) });
  return option.textContent ?? "";
}

export function optionStatusOf(label: string): string | null {
  if (!screen.queryByRole("listbox")) fireEvent.click(periodPicker());
  const option: HTMLElement = within(screen.getByRole("listbox")).getByRole("option", { name: new RegExp(`^${label}`) });
  return option.querySelector("[role='img']")?.getAttribute("aria-label") ?? null;
}

export function choosePeriod(periodId: number): void {
  fireEvent.click(periodPicker());
  const label: string = (PERIODS.find((period) => period.id === periodId) as JournalPeriod).period_label;
  fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: new RegExp(`^${label}`) }));
}

export function periodSettingsButton(): HTMLElement {
  return screen.getByRole("button", { name: "Period settings" });
}

export function gradeCell(name: string, date: string): HTMLElement {
  return screen.getByLabelText(`Score for ${name} Tester on ${formatSchoolLessonDate(date)}`);
}

export async function waitForGrid(): Promise<void> {
  await screen.findByRole("region", { name: /Gradebook grid/ });
}

export function settingsButton(): HTMLElement {
  return periodSettingsButton();
}

export async function openSettings(): Promise<HTMLElement> {
  renderWorkspace();
  await waitForGrid();
  fireEvent.click(settingsButton());
  return screen.findByRole("dialog", { name: "Period settings" });
}

export function maximumInput(): HTMLInputElement {
  return screen.getByLabelText("Exam maximum") as HTMLInputElement;
}

export function saveButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /^(Save|Saving…|Saving pending grades first…)$/ }) as HTMLButtonElement;
}

export function typeMaximum(value: string): void {
  fireEvent.change(maximumInput(), { target: { value } });
}

export function examResponse(examMaximum: number): JournalExamMaxScoreUpdateResponse {
  const detail = buildJournal(OCTOBER);
  return {
    journal: {
      id: OCTOBER,
      course_id: COURSE_ID,
      period_label: detail.period_label,
      period_start: detail.period_start,
      period_end: detail.period_end,
      period_type: "month",
      exam_max_score: examMaximum,
    },
    summaries: detail.students.map((student) => ({
      ...(student.summary as NonNullable<typeof student.summary>),
      journal_id: OCTOBER,
      student_id: student.student_id,
      max_period_score: 24 + examMaximum,
      version: 2,
    })),
  };
}

export function gradeAnvar(): void {
  const cell = gradeCell("Anvar", "2026-10-13");
  cell.focus();
  fireEvent.keyDown(cell, { key: "4" });
}

beforeEach(() => {
  updateExamMaxMock.mockImplementation(async (_journalId, payload) => examResponse(payload.exam_max_score ?? 100));
});

export function registerJournalDetailHooks(): void {
  beforeEach(async () => {
    vi.clearAllMocks();
    schoolToday.value = "2026-10-15";
    viewportState.desktop = true;
    await i18n.changeLanguage("en");
    useAuthStore.setState({ role: "superadmin" });
    getCourseMock.mockResolvedValue(buildCourse());
    getCourseJournalsMock.mockResolvedValue(PERIODS);
    getStaffProgressMock.mockResolvedValue(buildStaffProgress());
    getJournalMock.mockImplementation(async (journalId: number) => buildJournal(journalId));
    getMentorProfileMock.mockRejectedValue(new AuthApiError(404, "none"));
    listEnrollmentsMock.mockResolvedValue({ items: [], total: 2, page: 1, page_size: 1, total_pages: 2 });
    batchUpdateMock.mockImplementation(async (_journalId, payload) => ({
      applied: payload.map((item) => ({ ...item, version: item.version + 1 })),
      conflicts: [],
      summaries: [],
    }));
  });

  afterEach(() => cleanup());
}
