import { afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type Location } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../i18n";
import { CourseProfile } from "./CourseProfile";
import { useAuthStore } from "../store/authStore";
import * as courseHooks from "../lib/courses/hooks";
import * as enrollmentHooks from "../lib/enrollments/hooks";
import * as userHooks from "../lib/users/hooks";
import type { CourseResponse, CourseScheduleResponse, CourseJournalMetricsResponse, JournalPeriod } from "../lib/courses/types";
import type { User, MentorProfileResponse } from "../lib/users/types";






export function mockSuccessResult<TData>(data: TData): UseQueryResult<TData, Error> {
  return {
    data,
    dataUpdatedAt: 1,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: "idle",
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: true,
    isEnabled: true,
    refetch: vi.fn(),
    status: "success",
    promise: Promise.resolve(data),
  };
}

export function mockErrorResult<TData>(error: unknown): UseQueryResult<TData, Error> {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error: error as Error,
    errorUpdateCount: 1,
    errorUpdatedAt: 1,
    failureCount: 1,
    failureReason: error as Error,
    fetchStatus: "idle",
    isError: true,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: true,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: true,
    isSuccess: false,
    isEnabled: true,
    refetch: vi.fn(),
    status: "error",
    promise: new Promise(() => {}),
  };
}

export const mockCourse: CourseResponse = {
  id: 42,
  title: "Frontend Development Mastery",
  description: "Comprehensive practical curriculum covering TypeScript, React, and CSS architecture.",
  photo_path: "/uploads/frontend-mastery.jpg",
  start_date: "2026-09-01",
  end_date: "2027-05-31",
  exam_type: "monthly",
  price: "1250.00",
  mentor_id: 101,
  status: "active",
  is_deleted: false,
  created_at: "2026-08-15T10:00:00Z",
  updated_at: "2026-08-15T10:00:00Z",
};

export const mockSchedules: CourseScheduleResponse[] = [
  {
    id: 1,
    course_id: 42,
    day_of_week: 0,
    time_start: "09:00:00",
    time_end: "10:30:00",
  },
  {
    id: 2,
    course_id: 42,
    day_of_week: 2,
    time_start: "14:00:00",
    time_end: "15:30:00",
  },
];

export const mockJournals: JournalPeriod[] = [
  {
    id: 5,
    course_id: 42,
    period_label: "Week 1",
    period_start: "2026-01-01",
    period_end: "2026-01-07",
    period_type: "week",
  },
];

export const mockMetrics: CourseJournalMetricsResponse = {
  class_avg_percentage: 84.5,
  attendance_rate: 92.0,
  periods_total: 4,
  periods_complete: 2,
  at_risk_count: 1,
  at_risk_threshold: 60,
};

export const mockMentorUser: User = {
  id: 101,
  first_name: "Farrukh",
  last_name: "Rahimov",
  email: "farrukh@kitob.tj",
  role: "mentor",
  date_of_birth: null,
  phone: "+992900000000",
  parent_telegram_chat_id: null,
  parent_phone: null,
  photo_path: null,
  thumbnail_path: null,
  payment_day_of_month: null,
  must_set_password: false,
  is_deleted: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

export function mentorProfileContractMetadata(avgScore: number): Pick<
  MentorProfileResponse,
  | "active_students_population"
  | "avg_score_grading_state"
  | "avg_score_provenance"
  | "avg_score_basis"
  | "avg_score_summary_count"
  | "avg_score_defined_ratio_count"
  | "avg_score_undefined_ratio_count"
  | "avg_score_defined_ratios_mean"
> {
  return {
    active_students_population: "active_enrollments_on_assigned_courses_including_soft_deleted_courses",
    avg_score_grading_state: "unknown",
    avg_score_provenance: "unknown",
    avg_score_basis: "all_summaries_on_courses_currently_assigned_including_soft_deleted_and_archived",
    avg_score_summary_count: 1,
    avg_score_defined_ratio_count: 1,
    avg_score_undefined_ratio_count: 0,
    avg_score_defined_ratios_mean: avgScore,
  };
}const mockMentorProfile: MentorProfileResponse = {
  ...mentorProfileContractMetadata(85),
  user: mockMentorUser,
  active_courses: [],
  active_students_count: 24,
  avg_score: 85,
};

export function LocationDisplay({ onLocation }: { onLocation: (loc: Location) => void }) {
  const loc = useLocation();
  onLocation(loc);
  return null;
}

export function NavigationSpy({ onNavigate }: { onNavigate: (nav: (to: string) => void) => void }) {
  const navigate = useNavigate();
  onNavigate(navigate);
  return null;
}

export function renderCourseProfile(
  initialEntries: (string | { pathname: string; state?: unknown })[] = ["/courses/42"],
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  let currentLocation: Location | null = null;
  let currentNavigate: ((to: string) => void) | null = null;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={initialEntries as unknown as string[]}>
          <NavigationSpy onNavigate={(nav) => { currentNavigate = nav; }} />
          <LocationDisplay onLocation={(loc) => { currentLocation = loc; }} />
          <Routes>
            <Route path="/courses/:id" element={<CourseProfile />} />
            <Route path="/courses" element={<div>Mock Course List</div>} />
            <Route path="/journals/:id" element={<div>Mock Journal Page</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return {
    ...result,
    getLocation: () => currentLocation!,
    navigate: (to: string) => {
      act(() => {
        currentNavigate!(to);
      });
    },
  };
}

export function registerCourseProfileHooks(): void {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    await i18n.changeLanguage("en");

    useAuthStore.setState({
      role: "superadmin",
      userId: 1,
      status: "authenticated",
      mustSetPassword: false,
    });

    vi.mocked(courseHooks.useCourse).mockReturnValue(mockSuccessResult(mockCourse));
    vi.mocked(courseHooks.useCourseSchedule).mockReturnValue(mockSuccessResult(mockSchedules));
    vi.mocked(courseHooks.useCourseJournalMetrics).mockReturnValue(mockSuccessResult(mockMetrics));
    vi.mocked(enrollmentHooks.useCourseEnrollmentsCount).mockReturnValue(mockSuccessResult(15));
    vi.mocked(courseHooks.useCourseMentorHistory).mockReturnValue(mockSuccessResult([]));
    vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(mockSuccessResult({ labels: [], datasets: [] }));
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue(
      mockSuccessResult({
        course_id: 42,
        periods: [
          { id: 5, period_label: "Week 1", period_start: "2026-01-01", period_end: "2026-01-07" },
        ],
        students: [
          {
            student_id: 1,
            first_name: "Alice",
            last_name: "Smith",
            period_results: [
              { period_id: 5, grading_state: "unknown", score: 85, max_score: 100, percentage: 85 },
            ],
            grading_provenance: "unknown",
          },
        ],
      }),
    );
    vi.mocked(enrollmentHooks.useCourseRoster).mockReturnValue({
      rows: [],
      unresolvedCount: 0,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof enrollmentHooks.useCourseRoster>);
    vi.mocked(enrollmentHooks.useCourseRosterPage).mockReturnValue(
      mockSuccessResult({
        items: [],
        total: 0,
        page: 1,
        page_size: 10,
        total_pages: 1,
        active_count: 0,
      }),
    );
    vi.mocked(userHooks.useMentorProfile).mockReturnValue(
      mockSuccessResult(mockMentorProfile),
    );

    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 99, title: "Frontend Development Mastery (copy)" }),
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

    vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

    vi.mocked(courseHooks.useCourseJournals).mockReturnValue(mockSuccessResult(mockJournals));
  });
  afterEach(() => {
    cleanup();
  });
}
