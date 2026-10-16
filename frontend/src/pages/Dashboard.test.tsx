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
import type { AuditEvent } from "../lib/audit/api";
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

function auditEvent(id: number, overrides: Partial<AuditEvent> = {}): AuditEvent {
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

const mockAuditLogsPaginated: Paginated<AuditEvent> = {
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
    vi.mocked(auditHooks.useAuditEvents).mockReturnValue(mockSuccessResult(mockAuditLogsPaginated));
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

    const perRowActions = screen.getAllByRole("link", { name: /View balance/ });
    expect(perRowActions.length).toBe(2);
    expect(perRowActions[0].getAttribute("href")).toBe("/finance?tab=debtors&dcourse=11&dstudent=101&dname=Ali+Valiev");
    expect(perRowActions[1].getAttribute("href")).toBe("/finance?tab=debtors&dcourse=12&dstudent=102&dname=Zara+Karimova");

    const financeFooterLink = screen.getByRole("link", { name: /Open Finance • View debts/ });
    expect(financeFooterLink.getAttribute("href")).toBe("/finance?tab=debtors");
  });

  it("uses the singular form for a one day overdue balance", () => {
    const oneDay: Paginated<DebtItem> = { ...mockDebtsPaginated, items: [{ ...mockDebtsPaginated.items[0], overdue_days: 1 }] };
    vi.mocked(financeHooks.useDebts).mockReturnValue(mockSuccessResult(oneDay));
    renderDashboard();
    expect(screen.getByText(/Overdue 1 day$/)).toBeTruthy();
    expect(screen.queryByText(/Overdue 1 days/)).toBeNull();
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

  it("renders recent activity as readable sentences without raw user or entity ids", () => {
    renderDashboard();

    expect(screen.getAllByText("Dilnoza Karimova", { selector: "strong" })).toHaveLength(4);
    expect(screen.getByText(/recorded 250\.00 TJS from Aziz Rahimov/)).toBeTruthy();
    expect(screen.queryByText(/User #/)).toBeNull();
    expect(screen.queryByText(/Payment #/)).toBeNull();
    expect(screen.queryByText(/#\d+/)).toBeNull();

    const auditLink = screen.getByRole("link", { name: /View all activity/ });
    expect(auditLink.getAttribute("href")).toBe("/audit");
  });

  it("displays explanatory empty state when no activity logs exist", () => {
    const emptyAudit: Paginated<AuditEvent> = {
      items: [],
      total: 0,
      page: 1,
      page_size: 5,
      total_pages: 0,
    };
    vi.mocked(auditHooks.useAuditEvents).mockReturnValue(mockSuccessResult(emptyAudit));

    renderDashboard();
    expect(screen.getByText("Field change history appears when operations occur")).toBeTruthy();
  });

  it("hides items beyond 3 on phone and shows them on desktop", () => {
    const { container } = renderDashboard();
    const feedItems = Array.from(container.querySelectorAll("li")).filter((el) => el.querySelector("time") !== null);
    expect(feedItems.length).toBe(5);
    feedItems.slice(0, 3).forEach((item) => expect(item.className).not.toContain("hidden"));
    feedItems.slice(3).forEach((item) => expect(item.className).toContain("hidden lg:flex"));
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

describe("independent retained collection audit", () => {
  beforeEach(async () => { await i18n.changeLanguage("en"); });
  afterEach(() => cleanup());
  it.each([false, true])("retains loaded or empty activity during refetch failure (empty=%s)", (empty) => {
    const data = empty ? {...mockAuditLogsPaginated,items:[],total:0} : mockAuditLogsPaginated;
    const result=mockStaleErrorResult(data);
    vi.mocked(auditHooks.useAuditEvents).mockReturnValue(result);
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

describe("dashboard recent activity locales", () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });
  it.each(["ru", "tg"])("renders the payment sentence in %s without the English verb", async (language) => {
    await i18n.changeLanguage(language);
    vi.mocked(auditHooks.useAuditEvents).mockReturnValue(mockSuccessResult(mockAuditLogsPaginated));
    render(<I18nextProvider i18n={i18n}><MemoryRouter><ActivityFeed /></MemoryRouter></I18nextProvider>);
    expect(screen.getByText("Aziz Rahimov", { exact: false })).toBeTruthy();
    expect(screen.queryByText(/recorded/)).toBeNull();
    expect(screen.queryByText(/User #|Payment #/)).toBeNull();
  });
});
