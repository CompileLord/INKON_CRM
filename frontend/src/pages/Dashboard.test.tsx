import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClientProvider } from "@tanstack/react-query";
import i18n from "../i18n";
import { Dashboard } from "./Dashboard";
import { useAuthStore } from "../store/authStore";
import * as financeHooks from "../lib/finance/hooks";
import type { DebtItem } from "../lib/finance/types";
import type { Paginated } from "../lib/pagination";
import { configureAdminDashboardMocks, createTestQueryClient, mockAnalytics, mockDebtsPaginated, mockErrorResult, mockStaleErrorResult, mockSuccessResult, renderDashboard } from "./DashboardTestSupport";

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


describe("Superadmin Dashboard (/)", () => {
  beforeEach(() => {
    configureAdminDashboardMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the page title without a filler subtitle", () => {
    renderDashboard();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Admin Dashboard");
    expect(screen.queryByText("Operational summary of courses, finances, and academic process.")).toBeNull();
    expect(document.querySelector("[data-page-container]")).not.toBeNull();
  });

  it("formats monetary debt with exact decimal precision and no rounding", () => {
    renderDashboard();
    expect(screen.getByText("750.50 TJS")).toBeTruthy();
    expect(screen.getByText("2 debtors")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("Active courses")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Students")).toBeTruthy();
  });

  it("handles failure independently without fabricating zero", () => {
    const refetchFinance = vi.fn();
    vi.mocked(financeHooks.useFinanceAnalytics).mockReturnValue(mockErrorResult(refetchFinance));

    renderDashboard();

    expect(screen.queryByText("0.00 TJS")).toBeNull();
    expect(screen.queryByText("0 debtors")).toBeNull();
    expect(screen.getByText("Failed to load summary")).toBeTruthy();

    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("Active courses")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Students")).toBeTruthy();

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

  it("renders debt items with truthful overdue duration, whole-row debtor links, and neutral due today", () => {
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

    const perRowActions = screen.getAllByRole("link", { name: /(Ali Valiev|Zara Karimova)/ });
    expect(perRowActions.length).toBe(2);
    expect(perRowActions[0].getAttribute("href")).toBe("/finance?tab=debtors&dcourse=11&dstudent=101&dname=Ali+Valiev");
    expect(perRowActions[1].getAttribute("href")).toBe("/finance?tab=debtors&dcourse=12&dstudent=102&dname=Zara+Karimova");

    const financeFooterLink = screen.getByRole("link", { name: /All debts/ });
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
