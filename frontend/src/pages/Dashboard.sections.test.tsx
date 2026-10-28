import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { ActivityFeed } from "../components/dashboard/ActivityFeed";
import { AttentionList } from "../components/dashboard/AttentionList";
import * as financeHooks from "../lib/finance/hooks";
import * as courseHooks from "../lib/courses/hooks";
import * as userHooks from "../lib/users/hooks";
import * as auditHooks from "../lib/audit/hooks";
import * as dashboardHooks from "../lib/dashboard/hooks";
import type { FinanceAnalyticsResponse } from "../lib/finance/types";
import type { CourseListItemResponse } from "../lib/courses/types";
import type { StudentListItemResponse } from "../lib/users/types";
import type { AuditEvent } from "../lib/audit/api";
import type { Paginated } from "../lib/pagination";
import { configureAdminDashboardMocks, mockAnalytics, mockAuditLogsPaginated, mockAttention, mockErrorResult, mockStaleErrorResult, mockSuccessResult, renderDashboard } from "./DashboardTestSupport";

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
vi.mock("../lib/dashboard/hooks");


describe("Superadmin Dashboard (/)", () => {
  beforeEach(() => {
    configureAdminDashboardMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders recent activity as readable sentences without raw user or entity ids", () => {
    renderDashboard();

    expect(screen.getAllByText("Dilnoza Karimova", { selector: "strong" })).toHaveLength(4);
    expect(screen.getByText(/recorded 250 TJS from Aziz Rahimov/)).toBeTruthy();
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

  it("shows each activity time once, on the sentence line and not after the subtitle", () => {
    const { container } = renderDashboard();
    const feedItems: HTMLElement[] = Array.from(container.querySelectorAll<HTMLElement>("li")).filter((el) => el.querySelector("time") !== null);
    feedItems.forEach((item: HTMLElement) => {
      expect(item.querySelectorAll("time").length).toBe(1);
      const timeParent: HTMLElement = item.querySelector("time")!.parentElement as HTMLElement;
      expect(timeParent.className).toContain("justify-between");
    });
  });

  it("truthfully renders summary true zeros without fallback or fabrication", () => {
    const zeroAnalytics: FinanceAnalyticsResponse = {
      ...mockAnalytics,
      net_receivable: "0.00",
      unpaid_students_count: 0,
    };
    const zeroCourses: Paginated<CourseListItemResponse> = {
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 0,
    };
    const zeroStudents: Paginated<StudentListItemResponse> = {
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

    expect(screen.getByText("0 TJS")).toBeTruthy();
    expect(screen.getByText("0 debtors")).toBeTruthy();
    const zeroElements = screen.getAllByText("0");
    expect(zeroElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Active courses")).toBeTruthy();
    expect(screen.getByText("Students")).toBeTruthy();
  });

  it("handles courses failure independently without crashing students or stats", () => {
    const refetchCourses = vi.fn();
    vi.mocked(courseHooks.useCourses).mockReturnValue(mockErrorResult(refetchCourses));

    renderDashboard();

    expect(screen.getByText("Failed to load summary")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Students")).toBeTruthy();
    expect(screen.getByText("750.50 TJS")).toBeTruthy();

    const retryCoursesButtons: HTMLElement[] = screen.getAllByRole("button", { name: /Retry/ });
    expect(retryCoursesButtons).toHaveLength(2);
    fireEvent.click(retryCoursesButtons[0]);
    expect(refetchCourses).toHaveBeenCalledTimes(1);
  });

  it("handles students failure independently without crashing courses or stats", () => {
    const refetchStudents = vi.fn();
    vi.mocked(userHooks.useStudents).mockReturnValue(mockErrorResult(refetchStudents));

    renderDashboard();

    expect(screen.getByText("Failed to load summary")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("Active courses")).toBeTruthy();
    expect(screen.getByText("750.50 TJS")).toBeTruthy();

    const retryStudentsBtn = screen.getByRole("button", { name: /Retry/ });
    fireEvent.click(retryStudentsBtn);
    expect(refetchStudents).toHaveBeenCalledTimes(1);
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
  it("retains loaded attention items during refetch failure and retries only that collection", () => {
    const result=mockStaleErrorResult(mockAttention);
    vi.mocked(dashboardHooks.useDashboardAttention).mockReturnValue(result);
    render(<I18nextProvider i18n={i18n}><MemoryRouter><AttentionList onPay={vi.fn()} /></MemoryRouter></I18nextProvider>);
    expect(screen.getByText("Update failed — showing cached data")).toBeTruthy();
    expect(screen.getByText("800 TJS")).toBeTruthy();
    expect(screen.queryByText("Failed to load today's items")).toBeNull();
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
