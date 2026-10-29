import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { UseQueryResult } from "@tanstack/react-query";
import i18n from "../../i18n";
import { AttentionList, type PaymentRequest } from "./AttentionList";
import * as dashboardHooks from "../../lib/dashboard/hooks";
import type { AttentionLesson, DashboardAttention } from "../../lib/dashboard/types";

vi.mock("../../lib/dashboard/hooks", () => ({ useDashboardAttention: vi.fn(), DASHBOARD_ATTENTION_QUERY_KEY: ["dashboard", "attention"] }));
vi.mock("./useNextLessonText", () => ({ useNextLessonText: () => "tomorrow, 09:00" }));

function lessonFixture(courseId: number, title: string, timeStart: string, timeEnd: string, journalId: number | null): AttentionLesson {
  return { course_id: courseId, course_title: title, time_start: timeStart, time_end: timeEnd, mentor_name: `Mentor ${courseId}`, mentor_phone: "+992900000001", journal_id: journalId };
}

function attentionFixture(): DashboardAttention {
  return {
    lessons_in_progress: [lessonFixture(1, "Algebra", "09:00:00", "10:30:00", 11), lessonFixture(2, "Physics", "09:30:00", "11:00:00", 12)],
    attendance_not_marked: [lessonFixture(2, "Physics", "09:30:00", "11:00:00", 12)],
    absent_students: [
      {
        ...lessonFixture(1, "Algebra", "09:00:00", "10:30:00", 11),
        students: [
          { student_id: 41, student_name: "Aziz Rahimov", consecutive_absences: 3 },
          { student_id: 42, student_name: "Dilnoza Karimova", consecutive_absences: 2 },
        ],
      },
    ],
    payments: [
      { student_id: 51, student_name: "Farrukh Nazarov", course_id: 1, course_title: "Algebra", enrollment_id: 501, due_date: "2026-10-27", remaining_amount: "150.00" },
      { student_id: 52, student_name: "Gulnora Saidova", course_id: 2, course_title: "Physics", enrollment_id: 502, due_date: "2026-10-24", remaining_amount: "300.00" },
      { student_id: 53, student_name: "Hasan Umarov", course_id: 2, course_title: "Physics", enrollment_id: 503, due_date: "2026-10-20", remaining_amount: "75.50" },
    ],
  };
}

function queryResult(overrides: Record<string, unknown>): UseQueryResult<DashboardAttention> {
  return { data: undefined, isLoading: false, isError: false, refetch: vi.fn(), ...overrides } as unknown as UseQueryResult<DashboardAttention>;
}

function renderAttention(onPay: (request: PaymentRequest) => void = vi.fn()): void {
  render(
    <MemoryRouter>
      <AttentionList onPay={onPay} />
    </MemoryRouter>,
  );
}

describe("AttentionList", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T08:00:00Z"));
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("truncates a long unbroken debtor name with a title and keeps the pay button", () => {
    const longName: string = "L".repeat(100);
    const data: DashboardAttention = attentionFixture();
    data.payments[0] = { ...data.payments[0], student_name: longName };
    vi.mocked(dashboardHooks.useDashboardAttention).mockReturnValue(queryResult({ data }));
    renderAttention();
    const link: HTMLElement = screen.getByRole("link", { name: longName });
    expect(link.getAttribute("title")).toBe(longName);
    expect(link.className).toContain("truncate");
    expect(link.closest("li")?.querySelector("button")).toBeTruthy();
  });

  it("renders every attention group", () => {
    vi.mocked(dashboardHooks.useDashboardAttention).mockReturnValue(queryResult({ data: attentionFixture() }));
    renderAttention();
    for (const heading of ["Lessons in progress", "Attendance not marked", "Absent today", "Payments due"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    }
    const inProgress: HTMLElement = screen.getByRole("heading", { name: "Lessons in progress" }).parentElement as HTMLElement;
    expect(within(inProgress).getAllByRole("listitem")).toHaveLength(2);
    expect(inProgress.textContent).toContain("09:00–10:30");
    expect(inProgress.textContent).toContain("Mentor 1");
  });

  it("shows the mentor phone and a journal link for unmarked attendance", () => {
    vi.mocked(dashboardHooks.useDashboardAttention).mockReturnValue(queryResult({ data: attentionFixture() }));
    renderAttention();
    const unmarked: HTMLElement = screen.getByRole("heading", { name: "Attendance not marked" }).parentElement as HTMLElement;
    expect(within(unmarked).getByText("+992 90 000 0001").getAttribute("href")).toBe("tel:+992900000001");
    expect(within(unmarked).getByRole("link", { name: "Open Gradebook" }).getAttribute("href")).toBe("/journals/12");
  });

  it("links absent students to their profiles and badges only 3 or more consecutive absences", () => {
    vi.mocked(dashboardHooks.useDashboardAttention).mockReturnValue(queryResult({ data: attentionFixture() }));
    renderAttention();
    expect(screen.getByRole("link", { name: "Aziz Rahimov" }).getAttribute("href")).toBe("/students/41");
    expect(screen.getByRole("link", { name: "Dilnoza Karimova" }).getAttribute("href")).toBe("/students/42");
    const badges: HTMLElement[] = Array.from(document.querySelectorAll<HTMLElement>("[data-absence-badge]"));
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe("3rd absence in a row");
    expect(badges[0].parentElement?.textContent).toContain("Aziz Rahimov");
  });

  it("translates the consecutive absence ordinal in Russian", async () => {
    await i18n.changeLanguage("ru");
    const fixture: DashboardAttention = attentionFixture();
    fixture.absent_students[0].students[1].consecutive_absences = 4;
    vi.mocked(dashboardHooks.useDashboardAttention).mockReturnValue(queryResult({ data: fixture }));
    renderAttention();
    const texts: string[] = Array.from(document.querySelectorAll("[data-absence-badge]")).map((node) => node.textContent ?? "");
    expect(texts).toEqual(["3-й пропуск подряд", "4-й пропуск подряд"]);
  });

  it("lists payments with due today and overdue days and opens the payment modal for that student", () => {
    const onPay = vi.fn();
    vi.mocked(dashboardHooks.useDashboardAttention).mockReturnValue(queryResult({ data: attentionFixture() }));
    renderAttention(onPay);
    const payments: HTMLElement = screen.getByRole("heading", { name: "Payments due" }).parentElement as HTMLElement;
    const rows: HTMLElement[] = within(payments).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("Due today");
    expect(rows[0].textContent).toContain("150 TJS");
    expect(rows[1].textContent).toContain("Overdue 3 days");
    expect(rows[2].textContent).toContain("Overdue 7 days");
    expect(within(rows[1]).getByRole("link", { name: "Gulnora Saidova" }).getAttribute("href")).toBe("/students/52");
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Pay" }));
    expect(onPay).toHaveBeenCalledWith({ studentId: 52, studentName: "Gulnora Saidova", courseId: 2, courseName: "Physics" });
  });

  it("renders the all clear state with the next lesson time", () => {
    vi.mocked(dashboardHooks.useDashboardAttention).mockReturnValue(
      queryResult({ data: { lessons_in_progress: [], attendance_not_marked: [], absent_students: [], payments: [] } }),
    );
    renderAttention();
    expect(screen.getByText("All clear today")).toBeTruthy();
    expect(screen.getByText("Next: tomorrow, 09:00")).toBeTruthy();
  });

  it("renders the loading skeleton", () => {
    vi.mocked(dashboardHooks.useDashboardAttention).mockReturnValue(queryResult({ isLoading: true }));
    renderAttention();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
  });

  it("renders the error state with a working retry", () => {
    const refetch = vi.fn();
    vi.mocked(dashboardHooks.useDashboardAttention).mockReturnValue(queryResult({ isError: true, refetch }));
    renderAttention();
    expect(screen.getByText("Failed to load today's items")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
