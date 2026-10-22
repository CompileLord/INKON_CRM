import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, useLocation, type Location } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../i18n";
import { Courses } from "./Courses";
import { useAuthStore } from "../store/authStore";
import * as courseHooks from "../lib/courses/hooks";
import * as courseEndpoints from "../lib/courses/endpoints";
import * as userHooks from "../lib/users/hooks";
import type { CourseListItemResponse } from "../lib/courses/types";
import type { User } from "../lib/users/types";
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

export function mockInitialLoadingResult<TData>(): UseQueryResult<TData, Error> {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: "fetching",
    isError: false,
    isFetched: false,
    isFetchedAfterMount: false,
    isFetching: true,
    isInitialLoading: true,
    isLoading: true,
    isLoadingError: false,
    isPaused: false,
    isPending: true,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: false,
    isEnabled: true,
    refetch: vi.fn(),
    status: "pending",
    promise: new Promise(() => {}),
  };
}

export function mockPlaceholderTransitionResult<TData>(retainedData: TData): UseQueryResult<TData, Error> {
  return {
    data: retainedData,
    dataUpdatedAt: 1,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: "fetching",
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: true,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: true,
    isRefetchError: false,
    isRefetching: false,
    isStale: true,
    isSuccess: true,
    isEnabled: true,
    refetch: vi.fn(),
    status: "success",
    promise: new Promise(() => {}),
  };
}

export function mockInitialErrorResult<TData>(refetch = vi.fn()): UseQueryResult<TData, Error> {
  const error = new Error("Network error");
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
  const error = new Error("Network error");
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

export const sampleCourses: CourseListItemResponse[] = [
  {
    id: 1,
    title: "Python Fundamentals",
    description: "Intro to Python programming",
    photo_path: null,
    start_date: "2026-01-10",
    end_date: "2026-12-31",
    exam_type: "monthly",
    price: "1200.00",
    mentor_id: 10,
    status: "active",
    is_deleted: false,
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    schedules: [],
    active_student_count: 0,
  },
  {
    id: 2,
    title: "English IELTS Master",
    description: "Prepare for academic IELTS",
    photo_path: null,
    start_date: "2026-02-01",
    end_date: "2026-08-31",
    exam_type: "weekly",
    price: "850.50",
    mentor_id: 10,
    status: "active",
    is_deleted: false,
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    schedules: [],
    active_student_count: 0,
  },
  {
    id: 3,
    title: "Archived Foundation",
    description: "Archived course",
    photo_path: null,
    start_date: "2025-01-01",
    end_date: "2025-06-01",
    exam_type: "monthly",
    price: "5000000000000000000000000.00",
    mentor_id: 20,
    status: "archived",
    is_deleted: false,
    created_at: "2025-01-01T08:00:00Z",
    updated_at: "2025-01-01T08:00:00Z",
    schedules: [],
    active_student_count: 0,
  },
];

export const sampleMentors: User[] = [
  {
    id: 10,
    first_name: "Aziz",
    last_name: "Rahimov",
    email: "mentor@kitob.example.com",
    role: "mentor",
    date_of_birth: null,
    phone: "+992900000001",
    parent_phone: null,
    photo_path: null,
    thumbnail_path: null,
    payment_day_of_month: null,
    is_deleted: false,
    must_set_password: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

export function LocationSpy({ onChange }: { onChange: (location: Location) => void }) {
  const loc = useLocation();
  onChange(loc);
  return null;
}

export function renderCoursesPage({
  initialUrl = "/courses",
  role = "superadmin",
  isTablet = true,
  onLocationChange,
}: {
  initialUrl?: string;
  role?: "superadmin" | "mentor" | "student" | "accountant";
  isTablet?: boolean;
  onLocationChange?: (location: Location) => void;
} = {}) {
  useAuthStore.setState({ role, userId: role === "mentor" ? 10 : 1 });

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isTablet ? query.includes("768") : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[initialUrl]}>
          {onLocationChange ? <LocationSpy onChange={onLocationChange} /> : null}
          <Courses />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}


export function configureCoursesMocks(): void {
  vi.clearAllMocks();

  vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

  vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: 99 }),
  } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

  vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValue([
    { id: 101, course_id: 1, day_of_week: 1, time_start: "09:00:00", time_end: "10:30:00" },
  ]);

  vi.mocked(userHooks.useMentors).mockReturnValue(
    mockSuccessResult({ items: sampleMentors, total: 1, page: 1, page_size: 100, total_pages: 1 }),
  );
}
