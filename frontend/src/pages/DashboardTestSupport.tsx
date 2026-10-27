import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../i18n";
import { Dashboard } from "./Dashboard";
import { useAuthStore } from "../store/authStore";
import * as financeHooks from "../lib/finance/hooks";
import * as courseHooks from "../lib/courses/hooks";
import * as userHooks from "../lib/users/hooks";
import * as auditHooks from "../lib/audit/hooks";
import * as dashboardHooks from "../lib/dashboard/hooks";
import type { DashboardAttention } from "../lib/dashboard/types";
import type { FinanceAnalyticsResponse, DebtItem } from "../lib/finance/types";
import type { CourseListItemResponse } from "../lib/courses/types";
import type { User } from "../lib/users/types";
import type { AuditEvent } from "../lib/audit/api";
import type { Paginated } from "../lib/pagination";

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

export function mockErrorResult<TData>(refetch = vi.fn()): UseQueryResult<TData, Error> {
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

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

export function renderDashboard() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

export const mockAnalytics: FinanceAnalyticsResponse = {
  gross_contract_value: "10000.00",
  billed_to_date: "5000.00",
  billed_in_period: "2000.00",
  net_receivable: "750.50",
  collected_in_period: "1250.00",
  outstanding_credit: "0.00",
  aging: { d0_30: "750.50", d31_60: "0.00", d61_90: "0.00", d90_plus: "0.00" },
  unpaid_students_count: 2,
  collection_rate: "62.5",
  debtors_preview: [],
};

export const mockCoursesPaginated: Paginated<CourseListItemResponse> = {
  items: [],
  total: 8,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

export const mockStudentsPaginated: Paginated<User> = {
  items: [],
  total: 42,
  page: 1,
  page_size: 1,
  total_pages: 42,
};

export const mockDebtsPaginated: Paginated<DebtItem> = {
  items: [
    {
      student: { id: 101, first_name: "Ali", last_name: "Valiev", email: "ali@example.com", payment_day_of_month: 5 },
      course: { id: 11, title: "Python Advanced" },
      price_at_enrollment: "1000.00",
      billed_to_date: "1000.00",
      total_paid: "200.00",
      debt: "800.00",
      overdue_days: 12,
    },
    {
      student: { id: 102, first_name: "Zara", last_name: "Karimova", email: "zara@example.com", payment_day_of_month: 10 },
      course: { id: 12, title: "English IELTS" },
      price_at_enrollment: "600.00",
      billed_to_date: "600.00",
      total_paid: "0.00",
      debt: "600.00",
      overdue_days: 0,
    },
  ],
  total: 2,
  page: 1,
  page_size: 5,
  total_pages: 1,
};

export function auditEvent(id: number, overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id,
    user_id: 4,
    actor_name: "Dilnoza Karimova",
    action: "update",
    entity_type: "course",
    entity_id: id,
    entity_label: "Python Basics",
    student_id: null,
    course_id: null,
    course_title: null,
    amount: null,
    created_at: "2026-10-10T10:00:00Z",
    changes: [{ id, field_name: "price", old_value: "500.00", new_value: "600.00" }],
    ...overrides,
  };
}

export const mockAuditLogsPaginated: Paginated<AuditEvent> = {
  items: [
    auditEvent(1, {
      action: "create",
      entity_type: "payment",
      entity_id: 3,
      entity_label: "Aziz Rahimov",
      course_title: "Python Basics",
      amount: "250.00",
      changes: [{ id: 1, field_name: "method", old_value: null, new_value: "cash" }],
    }),
    auditEvent(2),
    auditEvent(3, { actor_name: null, user_id: null }),
    auditEvent(4),
    auditEvent(5),
  ],
  total: 5,
  page: 1,
  page_size: 5,
  total_pages: 1,
};


export const mockAttention: DashboardAttention = {
  lessons_in_progress: [],
  attendance_not_marked: [],
  absent_students: [],
  payments: [
    { student_id: 101, student_name: "Ali Valiev", course_id: 11, course_title: "Python Advanced", enrollment_id: 1, due_date: "2026-10-10", remaining_amount: "800.00" },
  ],
};

export function configureAdminDashboardMocks(): void {
  i18n.changeLanguage("en");
  useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 1, mustSetPassword: false });
  vi.mocked(financeHooks.useFinanceAnalytics).mockReturnValue(mockSuccessResult(mockAnalytics));
  vi.mocked(courseHooks.useCourses).mockReturnValue(mockSuccessResult(mockCoursesPaginated));
  vi.mocked(userHooks.useMentors).mockReturnValue({ data: undefined } as unknown as ReturnType<typeof userHooks.useMentors>);
  vi.mocked(userHooks.useStudents).mockReturnValue(mockSuccessResult(mockStudentsPaginated));
  vi.mocked(financeHooks.useDebts).mockReturnValue(mockSuccessResult(mockDebtsPaginated));
  vi.mocked(auditHooks.useAuditEvents).mockReturnValue(mockSuccessResult(mockAuditLogsPaginated));
  vi.mocked(dashboardHooks.useDashboardAttention).mockReturnValue(mockSuccessResult(mockAttention));
}
