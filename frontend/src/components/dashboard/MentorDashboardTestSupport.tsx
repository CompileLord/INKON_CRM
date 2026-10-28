import { vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../../i18n";
import { MentorDashboard } from "./MentorDashboard";
import type { CourseListItemResponse, PaginatedCourses } from "../../lib/courses/types";
import type { MentorProfileResponse, User } from "../../lib/users/types";

export const mockMentorUser: User = {
  id: 10,
  first_name: "Mentor",
  last_name: "Fixture",
  email: "mentor@kitob.example.com",
  role: "mentor",
  date_of_birth: null,
  phone: null,
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
    active_students_population: "active_enrollments_on_active_non_deleted_courses",
    avg_score_grading_state: "unknown",
    avg_score_provenance: "unknown",
    avg_score_basis: "all_summaries_on_courses_currently_assigned_including_soft_deleted_and_archived",
    avg_score_summary_count: 1,
    avg_score_defined_ratio_count: 1,
    avg_score_undefined_ratio_count: 0,
    avg_score_defined_ratios_mean: avgScore,
  };
}

export function mockCourse(id: number, title: string, exam_type: "weekly" | "monthly" = "monthly"): CourseListItemResponse {
  return {
    id,
    title,
    description: "",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    exam_type,
    price: "100.00",
    mentor_id: 10,
    status: "active",
    photo_path: null,
    is_deleted: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    schedules: [],
    active_student_count: 0,
    current_period_label: null,
    last_graded_lesson_date: null,
    ungraded_lessons_count: 0,
  };
}

export function mockPaginatedCourses(items: CourseListItemResponse[]): PaginatedCourses {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 50,
    total_pages: 1,
  };
}

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

export function mockInitialErrorResult<TData>(refetch = vi.fn()): UseQueryResult<TData, Error> {
  const error = new Error("Failed to load");
  const promise = Promise.reject(error);
  promise.catch(() => {});
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error,
    errorUpdateCount: 1,
    errorUpdatedAt: 1,
    failureCount: 1,
    failureReason: error,
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
    isStale: false,
    isSuccess: false,
    isEnabled: true,
    refetch,
    status: "error",
    promise,
  };
}

export function mockStaleErrorResult<TData>(data: TData, refetch = vi.fn()): UseQueryResult<TData, Error> {
  const error = new Error("Refetch failed");
  return {
    data,
    dataUpdatedAt: 1,
    error,
    errorUpdateCount: 1,
    errorUpdatedAt: 1,
    failureCount: 1,
    failureReason: error,
    fetchStatus: "idle",
    isError: true,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: true,
    isRefetching: false,
    isStale: true,
    isSuccess: false,
    isEnabled: true,
    refetch,
    status: "error",
    promise: Promise.resolve(data),
  };
}

export function mockErrorResult<TData>(data?: TData, refetch = vi.fn()): UseQueryResult<TData, Error> {
  if (data !== undefined) {
    return mockStaleErrorResult(data, refetch);
  }
  return mockInitialErrorResult(refetch);
}

export function sectionByHeading(heading: string): HTMLElement | null {
  return screen.getByRole("heading", { name: heading }).closest("section");
}

export function renderMentorDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <MentorDashboard />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

