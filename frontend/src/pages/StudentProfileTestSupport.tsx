import { StrictMode } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { useAuthStore } from "../store/authStore";
import { StudentProfile } from "./StudentProfile";
import * as userHooks from "../lib/users/hooks";
import * as userEndpoints from "../lib/users/endpoints";
import * as courseEndpoints from "../lib/courses/endpoints";
import * as documentEndpoints from "../lib/documents/endpoints";
import * as financeApi from "../lib/finance/api";
import type { StudentJournalPeriod, StudentProfileResponse, User } from "../lib/users/types";
import type { CourseStaffProgressResponse } from "../lib/courses/types";


export const mockStudentUser: User = {
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

export const mockProfileResponse: StudentProfileResponse = {
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
      my_total_score: 340,
      my_total_max_score: 400,
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
      my_total_score: 170,
      my_total_max_score: 200,
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

export function staffProgressFixture(courseId: number): CourseStaffProgressResponse {
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

export const ownJournalsFixture: StudentJournalPeriod[] = [101, 102].flatMap((courseId) =>
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

export function renderStudentProfile(
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

export function ProfileRouteSwitch() {
  const navigate = useNavigate();
  return <><button data-testid="switch-profile" onClick={() => navigate("/students/43")}>Switch profile</button><button data-testid="return-profile" onClick={() => navigate(-1)}>Return profile</button></>;
}

export function CourseReturnPage() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Return to profile</button>;
}

export function registerStudentProfileHooks(): void {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useAuthStore.setState({ role: "superadmin", userId: 1 });
    vi.spyOn(courseEndpoints, "getCourseStaffProgress").mockImplementation(async (courseId: number) => staffProgressFixture(courseId));
    vi.spyOn(financeApi, "fetchStudentBalance").mockResolvedValue({ student_id: 42, billed_to_date: "900.00", total_settled: "650.00", net_receivable: "250.00", credit_balance: "0.00", days_overdue: 3 });
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
}
