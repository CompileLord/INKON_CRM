import { describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import { formatNumber } from "../i18n/formatters";
import * as userHooks from "../lib/users/hooks";
import * as financeApi from "../lib/finance/api";
import { useAuthStore } from "../store/authStore";
import { mockStudentUser, mockProfileResponse, renderStudentProfile, registerStudentProfileHooks } from "./StudentProfileTestSupport";

registerStudentProfileHooks();

function mockProfile(overrides: Partial<typeof mockProfileResponse>): void {
  vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
    data: { ...mockProfileResponse, ...overrides },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
}

describe("StudentProfile Component", () => {
  it("renders one compact header with the contact line, one primary action and course links", () => {
    renderStudentProfile();

    expect(screen.getByRole("heading", { name: "Rustam Karimov" })).toBeDefined();
    const header = document.querySelector("[data-entity-header]") as HTMLElement;
    const contacts = Array.from(header.querySelectorAll("p > span > span:not([aria-hidden])")).map((node) => node.textContent);
    expect(contacts).toEqual(["student42@example.com", "+992900000042", "Parent: +992900000043", "15.05.2007"]);
    expect(document.querySelectorAll("[data-entity-header]")).toHaveLength(1);

    const backLink = screen.getByRole("link", { name: /Back to Students/i });
    expect(backLink.getAttribute("href")).toBe("/students");
    expect(document.querySelectorAll("[data-page-back]")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Edit$/i })).toHaveLength(1);

    expect(screen.getByRole("link", { name: /Advanced Mathematics/ }).getAttribute("href")).toBe("/courses/101");
    expect(screen.getByRole("link", { name: /English Literature/ }).getAttribute("href")).toBe("/courses/102");
  });

  it("presents legacy student and parent phones canonically without changing stored values", (): void => {
    const legacyUser: typeof mockStudentUser = { ...mockStudentUser, phone: "992901234567", parent_phone: "992901234568" };
    mockProfile({ user: legacyUser });
    renderStudentProfile();
    const header: HTMLElement = document.querySelector<HTMLElement>("[data-entity-header]")!;
    expect(within(header).getByText("+992901234567")).toBeTruthy();
    expect(within(header).getByText("Parent: +992901234568")).toBeTruthy();
    expect(legacyUser.phone).toBe("992901234567");
    expect(legacyUser.parent_phone).toBe("992901234568");
  });

  it("keeps the other actions inside one overflow menu", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    await user.click(screen.getByRole("button", { name: "Student actions" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Send login details", "Delete student"]);
  });

  it("shows exactly three distinct stat tiles in one group for a superadmin", async () => {
    renderStudentProfile();
    const group = document.querySelector("[data-profile-summary] [data-stat-group]") as HTMLElement;
    await waitFor(() => expect(group.textContent).toContain("Debt"));
    expect(group.querySelectorAll("[data-stat-tile]")).toHaveLength(3);
    const labels = Array.from(group.querySelectorAll("dt")).map((node) => node.textContent);
    expect(new Set(labels).size).toBe(3);
    expect(group.getAttribute("data-compact")).toBe("true");
  });

  it("shows the points of the active courses as the score only", () => {
    renderStudentProfile();
    const group = document.querySelector("[data-stat-group]") as HTMLElement;
    const tile = within(group).getByText("Points, active courses").closest("[data-stat-tile]") as HTMLElement;
    expect(tile.textContent).toContain("340");
    expect(tile.textContent).not.toContain("400");
    expect(tile.textContent).not.toContain("85%");
  });

  it("shows attendance with the missed lessons as its hint", () => {
    renderStudentProfile();
    const tile = screen.getByText("Attendance").closest("[data-stat-tile]") as HTMLElement;
    expect(tile.textContent).toContain("92%");
    expect(tile.textContent).toContain("2 of 24 missed");
  });

  it("hides the attendance tile when no lesson is recorded instead of showing a dash", () => {
    mockProfile({ performance: { ...mockProfileResponse.performance!, attendance_denominator: 0, attendance_percentage: 91.6 } });
    renderStudentProfile();
    expect(screen.queryByText("Attendance")).toBeNull();
    expect(document.body.textContent).not.toContain("92%");
    expect(document.querySelector("[data-stat-group] [data-stat-missing]")).toBeNull();
  });

  it("hides the points tile when no active course has a recorded maximum", () => {
    mockProfile({ courses: mockProfileResponse.courses.map((item) => ({ ...item, my_total_score: undefined, my_total_max_score: undefined })) });
    renderStudentProfile();
    expect(screen.queryByText("Points, active courses")).toBeNull();
    expect(document.querySelector("[data-stat-group] [data-stat-missing]")).toBeNull();
  });

  it("shows no percentage or maximum next to the points", () => {
    mockProfile({ courses: mockProfileResponse.courses.map((item) => ({ ...item, my_total_score: 130, my_total_max_score: 100 })) });
    renderStudentProfile();
    const tile = screen.getByText("Points, active courses").closest("[data-stat-tile]") as HTMLElement;
    expect(tile.textContent).toContain("130");
    expect(tile.textContent).not.toMatch(/%|\/ 100/);
  });

  it("shows the debt with money formatting and the overdue days", async () => {
    renderStudentProfile();
    const tile = (await screen.findByText("Debt")).closest("[data-stat-tile]") as HTMLElement;
    expect(tile.textContent).toContain("250.00 TJS");
    expect(tile.textContent).toContain("3 days overdue");
  });

  it("shows an overpayment as credit and a settled account as a zero balance", async () => {
    vi.spyOn(financeApi, "fetchStudentBalance").mockResolvedValue({ student_id: 42, billed_to_date: "0", total_settled: "0", net_receivable: "0.00", credit_balance: "75.50", days_overdue: 0 });
    renderStudentProfile();
    const creditTile = (await screen.findByText("Overpaid")).closest("[data-stat-tile]") as HTMLElement;
    expect(creditTile.textContent).toContain("75.50 TJS");
    cleanup();
    vi.spyOn(financeApi, "fetchStudentBalance").mockResolvedValue({ student_id: 42, billed_to_date: "0", total_settled: "0", net_receivable: "0.00", credit_balance: "0.00", days_overdue: 0 });
    renderStudentProfile();
    const balanceTile = (await screen.findByText("Balance")).closest("[data-stat-tile]") as HTMLElement;
    await waitFor(() => expect(balanceTile.textContent).toContain("0.00 TJS"));
  });

  it("hides the balance tile and never requests the balance for a mentor", () => {
    useAuthStore.setState({ role: "mentor", userId: 7 });
    renderStudentProfile();
    const group = document.querySelector("[data-stat-group]") as HTMLElement;
    expect(group.querySelectorAll("[data-stat-tile]")).toHaveLength(2);
    expect(financeApi.fetchStudentBalance).not.toHaveBeenCalled();
  });

  it.each(["en", "ru", "tg"] as const)("localizes the stat labels and numbers for %s", async (locale) => {
    await i18n.changeLanguage(locale);
    renderStudentProfile();
    const group = document.querySelector("[data-stat-group]") as HTMLElement;
    expect(group.textContent).toContain(i18n.t("studentProfile:stats.score", { lng: locale }));
    expect(group.textContent).toContain(i18n.t("studentProfile:stats.attendance", { lng: locale }));
    expect(group.textContent).toContain(i18n.t("studentProfile:stats.absencesOf", { lng: locale, absences: formatNumber(2, locale), total: formatNumber(24, locale) }));
    await i18n.changeLanguage("en");
  });

  it("opens the edit panel from the primary action", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("shows the guardian phone as plain text in the contact line", () => {
    renderStudentProfile();
    expect(screen.getByText("Parent: +992900000043")).toBeDefined();
  });

  it("shows the archived badge beside the name only when the student is not active", () => {
    renderStudentProfile();
    expect(document.querySelector("[data-entity-header] [data-badge-status='archived']")).toBeNull();
    cleanup();
    mockProfile({ user: { ...mockStudentUser, is_deleted: true } });
    renderStudentProfile();
    expect(document.querySelector("[data-entity-header] [data-badge-status='archived']")).not.toBeNull();
  });

  it("renders the loading skeleton with the header, tile and tab geometry", () => {
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(document.querySelector("[data-loading-header]")).not.toBeNull();
    expect(document.querySelector("[data-loading-tabs]")).not.toBeNull();
    expect(document.querySelectorAll("[data-loading-header] ~ div > div").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Rustam Karimov" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});
