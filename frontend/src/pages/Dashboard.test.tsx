import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../i18n";
import { Dashboard } from "./Dashboard";
import { ActivityFeed } from "../components/dashboard/ActivityFeed";
import { AttentionList } from "../components/dashboard/AttentionList";
import { useAuthStore } from "../store/authStore";
import * as financeHooks from "../lib/finance/hooks";
import * as courseHooks from "../lib/courses/hooks";
import * as userHooks from "../lib/users/hooks";
import * as auditHooks from "../lib/audit/hooks";
import type { FinanceAnalyticsResponse, DebtItem } from "../lib/finance/types";
import type { CourseResponse } from "../lib/courses/types";
import type { User } from "../lib/users/types";
import type { AuditLogItem } from "../lib/audit/api";
import type { Paginated } from "../lib/pagination";

vi.mock("../components/dashboard/AccountantDashboard", () => ({
  AccountantDashboard: () => <div data-testid="accountant-dashboard">Accountant</div>,
}));
vi.mock("../components/dashboard/MentorDashboard", () => ({
  MentorDashboard: () => <div data-testid="mentor-dashboard">Mentor</div>,
}));
vi.mock("../components/dashboard/StudentDashboard", () => ({
  StudentDashboard: () => <div data-testid="student-dashboard">Student</div>,
}));

vi.mock("../lib/finance/hooks");
vi.mock("../lib/courses/hooks");
vi.mock("../lib/users/hooks");
vi.mock("../lib/audit/hooks");

function mockSuccessResult<TData>(data: TData): UseQueryResult<TData, Error> {
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

function mockErrorResult<TData>(refetch = vi.fn()): UseQueryResult<TData, Error> {
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

function mockStaleErrorResult<TData>(data: TData, refetch = vi.fn()): UseQueryResult<TData, Error> {
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

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderDashboard() {
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

const mockAnalytics: FinanceAnalyticsResponse = {
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

const mockCoursesPaginated: Paginated<CourseResponse> = {
  items: [],
  total: 8,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

const mockStudentsPaginated: Paginated<User> = {
  items: [],
  total: 42,
  page: 1,
  page_size: 1,
  total_pages: 42,
};

const mockDebtsPaginated: Paginated<DebtItem> = {
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

const mockAuditLogsPaginated: Paginated<AuditLogItem> = {
  items: [
    {
      id: 1,
      user_id: 1,
      action: "create",
      entity_type: "course",
      entity_id: 11,
      field_name: "status",
      old_value: null,
      new_value: "active",
      created_at: "2026-10-10T10:00:00Z",
    },
    {
      id: 2,
      user_id: 2,
      action: "update",
      entity_type: "student",
      entity_id: 101,
      field_name: "score",
      old_value: "0",
      new_value: "95",
      created_at: "2026-10-10T11:00:00Z",
    },
    {
      id: 3,
      user_id: null,
      action: "delete",
      entity_type: "enrollment",
      entity_id: 55,
      field_name: "status",
      old_value: "active",
      new_value: null,
      created_at: "2026-10-10T12:00:00Z",
    },
    {
      id: 4,
      user_id: 1,
      action: "update",
      entity_type: "course",
      entity_id: 12,
      field_name: "price",
      old_value: "500.00",
      new_value: "600.00",
      created_at: "2026-10-10T13:00:00Z",
    },
    {
      id: 5,
      user_id: 1,
      action: "create",
      entity_type: "user",
      entity_id: 1,
      field_name: "role",
      old_value: null,
      new_value: "student",
      created_at: "2026-10-10T14:00:00Z",
    },
  ],
  total: 5,
  page: 1,
  page_size: 5,
  total_pages: 1,
};

describe("Superadmin Dashboard (/)", () => {
  beforeEach(() => {
    i18n.changeLanguage("en");
    useAuthStore.setState({
      status: "authenticated",
      role: "superadmin",
      userId: 1,
      mustSetPassword: false,
    });

    vi.mocked(financeHooks.useFinanceAnalytics).mockReturnValue(mockSuccessResult(mockAnalytics));
    vi.mocked(courseHooks.useCourses).mockReturnValue(mockSuccessResult(mockCoursesPaginated));
    vi.mocked(userHooks.useStudents).mockReturnValue(mockSuccessResult(mockStudentsPaginated));
    vi.mocked(financeHooks.useDebts).mockReturnValue(mockSuccessResult(mockDebtsPaginated));
    vi.mocked(auditHooks.useAuditLogs).mockReturnValue(mockSuccessResult(mockAuditLogsPaginated));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders quiet operational H1 and subtitle", () => {
    renderDashboard();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Admin Dashboard");
    expect(screen.getByText("Operational summary of courses, finances, and academic process.")).toBeTruthy();
  });

  it("formats monetary debt with exact decimal precision and no rounding", () => {
    renderDashboard();
    expect(screen.getByText("750.50 TJS")).toBeTruthy();
    expect(screen.getByText("2 debtors")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("active courses")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("students")).toBeTruthy();
    expect(screen.getByText("Registered in CRM")).toBeTruthy();
  });

  it("handles failure independently without fabricating zero", () => {
    const refetchFinance = vi.fn();
    vi.mocked(financeHooks.useFinanceAnalytics).mockReturnValue(mockErrorResult(refetchFinance));

    renderDashboard();

    expect(screen.queryByText("0.00 TJS")).toBeNull();
    expect(screen.queryByText("0 debtors")).toBeNull();
    expect(screen.getByText("Failed to load summary")).toBeTruthy();

    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("active courses")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("students")).toBeTruthy();

    const retryButton = screen.getByRole("button", { name: /Retry/ });
    fireEvent.click(retryButton);
    expect(refetchFinance).toHaveBeenCalledTimes(1);
  });

  it("displays honest stale notice and retry button when background refetch fails", () => {
    const refetchFinance = vi.fn();
    vi.mocked(financeHooks.useFinanceAnalytics).mockReturnValue(mockStaleErrorResult(mockAnalytics, refetchFinance));

    renderDashboard();

    expect(screen.getByText("750.50 TJS")).toBeTruthy();
    expect(screen.getByText("Update failed — showing cached data")).toBeTruthy();
  });

  it("renders debt items with truthful overdue duration, 44px finance action, and neutral due today", () => {
    renderDashboard();

    expect(screen.getByText("Ali Valiev")).toBeTruthy();
    const overdueMoney = screen.getByText("800.00 TJS");
    expect(overdueMoney.className).toContain("text-destructive");
    expect(screen.getByText(/Overdue 12 days/)).toBeTruthy();

    expect(screen.getByText("Zara Karimova")).toBeTruthy();
    const dueTodayMoney = screen.getByText("600.00 TJS");
    expect(dueTodayMoney.className).toContain("text-ink");
    expect(dueTodayMoney.className).not.toContain("text-destructive");
    expect(screen.getByText(/Due today/)).toBeTruthy();
    expect(screen.queryByText(/Overdue 0 days/)).toBeNull();

    const perRowActions = screen.getAllByRole("link", { name: /View course debts/ });
    expect(perRowActions.length).toBe(2);
    expect(perRowActions[0].getAttribute("href")).toBe("/finance?tab=debtors&dcourse=11");
    expect(perRowActions[1].getAttribute("href")).toBe("/finance?tab=debtors&dcourse=12");
    expect(perRowActions[0].getAttribute("href")).not.toContain("student");

    const financeFooterLink = screen.getByRole("link", { name: /Open Finance • View debts/ });
    expect(financeFooterLink.getAttribute("href")).toBe("/finance?tab=debtors");
  });

  it("displays successful empty state when no debts exist", () => {
    const emptyDebts: Paginated<DebtItem> = {
      items: [],
      total: 0,
      page: 1,
      page_size: 5,
      total_pages: 0,
    };
    vi.mocked(financeHooks.useDebts).mockReturnValue(mockSuccessResult(emptyDebts));

    renderDashboard();
    expect(screen.getByText("No current unpaid course balances")).toBeTruthy();
  });

  it("retains empty state and shows stale error notice when background refetch fails on empty debts", () => {
    const emptyDebts: Paginated<DebtItem> = {
      items: [],
      total: 0,
      page: 1,
      page_size: 5,
      total_pages: 0,
    };
    vi.mocked(financeHooks.useDebts).mockReturnValue(mockStaleErrorResult(emptyDebts));

    renderDashboard();
    expect(screen.getByText("No current unpaid course balances")).toBeTruthy();
    expect(screen.getAllByText("Update failed — showing cached data").length).toBeGreaterThan(0);
  });

  it("formats audit log records truthfully with primary changed line and preserves explicit zero", () => {
    renderDashboard();

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Score:") === true &&
          element.textContent?.includes("0 ➔ 95") === true
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Price:") === true &&
          element.textContent?.includes("500.00 ➔ 600.00") === true
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Created Course") === true &&
          element.textContent?.includes("Status = Active") === true
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Deleted Enrollment") === true
      )
    ).toBeTruthy();

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("User #2") === true &&
          element.textContent?.includes("Student #101") === true
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("System") === true &&
          element.textContent?.includes("Enrollment #55") === true
      )
    ).toBeTruthy();

    const auditLink = screen.getByRole("link", { name: /View all activity/ });
    expect(auditLink.getAttribute("href")).toBe("/audit");
  });

  it("displays explanatory empty state when no activity logs exist", () => {
    const emptyAudit: Paginated<AuditLogItem> = {
      items: [],
      total: 0,
      page: 1,
      page_size: 5,
      total_pages: 0,
    };
    vi.mocked(auditHooks.useAuditLogs).mockReturnValue(mockSuccessResult(emptyAudit));

    renderDashboard();
    expect(screen.getByText("Field change history appears when operations occur")).toBeTruthy();
  });

  it("hides items beyond 3 on phone and shows them on desktop", () => {
    const { container } = renderDashboard();
    const listItems = container.querySelectorAll("ul.divide-y > li");
    const activityItems = Array.from(listItems).filter((el) => el.textContent?.includes("•"));
    expect(activityItems.length).toBe(7);

    const auditListItems = container.querySelectorAll("div.border-border-warm:last-child ul.divide-y > li");
    expect(auditListItems.length).toBe(5);

    expect(auditListItems[0].className).toContain("flex");
    expect(auditListItems[0].className).not.toContain("hidden lg:flex");

    expect(auditListItems[1].className).toContain("flex");
    expect(auditListItems[1].className).not.toContain("hidden lg:flex");

    expect(auditListItems[2].className).toContain("flex");
    expect(auditListItems[2].className).not.toContain("hidden lg:flex");

    expect(auditListItems[3].className).toContain("hidden lg:flex");
    expect(auditListItems[4].className).toContain("hidden lg:flex");
  });

  it("truthfully renders summary true zeros without fallback or fabrication", () => {
    const zeroAnalytics: FinanceAnalyticsResponse = {
      ...mockAnalytics,
      net_receivable: "0.00",
      unpaid_students_count: 0,
    };
    const zeroCourses: Paginated<CourseResponse> = {
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 0,
    };
    const zeroStudents: Paginated<User> = {
      items: [],
      total: 0,
      page: 1,
      page_size: 1,
      total_pages: 0,
    };
    vi.mocked(financeHooks.useFinanceAnalytics).mockReturnValue(mockSuccessResult(zeroAnalytics));
    vi.mocked(courseHooks.useCourses).mockReturnValue(mockSuccessResult(zeroCourses));
    vi.mocked(userHooks.useStudents).mockReturnValue(mockSuccessResult(zeroStudents));

    renderDashboard();

    expect(screen.getByText("0.00 TJS")).toBeTruthy();
    expect(screen.getByText("0 debtors")).toBeTruthy();
    const zeroElements = screen.getAllByText("0");
    expect(zeroElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("active courses")).toBeTruthy();
    expect(screen.getByText("students")).toBeTruthy();
  });

  it("handles courses failure independently without crashing students or stats", () => {
    const refetchCourses = vi.fn();
    vi.mocked(courseHooks.useCourses).mockReturnValue(mockErrorResult(refetchCourses));

    renderDashboard();

    expect(screen.getByText("Failed to load summary")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("students")).toBeTruthy();
    expect(screen.getByText("750.50 TJS")).toBeTruthy();

    const retryCoursesBtn = screen.getByRole("button", { name: /Retry/ });
    fireEvent.click(retryCoursesBtn);
    expect(refetchCourses).toHaveBeenCalledTimes(1);
  });

  it("handles students failure independently without crashing courses or stats", () => {
    const refetchStudents = vi.fn();
    vi.mocked(userHooks.useStudents).mockReturnValue(mockErrorResult(refetchStudents));

    renderDashboard();

    expect(screen.getByText("Failed to load summary")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("active courses")).toBeTruthy();
    expect(screen.getByText("750.50 TJS")).toBeTruthy();

    const retryStudentsBtn = screen.getByRole("button", { name: /Retry/ });
    fireEvent.click(retryStudentsBtn);
    expect(refetchStudents).toHaveBeenCalledTimes(1);
  });

  it("renders repeated students across debts independently without aggregating balances", () => {
    const repeatedDebts: Paginated<DebtItem> = {
      items: [
        {
          student: { id: 101, first_name: "Ali", last_name: "Valiev", email: "ali@example.com", payment_day_of_month: 5 },
          course: { id: 1, title: "Web Development" },
          price_at_enrollment: "1000.00",
          billed_to_date: "1000.00",
          total_paid: "200.00",
          debt: "800.00",
          overdue_days: 12,
        },
        {
          student: { id: 101, first_name: "Ali", last_name: "Valiev", email: "ali@example.com", payment_day_of_month: 5 },
          course: { id: 2, title: "Mobile App Design" },
          price_at_enrollment: "500.00",
          billed_to_date: "500.00",
          total_paid: "50.00",
          debt: "450.00",
          overdue_days: 5,
        },
      ],
      total: 2,
      page: 1,
      page_size: 5,
      total_pages: 1,
    };
    vi.mocked(financeHooks.useDebts).mockReturnValue(mockSuccessResult(repeatedDebts));

    renderDashboard();

    const studentNames = screen.getAllByText("Ali Valiev");
    expect(studentNames.length).toBe(2);
    expect(screen.getByText("800.00 TJS")).toBeTruthy();
    expect(screen.getByText("450.00 TJS")).toBeTruthy();
    expect(screen.queryByText("1250.00 TJS")).toBeNull();
  });

  it("triggers refetch when clicking retry in stale error state", () => {
    const refetchFinance = vi.fn();
    vi.mocked(financeHooks.useFinanceAnalytics).mockReturnValue(mockStaleErrorResult(mockAnalytics, refetchFinance));

    renderDashboard();

    expect(screen.getByText("Update failed — showing cached data")).toBeTruthy();
    const retryBtn = screen.getByRole("button", { name: /Retry/ });
    fireEvent.click(retryBtn);
    expect(refetchFinance).toHaveBeenCalledTimes(1);
  });

  it("respects role guards and does not render superadmin dashboard for other roles", () => {
    useAuthStore.setState({ role: "accountant" });
    const { rerender } = renderDashboard();
    expect(screen.queryByText("Admin Dashboard")).toBeNull();
    expect(screen.getByTestId("accountant-dashboard")).toBeTruthy();

    useAuthStore.setState({ role: "mentor" });
    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <Dashboard />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>
    );
    expect(screen.queryByText("Admin Dashboard")).toBeNull();
    expect(screen.getByTestId("mentor-dashboard")).toBeTruthy();

    useAuthStore.setState({ role: "student" });
    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <Dashboard />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>
    );
    expect(screen.queryByText("Admin Dashboard")).toBeNull();
    expect(screen.getByTestId("student-dashboard")).toBeTruthy();
  });
});

describe("independent activity fallback audit", () => {
  afterEach(() => {
    cleanup();
    i18n.changeLanguage("en");
  });

  it("never renders unknown raw field/entity identifiers", () => {
    useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 1, mustSetPassword: false });
    const log: AuditLogItem = {
      id: 98,
      user_id: null,
      action: "update",
      entity_type: "private_storage_trace",
      entity_id: 3,
      field_name: "internal_debug_column",
      old_value: "0",
      new_value: "1",
      created_at: "2026-10-11T00:00:00Z",
    };
    vi.mocked(auditHooks.useAuditLogs).mockReturnValue(
      mockSuccessResult({ items: [log], total: 1, page: 1, page_size: 5, total_pages: 1 })
    );
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ActivityFeed />
        </MemoryRouter>
      </I18nextProvider>
    );
    expect(screen.queryByText(/private_storage_trace/)).toBeNull();
    expect(screen.queryByText(/internal_debug_column/)).toBeNull();
  });

  it("renders localized unknown action, entity, and field across all three locales", () => {
    useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 1, mustSetPassword: false });
    const mysteriousLogs: AuditLogItem[] = [
      {
        id: 77,
        user_id: 1,
        action: "update",
        entity_type: "mysterious_device",
        entity_id: 3,
        field_name: "flux_capacitor",
        old_value: "100",
        new_value: "200",
        created_at: "2026-10-11T00:00:00Z",
      },
      {
        id: 78,
        user_id: 1,
        action: "teleport",
        entity_type: "mysterious_device",
        entity_id: 4,
        field_name: "",
        old_value: null,
        new_value: null,
        created_at: "2026-10-11T00:01:00Z",
      },
    ];
    vi.mocked(auditHooks.useAuditLogs).mockReturnValue(
      mockSuccessResult({ items: mysteriousLogs, total: 2, page: 1, page_size: 5, total_pages: 1 })
    );

    i18n.changeLanguage("en");
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ActivityFeed />
        </MemoryRouter>
      </I18nextProvider>
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Field:") === true &&
          element.textContent?.includes("100 ➔ 200") === true
      )
    ).toBeTruthy();
    expect(screen.getByText(/Record #3/)).toBeTruthy();
    expect(screen.getByText(/Operation Record/)).toBeTruthy();

    i18n.changeLanguage("ru");
    rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ActivityFeed />
        </MemoryRouter>
      </I18nextProvider>
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Поле:") === true &&
          element.textContent?.includes("100 ➔ 200") === true
      )
    ).toBeTruthy();
    expect(screen.getByText(/Запись #3/)).toBeTruthy();
    expect(screen.getByText(/Операция Запись/)).toBeTruthy();

    i18n.changeLanguage("tg");
    rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ActivityFeed />
        </MemoryRouter>
      </I18nextProvider>
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Майдон:") === true &&
          element.textContent?.includes("100 ➔ 200") === true
      )
    ).toBeTruthy();
    expect(screen.getByText(/Сабт #3/)).toBeTruthy();
    expect(screen.getByText(/Амалиёт Сабт/)).toBeTruthy();
  });

  it("formats structured domain values for role, attendance, payment method, and status truthfully", () => {
    useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 1, mustSetPassword: false });
    i18n.changeLanguage("en");
    const structuredLogs: AuditLogItem[] = [
      {
        id: 81,
        user_id: 1,
        action: "update",
        entity_type: "user",
        entity_id: 10,
        field_name: "role",
        old_value: "mentor",
        new_value: "superadmin",
        created_at: "2026-10-11T00:00:00Z",
      },
      {
        id: 82,
        user_id: 1,
        action: "update",
        entity_type: "lesson",
        entity_id: 11,
        field_name: "attendance",
        old_value: "0",
        new_value: "1",
        created_at: "2026-10-11T00:01:00Z",
      },
      {
        id: 83,
        user_id: 1,
        action: "update",
        entity_type: "payment",
        entity_id: 12,
        field_name: "payment_method",
        old_value: "cash",
        new_value: "card",
        created_at: "2026-10-11T00:02:00Z",
      },
      {
        id: 84,
        user_id: 1,
        action: "update",
        entity_type: "course",
        entity_id: 13,
        field_name: "status",
        old_value: "active",
        new_value: "archived",
        created_at: "2026-10-11T00:03:00Z",
      },
    ];
    vi.mocked(auditHooks.useAuditLogs).mockReturnValue(
      mockSuccessResult({ items: structuredLogs, total: 4, page: 1, page_size: 5, total_pages: 1 })
    );

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ActivityFeed />
        </MemoryRouter>
      </I18nextProvider>
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Role:") === true &&
          element.textContent?.includes("Teacher ➔ Administrator") === true
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Attendance:") === true &&
          element.textContent?.includes("Absent ➔ Present") === true
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Payment Method:") === true &&
          element.textContent?.includes("Cash ➔ Card") === true
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Status:") === true &&
          element.textContent?.includes("Active ➔ Archived") === true
      )
    ).toBeTruthy();
  });

  it("preserves explicit zero and shows em-dash for null or empty values", () => {
    useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 1, mustSetPassword: false });
    i18n.changeLanguage("en");
    const zeroAndNullLogs: AuditLogItem[] = [
      {
        id: 91,
        user_id: 1,
        action: "update",
        entity_type: "grade",
        entity_id: 21,
        field_name: "score",
        old_value: "0",
        new_value: "95",
        created_at: "2026-10-11T00:00:00Z",
      },
      {
        id: 92,
        user_id: 1,
        action: "update",
        entity_type: "grade",
        entity_id: 22,
        field_name: "score",
        old_value: null,
        new_value: "50",
        created_at: "2026-10-11T00:01:00Z",
      },
      {
        id: 93,
        user_id: 1,
        action: "update",
        entity_type: "grade",
        entity_id: 23,
        field_name: "score",
        old_value: "50",
        new_value: "",
        created_at: "2026-10-11T00:02:00Z",
      },
    ];
    vi.mocked(auditHooks.useAuditLogs).mockReturnValue(
      mockSuccessResult({ items: zeroAndNullLogs, total: 3, page: 1, page_size: 5, total_pages: 1 })
    );

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ActivityFeed />
        </MemoryRouter>
      </I18nextProvider>
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Score:") === true &&
          element.textContent?.includes("0 ➔ 95") === true
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Score:") === true &&
          element.textContent?.includes("— ➔ 50") === true
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Score:") === true &&
          element.textContent?.includes("50 ➔ —") === true
      )
    ).toBeTruthy();
  });

  it("does not merge audit records that share entity and timestamp", () => {
    useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 1, mustSetPassword: false });
    i18n.changeLanguage("en");
    const identicalLogs: AuditLogItem[] = [
      {
        id: 101,
        user_id: 1,
        action: "update",
        entity_type: "course",
        entity_id: 5,
        field_name: "price",
        old_value: "100",
        new_value: "150",
        created_at: "2026-10-11T00:00:00Z",
      },
      {
        id: 102,
        user_id: 1,
        action: "update",
        entity_type: "course",
        entity_id: 5,
        field_name: "title",
        old_value: "Old Title",
        new_value: "New Title",
        created_at: "2026-10-11T00:00:00Z",
      },
    ];
    vi.mocked(auditHooks.useAuditLogs).mockReturnValue(
      mockSuccessResult({ items: identicalLogs, total: 2, page: 1, page_size: 5, total_pages: 1 })
    );

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ActivityFeed />
        </MemoryRouter>
      </I18nextProvider>
    );

    const items = container.querySelectorAll("ul.divide-y > li");
    expect(items.length).toBe(2);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Price:") === true &&
          element.textContent?.includes("100 ➔ 150") === true
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "p" &&
          element.textContent?.includes("Title:") === true &&
          element.textContent?.includes("Old Title ➔ New Title") === true
      )
    ).toBeTruthy();
  });
});


describe("independent retained collection audit", () => {
  beforeEach(async () => { await i18n.changeLanguage("en"); });
  afterEach(() => cleanup());
  it.each([false, true])("retains loaded or empty activity during refetch failure (empty=%s)", (empty) => {
    const data = empty ? {...mockAuditLogsPaginated,items:[],total:0} : mockAuditLogsPaginated;
    const result=mockStaleErrorResult(data);
    vi.mocked(auditHooks.useAuditLogs).mockReturnValue(result);
    render(<I18nextProvider i18n={i18n}><MemoryRouter><ActivityFeed /></MemoryRouter></I18nextProvider>);
    expect(screen.getByText("Update failed — showing cached data")).toBeTruthy();
    expect(screen.queryByText("Failed to load activity")).toBeNull();
    if (empty) expect(screen.getByText("Field change history appears when operations occur")).toBeTruthy();
    else expect(screen.getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button",{name:"Retry"}));
    expect(result.refetch).toHaveBeenCalledTimes(1);
  });
  it("retains loaded debt balances and retries only that collection", () => {
    const result=mockStaleErrorResult(mockDebtsPaginated);
    vi.mocked(financeHooks.useDebts).mockReturnValue(result);
    render(<I18nextProvider i18n={i18n}><MemoryRouter><AttentionList /></MemoryRouter></I18nextProvider>);
    expect(screen.getByText("Update failed — showing cached data")).toBeTruthy();
    expect(screen.getByText("800.00 TJS")).toBeTruthy();
    expect(screen.queryByText("Failed to load debtors")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Retry"}));
    expect(result.refetch).toHaveBeenCalledTimes(1);
  });
});
