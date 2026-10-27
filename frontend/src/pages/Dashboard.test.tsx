import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClientProvider } from "@tanstack/react-query";
import i18n from "../i18n";
import { Dashboard } from "./Dashboard";
import { useAuthStore } from "../store/authStore";
import * as financeHooks from "../lib/finance/hooks";
import { configureAdminDashboardMocks, createTestQueryClient, mockAnalytics, mockErrorResult, mockStaleErrorResult, renderDashboard } from "./DashboardTestSupport";

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
vi.mock("../components/finance/PaymentModal", () => ({
  PaymentModal: ({ isOpen, defaultStudentId, defaultStudentName, defaultCourseId }: { isOpen: boolean; defaultStudentId?: number; defaultStudentName?: string; defaultCourseId?: number }) =>
    isOpen ? <div role="dialog">{`payment ${defaultStudentId ?? "none"} ${defaultStudentName ?? ""} ${defaultCourseId ?? ""}`.trim()}</div> : null,
}));
vi.mock("../lib/audit/hooks");
vi.mock("../lib/dashboard/hooks");


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

    expect(screen.queryByText("0 TJS")).toBeNull();
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

  it("links the attention block to the debtors tab and offers the quick actions", () => {
    renderDashboard();
    expect(screen.getByRole("link", { name: /All debts/ }).getAttribute("href")).toBe("/finance?tab=debtors");
    expect(screen.getByRole("button", { name: "Accept Payment" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add student" })).toBeTruthy();
    expect(screen.getByText("Ali Valiev")).toBeTruthy();
  });

  it("opens the payment modal for the student chosen from the attention block", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Pay" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toBe("payment 101 Ali Valiev 11");
  });

  it("opens an empty payment modal from the header action", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect(screen.getByRole("dialog").textContent).toBe("payment none");
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
