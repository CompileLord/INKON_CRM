import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { AuthApiError, NetworkError } from "../lib/auth/errors";
import { useAuthStore } from "../store/authStore";
import { StudentProfile } from "./StudentProfile";
import { formatNumber } from "../i18n/formatters";
import * as userHooks from "../lib/users/hooks";
import * as userEndpoints from "../lib/users/endpoints";
import * as courseEndpoints from "../lib/courses/endpoints";
import * as documentEndpoints from "../lib/documents/endpoints";
import * as enrollmentEndpoints from "../lib/enrollments/endpoints";
import * as enrollmentHooks from "../lib/enrollments/hooks";
import type { StudentJournalPeriod, StudentProfileResponse, User } from "../lib/users/types";
import type { CourseStaffProgressResponse } from "../lib/courses/types";
import type { EnrollmentResponse } from "../lib/enrollments/types";

const mockStudentUser: User = {
  id: 42,
  email: "student42@example.com",
  first_name: "Rustam",
  last_name: "Karimov",
  role: "student",
  phone: "+992900000042",
  parent_phone: "+992900000043",
  date_of_birth: "2007-05-15",
  payment_day_of_month: 15,
  parent_telegram_chat_id: null,
  is_deleted: false,
  must_set_password: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  photo_path: null,
  thumbnail_path: null,
  raw_password: null,
};

const mockProfileResponse: StudentProfileResponse = {
  user: mockStudentUser,
  totals: {
    avg_percentage: 87.5,
    attendance_percentage: 92,
    absences: 2,
    total_lessons: 24,
    active_course_count: 2,
    archived_course_count: 0,
  },
  avg_score: 87.5,
  absences: 2,
  total_lessons: 24,
  performance: {
    scope: "all_recorded_student_period_summaries",
    measured_population: "all_recorded_student_period_summaries",
    denominator_basis: "stored_period_total_lessons",
    grading_state: "unknown",
    grading_provenance: "unknown",
    raw_avg_percentage: 87.5,
    attendance_percentage: 91.66666666666667,
    attendance_denominator: 24,
    attended_lessons: 22,
    absences: 2,
    total_lessons: 24,
    period_summaries_count: 6,
    periods_with_max_score_count: 4,
  },
  courses: [
    {
      course: {
        id: 101,
        title: "Advanced Mathematics",
        description: "Math course",
        photo_path: null,
        start_date: "2026-01-10",
        end_date: "2026-06-10",
        exam_type: "weekly",
        price: "450.00",
        mentor_id: 7,
        status: "active",
        is_deleted: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      enrollment_status: "active",
      bucket: "active",
      my_avg_percentage: 90,
      attendance_percentage: 95,
      absences: 1,
      periods_total: 4,
      periods_graded: 4,
      my_rank: 1,
      class_size: 15,
      class_avg_percentage: 82,
      next_lesson_at: "2026-03-01T10:00:00Z",
      performance: {
        scope: "single_course",
        measured_population: "single_course_recorded_period_summaries",
        denominator_basis: "stored_period_total_lessons",
        grading_state: "unknown",
        grading_provenance: "unknown",
        raw_avg_percentage: 90,
        attendance_percentage: 95,
        attendance_denominator: 12,
        attended_lessons: 11,
        absences: 1,
        total_lessons: 12,
        period_summaries_count: 4,
        periods_with_max_score_count: 3,
      },
    },
    {
      course: {
        id: 102,
        title: "English Literature",
        description: "English course",
        photo_path: null,
        start_date: "2026-02-01",
        end_date: "2026-07-01",
        exam_type: "monthly",
        price: "350.00",
        mentor_id: 99,
        status: "archived",
        is_deleted: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      enrollment_status: "active",
      bucket: "archive",
      my_avg_percentage: 85,
      attendance_percentage: 88,
      absences: 1,
      periods_total: 2,
      periods_graded: 2,
      my_rank: 3,
      class_size: 12,
      class_avg_percentage: 80,
      next_lesson_at: null,
      performance: {
        scope: "single_course",
        measured_population: "single_course_recorded_period_summaries",
        denominator_basis: "stored_period_total_lessons",
        grading_state: "unknown",
        grading_provenance: "unknown",
        raw_avg_percentage: 85,
        attendance_percentage: 88,
        attendance_denominator: 12,
        attended_lessons: 11,
        absences: 1,
        total_lessons: 12,
        period_summaries_count: 2,
        periods_with_max_score_count: 1,
      },
    },
  ],
};

function staffProgressFixture(courseId: number): CourseStaffProgressResponse {
  return {
    course_id: courseId,
    periods: [
      { id: courseId * 10 + 1, period_label: "Week 1", period_start: "2026-01-12", period_end: "2026-01-18" },
      { id: courseId * 10 + 2, period_label: "Week 2", period_start: "2026-01-19", period_end: "2026-01-25" },
      { id: courseId * 10 + 3, period_label: "Week 3", period_start: "2026-01-26", period_end: "2026-02-01" },
    ],
    students: [
      {
        student_id: 42,
        first_name: "Rustam",
        last_name: "Karimov",
        grading_provenance: "unknown",
        period_results: [
          { period_id: courseId * 10 + 1, grading_state: "unknown", score: 8, max_score: 10, percentage: courseId === 101 ? 80 : 70 },
          { period_id: courseId * 10 + 2, grading_state: "unknown", score: 9, max_score: 10, percentage: courseId === 101 ? 90 : 75 },
          { period_id: courseId * 10 + 3, grading_state: "missing", score: null, max_score: null, percentage: null },
        ],
      },
    ],
  };
}

const ownJournalsFixture: StudentJournalPeriod[] = [101, 102].flatMap((courseId) =>
  [1, 2].map((weekNumber) => ({
    journal_id: courseId * 10 + weekNumber,
    course_id: courseId,
    course_title: courseId === 101 ? "Advanced Mathematics" : "English Literature",
    period_label: `Week ${weekNumber}`,
    period_start: `2026-01-${10 + weekNumber * 7}`,
    period_end: `2026-01-${16 + weekNumber * 7}`,
    sum_score: 8,
    max_period_score: 10,
    percentage: 60 + weekNumber * 10 + (courseId === 101 ? 5 : 0),
    attendance_count: 3,
    total_lessons: 3,
    state: "graded" as const,
  })),
);

function renderStudentProfile(
  initialEntries: string[] | { pathname: string; state?: unknown }[] = ["/students/42"],
  strictMode = false,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const renderedView = render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={initialEntries as never}>
          <Routes>
            <Route path="/students/:id" element={strictMode ? <StrictMode><StudentProfile /></StrictMode> : <StudentProfile />} />
            <Route path="/students" element={<div data-testid="students-dir">Students Directory</div>} />
            <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
            <Route path="/my/courses" element={<div data-testid="my-courses-page">My Courses</div>} />
            <Route path="/courses/:id" element={<CourseReturnPage />} />
            <Route path="/" element={<div data-testid="root-dashboard">Root Dashboard</div>} />
          </Routes>
          <ProfileRouteSwitch />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { ...renderedView, queryClient };
}

function ProfileRouteSwitch() {
  const navigate = useNavigate();
  return <><button data-testid="switch-profile" onClick={() => navigate("/students/43")}>Switch profile</button><button data-testid="return-profile" onClick={() => navigate(-1)}>Return profile</button></>;
}

function CourseReturnPage() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Return to profile</button>;
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useAuthStore.setState({ role: "superadmin", userId: 1 });
  vi.spyOn(courseEndpoints, "getCourseStaffProgress").mockImplementation(async (courseId: number) => staffProgressFixture(courseId));
  vi.spyOn(userEndpoints, "getMyStudentJournals").mockResolvedValue(ownJournalsFixture);
  vi.spyOn(documentEndpoints, "fetchDocuments").mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 });
  vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => {
    return {
      data: mockProfileResponse,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudentProfile Component", () => {
  it("renders superadmin identity row, summary strip, and authorized course links", () => {
    renderStudentProfile();

    expect(screen.getAllByText("Rustam Karimov").length).toBeGreaterThan(0);
    expect(screen.getAllByText("student42@example.com").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /\+992900000042/ }).getAttribute("href")).toBe("tel:+992900000042");
    expect(screen.queryByText("+992900000043")).toBeNull();
    expect(screen.queryByText(/Guardian phone:/i)).toBeNull();
    expect(screen.queryByText(/Parent phone:/i)).toBeNull();

    const backLink = screen.getByRole("link", { name: /Back to Students/i });
    expect(backLink).toBeDefined();
    expect(backLink.getAttribute("href")).toBe("/students");

    const editBtn = screen.getByRole("button", { name: /^Edit$/i });
    expect(editBtn).toBeDefined();

    expect(screen.getByText("87.5")).toBeDefined();
    expect(screen.getByText("Average")).toBeDefined();
    expect(screen.queryByText(/unverified/i)).toBeNull();

    const mathLink = screen.getByRole("link", { name: "Advanced Mathematics" });
    expect(mathLink.getAttribute("href")).toBe("/courses/101");

    const englishLink = screen.getByRole("link", { name: "English Literature" });
    expect(englishLink.getAttribute("href")).toBe("/courses/102");
  });

  it.each([
    [0, "0.0"],
    [87.5, "87.5"],
    [123.456, "123.5"],
  ])("shows the stored raw score %s with one localized decimal", (rawAverage, expected) => {
    const response = { ...mockProfileResponse, performance: { ...mockProfileResponse.performance!, raw_avg_percentage: rawAverage } };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
      data: response,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    expect(screen.getByText(expected)).toBeDefined();
    expect(screen.getByText("Average")).toBeDefined();
  });

  it("preserves a stored zero when the recorded maximum-score count is zero", () => {
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
      data: {
        ...mockProfileResponse,
        performance: { ...mockProfileResponse.performance!, raw_avg_percentage: 0, periods_with_max_score_count: 0, period_summaries_count: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    expect(screen.getByText("0.0")).toBeDefined();
    expect(screen.getByText("Average")).toBeDefined();
  });

  it.each(["en", "ru", "tg"] as const)("localizes profile metrics and translated values for locale %s", async (locale) => {
    const user = userEvent.setup();
    const response = {
      ...mockProfileResponse,
      performance: { ...mockProfileResponse.performance!, raw_avg_percentage: 1234.5, absences: 0, total_lessons: 0, attendance_denominator: 0 },
    };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
      data: response,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    await i18n.changeLanguage(locale);
    renderStudentProfile();
    const localizedScore = formatNumber(1234.5, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/\u00a0/g, " ");
    expect(screen.getAllByText((_content, element) => element?.tagName === "P" && (element.textContent ?? "").replace(/\u00a0/g, " ") === localizedScore).length).toBeGreaterThan(0);
    const absencesLabel = i18n.t("students:stats.absencesOf", { lng: locale, absences: formatNumber(0, locale), total: formatNumber(0, locale) });
    expect(screen.getAllByText(absencesLabel).length).toBeGreaterThan(0);
    const currencySuffix = i18n.t("students:currencyTjs", { lng: locale });
    expect(screen.getAllByText((_content, element) => element?.tagName === "SPAN" && (element.textContent ?? "").includes(currencySuffix)).length).toBeGreaterThan(0);
    expect(screen.getByText(i18n.t("students:stats.attendance", { lng: locale })).closest("div")?.parentElement?.textContent).toContain(i18n.t("students:attendanceUnavailable", { lng: locale }));
    await user.click(screen.getByRole("tab", { name: i18n.t("students:performanceTab", { lng: locale }) }));
    expect(await screen.findByRole("heading", { name: i18n.t("students:progress.title", { lng: locale }) })).toBeDefined();
    await i18n.changeLanguage("en");
  });

  it("uses unavailable labels when the profile has no stored performance contract", () => {
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
      data: { ...mockProfileResponse, performance: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    expect(screen.getByText("Score unavailable", { selector: ".sr-only" }).parentElement?.querySelector('[aria-hidden="true"]')?.textContent).toBe("—");
    expect(screen.getAllByText("Attendance unavailable").length).toBeGreaterThan(0);
  });

  it.each(["en", "ru", "tg"] as const)("distinguishes compact missing score from true zero and bonus scores in %s", async (locale) => {
    await i18n.changeLanguage(locale);
    for (const rawAverage of [null, 0, 123.456]) {
      vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: { ...mockProfileResponse, performance: { ...mockProfileResponse.performance!, raw_avg_percentage: rawAverage } }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
      renderStudentProfile();
      if (rawAverage === null) {
        const missingValue = screen.getByText(i18n.t("students:scoreUnavailable"), { selector: ".sr-only" }).parentElement?.querySelector('[aria-hidden="true"]');
        expect(missingValue?.textContent).toBe(i18n.t("students:missingScoreValue"));
        expect(missingValue?.textContent).not.toBe(formatNumber(0, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
      } else {
        const expectedScore = formatNumber(rawAverage, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        expect(screen.getByText(expectedScore)).toBeDefined();
        expect(screen.queryByText(i18n.t("students:scoreUnavailable"), { selector: ".sr-only" })).toBeNull();
      }
      expect(screen.getByText(i18n.t("students:stats.average"))).toBeDefined();
      cleanup();
    }
  });

  it("handles contextual edit trigger opening StudentFormPanel", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const editBtn = screen.getByRole("button", { name: /^Edit$/i });
    await user.click(editBtn);

    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("clears owner-bound edit state and resets the selected tab when the profile route changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({ data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42 } }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    expect(screen.getByRole("dialog")).toBeDefined();
    await user.click(screen.getByTestId("switch-profile"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("tab", { name: "Courses" }).getAttribute("aria-selected")).toBe("true");
  });

  it("stops a deferred delete chain after the profile owner changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    let resolveEnrollments: ((items: EnrollmentResponse[]) => void) | undefined;
    const fetchSpy = vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockImplementation(
      () => new Promise((resolve) => { resolveEnrollments = resolve; }),
    );
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);
    const deleteMutateAsync = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteMutateAsync,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    renderStudentProfile();
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await user.click(screen.getByTestId("switch-profile"));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Delete Student/i })).toBeNull());
    await act(async () => {
      resolveEnrollments?.([{ id: 501, student_id: 42, course_id: 101, status: "active" } as unknown as EnrollmentResponse]);
    });
    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("New Owner Karimov")).toBeDefined();
  });

  it("does not revive an abandoned delete after leaving and returning to the same profile", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    let resolveEnrollments: ((items: EnrollmentResponse[]) => void) | undefined;
    const fetchSpy = vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockImplementation(
      () => new Promise((resolve) => { resolveEnrollments = resolve; }),
    );
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);
    const deleteMutateAsync = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteMutateAsync,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    renderStudentProfile();
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await user.click(screen.getByTestId("switch-profile"));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Delete Student/i })).toBeNull());
    await user.click(screen.getByTestId("return-profile"));
    await waitFor(() => expect(screen.getByText("Rustam Karimov")).toBeDefined());
    await act(async () => {
      resolveEnrollments?.([{ id: 501, student_id: 42, course_id: 101, status: "active" } as unknown as EnrollmentResponse]);
    });
    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Rustam Karimov")).toBeDefined();
  });

  it("does not replay navigation after an abandoned successful delete", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([]);
    let resolveDeletion: ((value: boolean) => void) | undefined;
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);
    const deleteMutateAsync = vi.fn(() => new Promise<boolean>((resolve) => { resolveDeletion = resolve; }));
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteMutateAsync,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    renderStudentProfile();
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledWith(42));
    await user.click(screen.getByTestId("switch-profile"));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Delete Student/i })).toBeNull());
    await user.click(screen.getByTestId("return-profile"));
    await waitFor(() => expect(screen.getByText("Rustam Karimov")).toBeDefined());
    await act(async () => {
      resolveDeletion?.(true);
    });
    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(deleteMutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("students-dir")).toBeNull();
    expect(screen.getByText("Rustam Karimov")).toBeDefined();
  });

  it("stops after a committed withdrawal when its operation owner was abandoned", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([
      { id: 501, student_id: 42, course_id: 101, status: "active" },
      { id: 502, student_id: 42, course_id: 102, status: "active" },
    ] as EnrollmentResponse[]);
    let resolveWithdrawal: ((item: EnrollmentResponse) => void) | undefined;
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockImplementation(
      () => new Promise((resolve) => { resolveWithdrawal = resolve; }),
    );
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const deleteMutateAsync = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteMutateAsync,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    renderStudentProfile();
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(withdrawSpy).toHaveBeenCalledWith(501));
    await user.click(screen.getByTestId("switch-profile"));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Delete Student/i })).toBeNull());
    await user.click(screen.getByTestId("return-profile"));
    await waitFor(() => expect(screen.getByText("Rustam Karimov")).toBeDefined());
    await act(async () => {
      resolveWithdrawal?.({ id: 501, student_id: 42, course_id: 101, status: "withdrawn" } as EnrollmentResponse);
    });
    expect(withdrawSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["enrollments"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["users", "students", "profile", 42] });
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Rustam Karimov")).toBeDefined();
  });

  it("does not revive an abandoned delete after an auth owner ABA transition", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    let resolveEnrollments: ((items: EnrollmentResponse[]) => void) | undefined;
    const fetchSpy = vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockImplementation(
      () => new Promise((resolve) => { resolveEnrollments = resolve; }),
    );
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);
    const deleteMutateAsync = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteMutateAsync,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    renderStudentProfile();
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    act(() => {
      useAuthStore.setState({ userId: 2 });
      useAuthStore.setState({ userId: 1 });
    });
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Delete Student/i })).toBeNull());
    await waitFor(() => expect(screen.getByText("Rustam Karimov")).toBeDefined());
    await act(async () => {
      resolveEnrollments?.([{ id: 501, student_id: 42, course_id: 101, status: "active" } as unknown as EnrollmentResponse]);
    });
    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Rustam Karimov")).toBeDefined();
  });

  it("keeps a new deletion pending when an abandoned operation finishes", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    const enrollmentResolvers: ((items: EnrollmentResponse[]) => void)[] = [];
    const fetchSpy = vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockImplementation(
      () => new Promise((resolve) => { enrollmentResolvers.push(resolve); }),
    );
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);
    const deleteMutateAsync = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteMutateAsync,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    renderStudentProfile();
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await user.click(screen.getByTestId("switch-profile"));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Delete Student/i })).toBeNull());
    await user.click(screen.getByTestId("return-profile"));
    await waitFor(() => expect(screen.getByText("Rustam Karimov")).toBeDefined());
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    await act(async () => {
      enrollmentResolvers[0]?.([{ id: 501, student_id: 42, course_id: 101, status: "active" } as unknown as EnrollmentResponse]);
    });
    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    const confirmButton = screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0];
    expect(confirmButton.hasAttribute("disabled")).toBe(true);
    await act(async () => { enrollmentResolvers[1]?.([]); });
    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledTimes(1));
    expect(deleteMutateAsync).toHaveBeenCalledWith(42);
    expect(screen.getByTestId("students-dir")).toBeDefined();
  });

  it("keeps the identity form open after deferred photo save and Cancel discards only the dirty identity", async () => {
    const user = userEvent.setup();
    let resolveUpload: ((student: User) => void) | undefined;
    vi.spyOn(userEndpoints, "uploadAvatar").mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve; }));
    const updateUserMutateAsync = vi.fn();
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({
      mutateAsync: updateUserMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useUpdateUser>);
    const refetch = vi.fn();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
      data: mockProfileResponse,
      isLoading: false,
      isError: false,
      refetch,
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:deferred-profile-photo");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
    renderStudentProfile();
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    const firstName = screen.getByLabelText(/First Name/i);
    await user.clear(firstName);
    await user.type(firstName, "Dirty Name");
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "avatar.jpg", { type: "image/jpeg" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await waitFor(() => expect(resolveUpload).toBeDefined());
    await act(async () => {
      resolveUpload?.({ ...mockStudentUser, photo_path: "/uploads/saved-photo.jpg", thumbnail_path: "/uploads/saved-thumb.jpg" });
    });
    expect(screen.getByRole("dialog")).toBeDefined();
    expect((screen.getByLabelText(/First Name/i) as HTMLInputElement).value).toBe("Dirty Name");
    expect(refetch).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(updateUserMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /Edit Student/i })).toBeNull();
  });

  it("suppresses a deferred identity-save callback after the route owner changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    let resolveUpdate: ((student: User) => void) | undefined;
    const mutateAsync = vi.fn(() => new Promise<User>((resolve) => { resolveUpdate = resolve; }));
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useUpdateUser>);
    renderStudentProfile();
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    const firstName = screen.getByLabelText(/First Name/i);
    await user.clear(firstName);
    await user.type(firstName, "Saved Late");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await user.click(screen.getByTestId("switch-profile"));
    expect(screen.getByText("New Owner Karimov")).toBeDefined();
    await act(async () => resolveUpdate?.({ ...mockStudentUser, first_name: "Saved Late" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Student updated successfully")).toBeNull();
  });

  it.each(["withdrawal", "account"] as const)("reconciles committed withdrawals and reports a partial %s failure", async (failureStage) => {
    const user = userEvent.setup();
    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([
      { id: 501, student_id: 42, course_id: 101, status: "active" },
      { id: 502, student_id: 42, course_id: 102, status: "active" },
    ] as EnrollmentResponse[]);
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);
    if (failureStage === "withdrawal") withdrawSpy.mockResolvedValueOnce({} as never).mockRejectedValueOnce(new Error("withdrawal failed"));
    const deleteMutateAsync = vi.fn().mockRejectedValue(new Error("account deletion failed"));
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({ mutateAsync: deleteMutateAsync } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    renderStudentProfile();
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await screen.findByText(i18n.t("students:form.deleteFailedAfterWithdraw"));
    expect(withdrawSpy).toHaveBeenCalledTimes(2);
    expect(deleteMutateAsync).toHaveBeenCalledTimes(failureStage === "account" ? 1 : 0);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["enrollments"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["users", "students", "profile", 42] });
    expect(screen.queryByTestId("students-dir")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0].hasAttribute("disabled")).toBe(false);
  });

  it("allows a current-owner deletion after StrictMode effect remount", async () => {
    const user = userEvent.setup();
    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([]);
    const deleteMutateAsync = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({ mutateAsync: deleteMutateAsync } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    renderStudentProfile(["/students/42"], true);
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledWith(42));
    expect(screen.getByTestId("students-dir")).toBeDefined();
  });

  it("handles superadmin deletion workflow with enrollment withdrawal and navigation", async () => {
    const user = userEvent.setup();
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);
    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([
      { id: 501, student_id: 42, course_id: 101, status: "active" },
    ] as unknown as EnrollmentResponse[]);
    const deleteMutateAsync = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteMutateAsync,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);

    renderStudentProfile();

    const actionsBtn = screen.getAllByRole("button", { name: /Student actions/i })[0];
    await user.click(actionsBtn);

    const deleteMenuItem = await screen.findByRole("menuitem", { name: /Delete/i });
    await user.click(deleteMenuItem);

    const confirmHeading = screen.getByRole("heading", { name: /Delete Student/i });
    expect(confirmHeading).toBeDefined();

    const deleteBtn = screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0];
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(withdrawSpy).toHaveBeenCalledWith(501);
      expect(deleteMutateAsync).toHaveBeenCalledWith(42);
      expect(screen.getByTestId("students-dir")).toBeDefined();
    });
  });

  it("renders mentor view with assigned course links and non-navigable unassigned courses", () => {
    useAuthStore.setState({ role: "mentor", userId: 7 });
    renderStudentProfile();

    expect(screen.queryByRole("button", { name: /^Edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Student actions/i })).toBeNull();

    const mathLink = screen.getByRole("link", { name: "Advanced Mathematics" });
    expect(mathLink.getAttribute("href")).toBe("/courses/101");

    expect(screen.queryByRole("link", { name: "English Literature" })).toBeNull();
    expect(screen.getAllByText("English Literature")).toHaveLength(1);

    const backLink = screen.getByRole("link", { name: /Back to Dashboard/i });
    expect(backLink).toBeDefined();
  });

  it("renders mentor return link to assigned course roster when coming from course", () => {
    useAuthStore.setState({ role: "mentor", userId: 7 });
    renderStudentProfile([
      {
        pathname: "/students/42",
        state: { from: "/courses/101" },
      },
    ]);

    const backLink = screen.getByRole("link", { name: /Back to Course/i });
    expect(backLink).toBeDefined();
    expect(backLink.getAttribute("href")).toBe("/courses/101");
  });

  it("falls back to Dashboard for a journal path whose course ownership cannot be verified", () => {
    useAuthStore.setState({ role: "mentor", userId: 7 });
    renderStudentProfile([{ pathname: "/students/42", state: { from: "/journals/101" } }]);
    expect(screen.getByRole("link", { name: /Back to Dashboard/i }).getAttribute("href")).toBe("/");
  });

  it("shows exactly one status pill per course: the stage, or the enrollment state when it is not active", async () => {
    const user = userEvent.setup();
    const withdrawnProfile: StudentProfileResponse = {
      ...mockProfileResponse,
      courses: [mockProfileResponse.courses[0], { ...mockProfileResponse.courses[1], enrollment_status: "withdrawn" }],
    };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: withdrawnProfile, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();

    expect(screen.queryByText("Enrollment:")).toBeNull();
    const coursePills = screen.getAllByTestId("course-stage-pill");
    expect(coursePills.map((pill) => pill.textContent)).toEqual(["Active", "Withdrawn"]);

    await user.click(screen.getByRole("tab", { name: "Progress" }));
    const rows = await screen.findAllByTestId("course-progress-row");
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.querySelectorAll('[data-testid="course-stage-pill"]')).toHaveLength(1));
  });

  it("renders student self-view with /my/courses links and no management controls", () => {
    useAuthStore.setState({ role: "student", userId: 42 });
    renderStudentProfile([
      {
        pathname: "/students/42",
        state: { from: "/my/courses" },
      },
    ]);

    expect(screen.queryByRole("button", { name: /^Edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Student actions/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Back to Students/i })).toBeNull();

    const backLink = screen.getByRole("link", { name: /Back to My Courses/i });
    expect(backLink).toBeDefined();
    expect(backLink.getAttribute("href")).toBe("/my/courses");

    const mathLink = screen.getByRole("link", { name: "Advanced Mathematics" });
    expect(mathLink.getAttribute("href")).toBe("/my/courses/101");

    const englishLink = screen.getByRole("link", { name: "English Literature" });
    expect(englishLink.getAttribute("href")).toBe("/my/courses/102");
  });

  it("falls back to the Courses tab for malformed profileTab history state", () => {
    renderStudentProfile([{ pathname: "/students/42", state: { profileTab: "not-a-profile-tab" } }]);
    expect(screen.getByRole("tab", { name: "Courses" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Courses" }).hidden).toBe(false);
  });

  it("shows truthful unavailable copy in the account access popover when no plaintext credentials exist", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    await user.click(screen.getByRole("button", { name: "Account Access" }));

    expect(await screen.findByText(/Password credentials are not stored in plaintext/i)).toBeDefined();
  });

  it("resets a revealed password to masked when the account access popover is closed and reopened", async () => {
    const user = userEvent.setup();
    const profileWithRawPassword: StudentProfileResponse = {
      ...mockProfileResponse,
      user: { ...mockStudentUser, raw_password: "InitialPassword123!" },
    };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: profileWithRawPassword, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));

    renderStudentProfile();

    const trigger = screen.getByRole("button", { name: "Account Access" });
    await user.click(trigger);
    expect(await screen.findByText("••••••••")).toBeDefined();
    expect(screen.queryByText("InitialPassword123!")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Show password/i }));
    expect(screen.getByText("InitialPassword123!")).toBeDefined();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("InitialPassword123!")).toBeNull());
    await user.click(trigger);
    expect(await screen.findByText("••••••••")).toBeDefined();
    expect(screen.queryByText("InitialPassword123!")).toBeNull();
  });

  it("hides account access from non-superadmin roles", () => {
    useAuthStore.setState({ role: "mentor", userId: 7 });
    renderStudentProfile();
    expect(screen.queryByRole("button", { name: "Account Access" })).toBeNull();
  });

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

  it("shows the guardian phone only in the header popover and renders one compact meta line", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    expect(screen.queryByText("+992900000043")).toBeNull();
    const trigger = screen.getByRole("button", { name: "Guardian phone" });
    await user.click(trigger);
    const guardianLink = await screen.findByRole("link", { name: "+992900000043" });
    expect(guardianLink.getAttribute("href")).toBe("tel:+992900000043");
    expect(screen.getByRole("link", { name: /student42@example.com/ }).getAttribute("href")).toBe("mailto:student42@example.com");
  });

  it("shows the archived pill beside the name only when the student is not active", () => {
    renderStudentProfile();
    expect(screen.getByRole("heading", { name: "Rustam Karimov" }).parentElement?.textContent).not.toContain("Archived");
    cleanup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: { ...mockProfileResponse, user: { ...mockStudentUser, is_deleted: true } }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    expect(screen.getByRole("heading", { name: "Rustam Karimov" }).parentElement?.textContent).toContain("Archived");
  });

  it("renders three stat tiles with the average provenance in an info tooltip and absences as a ratio", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    const tiles = document.querySelector("[data-profile-summary]") as HTMLElement;
    expect(tiles.children).toHaveLength(3);
    expect(tiles.textContent).toContain("Average");
    expect(tiles.textContent).toContain("92%");
    expect(tiles.textContent).toContain("2 of 24");
    expect(tiles.textContent).not.toContain("/100");
    expect(tiles.textContent).not.toContain("unverified");

    await user.click(screen.getByRole("button", { name: "Average" }));
    expect((await screen.findByRole("tooltip")).textContent).toContain("unverified");
  });

  it("marks attendance unavailable when the stored attendance denominator is zero", () => {
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: { ...mockProfileResponse, performance: { ...mockProfileResponse.performance!, attendance_denominator: 0, attendance_percentage: 91.6 } }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    const tiles = document.querySelector("[data-profile-summary]") as HTMLElement;
    expect(tiles.textContent).not.toContain("92%");
    expect(screen.getByText("Attendance unavailable", { selector: ".sr-only" })).toBeDefined();
  });

  it("renders loading state skeleton with matching geometry", () => {
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => {
      return {
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof userHooks.useStudentProfile>;
    });

    renderStudentProfile();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText(i18n.t("common:loading"))).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Rustam Karimov" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("link", { name: "Advanced Mathematics" })).toBeNull();
  });

  it.each([new NetworkError(), new AuthApiError(503, "Unavailable")])("retains matching loaded identity and tab through transient refresh error %s with a working retry", async (refreshError) => {
    vi.mocked(userHooks.useStudentProfile).mockRestore();
    const getProfile = vi.spyOn(userEndpoints, "getStudentProfile").mockResolvedValueOnce(mockProfileResponse).mockRejectedValueOnce(refreshError).mockResolvedValue(mockProfileResponse);
    const user = userEvent.setup();
    const { queryClient } = renderStudentProfile();
    await screen.findByRole("heading", { name: "Rustam Karimov" });
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["users", "students", "profile", 42] }); });
    expect(screen.getByRole("heading", { name: "Rustam Karimov" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Progress" }).getAttribute("aria-selected")).toBe("true");
    expect((await screen.findByRole("alert")).textContent).toContain(i18n.t("students:profileRefreshError"));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(getProfile).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403, 404])("clears cached identity and dirty edit when refresh returns %s", async (status) => {
    vi.mocked(userHooks.useStudentProfile).mockRestore();
    vi.spyOn(userEndpoints, "getStudentProfile").mockResolvedValueOnce(mockProfileResponse).mockRejectedValueOnce(new AuthApiError(status, "Denied")).mockResolvedValue(mockProfileResponse);
    const user = userEvent.setup();
    const { queryClient } = renderStudentProfile();
    await screen.findByRole("heading", { name: "Rustam Karimov" });
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    await user.type(screen.getByLabelText(/First Name/i), " dirty");
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["users", "students", "profile", 42] }); });
    expect(screen.queryByRole("heading", { name: "Rustam Karimov" })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByText(i18n.t("students:profileRefreshError"))).toBeNull();
    const expectedKind = status === 404 ? "notFound" : "forbidden";
    expect(screen.getByRole("heading", { name: i18n.t(`students:profileState.${expectedKind}Title`) })).toBeDefined();
    expect(screen.getByText(i18n.t(`students:profileState.${expectedKind}Body`))).toBeDefined();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByText("Rustam Karimov")).toBeNull();
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });

  it("shows a distinct not-found state without Retry for an invalid profile id", () => {
    renderStudentProfile(["/students/abc"]);
    expect(screen.getByRole("heading", { name: i18n.t("students:profileState.notFoundTitle") })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows the could-not-load state with Retry and the return link for a 503, and Retry refetches", async () => {
    vi.mocked(userHooks.useStudentProfile).mockRestore();
    const getProfile = vi.spyOn(userEndpoints, "getStudentProfile").mockRejectedValueOnce(new AuthApiError(503, "Unavailable")).mockResolvedValue(mockProfileResponse);
    const user = userEvent.setup();
    renderStudentProfile();
    expect(await screen.findByRole("heading", { name: i18n.t("students:profileState.failedTitle") })).toBeDefined();
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Rustam Karimov" });
    expect(getProfile).toHaveBeenCalledTimes(2);
  });

  it("hides loaded data when the auth owner loses profile ownership", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    act(() => useAuthStore.setState({ role: "student", userId: 43 }));
    expect(screen.queryByRole("heading", { name: "Rustam Karimov" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("retains dirty identity after a successful independent photo save and failed profile refresh, then Cancel discards only identity", async () => {
    vi.mocked(userHooks.useStudentProfile).mockRestore();
    vi.spyOn(userEndpoints, "getStudentProfile").mockResolvedValueOnce(mockProfileResponse).mockRejectedValue(new AuthApiError(503, "Unavailable"));
    const savedPhotoUser = { ...mockStudentUser, photo_path: "/uploads/saved-photo.jpg", thumbnail_path: "/uploads/saved-thumb.jpg" };
    const uploadPhoto = vi.spyOn(userEndpoints, "uploadAvatar").mockResolvedValue(savedPhotoUser);
    const saveIdentity = vi.fn();
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({ mutateAsync: saveIdentity, isPending: false } as unknown as ReturnType<typeof userHooks.useUpdateUser>);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:independent-photo");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
    const user = userEvent.setup();
    const { queryClient } = renderStudentProfile();
    await screen.findByRole("heading", { name: "Rustam Karimov" });
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    const firstName = screen.getByLabelText<HTMLInputElement>(/First Name/i);
    await user.clear(firstName);
    await user.type(firstName, "Dirty Name");
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error("The photo input must exist");
    await user.upload(fileInput, new File([new Uint8Array([0xff, 0xd8, 0xff])], "avatar.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(queryClient.getQueryState(["users", "students", "profile", 42])?.status).toBe("error"));
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Edit Student" })).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>(/First Name/i).value).toBe("Dirty Name");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(saveIdentity).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Edit Student" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Progress" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Rustam Karimov" })).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain(i18n.t("students:profileRefreshError"));
  });

  it("renders error state with functional retry button", async () => {
    const user = userEvent.setup();
    const refetchMock = vi.fn();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => {
      return {
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: refetchMock,
      } as unknown as ReturnType<typeof userHooks.useStudentProfile>;
    });

    renderStudentProfile();

    const retryBtn = screen.getByRole("button", { name: /Retry/i });
    expect(retryBtn).toBeDefined();
    await user.click(retryBtn);

    expect(refetchMock).toHaveBeenCalled();
  });

  it("renders empty courses state explaining no courses are enrolled", () => {
    const emptyCoursesProfile: StudentProfileResponse = {
      ...mockProfileResponse,
      courses: [],
    };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => {
      return {
        data: emptyCoursesProfile,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof userHooks.useStudentProfile>;
    });

    renderStudentProfile();

    expect(screen.getByText(/No courses found/i)).toBeDefined();
    expect(screen.getByText(/This student is not currently enrolled in any course/i)).toBeDefined();
  });

  it("renders creation banner when createdStudentId is passed in location state and dismisses it", async () => {
    const user = userEvent.setup();
    renderStudentProfile([
      {
        pathname: "/students/42",
        state: { createdStudentId: 42 },
      },
    ]);

    expect(screen.getByText(/Student created successfully/i)).toBeDefined();

    const closeBtn = screen.getByRole("button", { name: /Close/i });
    await user.click(closeBtn);

    expect(screen.queryByText(/Student created successfully/i)).toBeNull();
  });
});
