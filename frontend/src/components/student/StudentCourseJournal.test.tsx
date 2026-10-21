import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { StudentCourseJournal } from "./StudentCourseJournal";
import { httpClient } from "../../lib/auth/httpClient";

const DATES: string[] = ["2026-10-12", "2026-10-14"];

function classmate(id: number, firstName: string, isSelf: boolean, comment: string | null) {
  return {
    student_id: id, first_name: firstName, last_name: "Tester", color_hex: "#123456", is_self: isSelf,
    entries: DATES.map((date, index) => ({ id: id * 10 + index, lesson_date: date, attendance: true, score: 4, comment: index === 0 ? comment : null, has_comment: index === 0 && comment !== null, version: 1 })),
    summary: { id, bonus_score: 0, exam_score: 0, sum_score: 8 + id, max_period_score: 100, percentage: 8, version: 1, homework_score: 8, attendance_score: 0, attendance_count: 2, total_lessons: 2 },
  };
}

const PERIODS = [{ id: 5, period_label: "Month", period_start: "2026-10-01", period_end: "2026-10-31", period_type: "month", exam_max_score: 100, state: "empty" }];
const JOURNAL = {
  journal_id: 5, course_id: 1, period_label: "Month", period_start: "2026-10-01", period_end: "2026-10-31", period_type: "month",
  exam_max_score: 100, lesson_dates: DATES, my_rank: 1, class_size: 3, class_avg_percentage: 8,
  students: [classmate(1, "Anvar", false, null), classmate(2, "Bahor", false, null), classmate(3, "Chiroq", true, "own note")],
};

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }) });
});
beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(getImpl: (url: string) => Promise<{ data: unknown }>) {
  const get = vi.spyOn(httpClient, "get").mockImplementation(getImpl as never);
  const put = vi.spyOn(httpClient, "put");
  const patch = vi.spyOn(httpClient, "patch");
  const post = vi.spyOn(httpClient, "post");
  const client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><StudentCourseJournal courseId={1} selfStudentId={3} /></MemoryRouter></QueryClientProvider>);
  return { get, writes: [put, patch, post] };
}

const happy = (url: string): Promise<{ data: unknown }> =>
  Promise.resolve({ data: url.endsWith("/journals") || url.includes("/journals?") || url.includes("courses/1/journals") ? PERIODS : JOURNAL });

describe("StudentCourseJournal", () => {
  it("shows the class with the own row first, classmate scores visible, no edit control and no write request", async () => {
    const { get, writes } = mount(happy);
    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(3));
    const rows: HTMLElement[] = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Chiroq Tester")).toBeTruthy();
    expect(rows[0].getAttribute("data-self")).toBe("true");
    expect(screen.getByText("Anvar Tester")).toBeTruthy();
    expect(screen.getByText("Bahor Tester")).toBeTruthy();
    expect(document.querySelectorAll("input, textarea, [data-control]")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /settings/i })).toBeNull();
    expect(screen.getAllByRole("button", { name: /read comment/i })).toHaveLength(1);
    expect(get.mock.calls.some((call) => String(call[0]) === "/journals/5/class")).toBe(true);
    expect(get.mock.calls.some((call) => String(call[0]) === "/journals/5")).toBe(false);
    writes.forEach((write) => expect(write).not.toHaveBeenCalled());
  });

  it("never shows a classmate comment", async () => {
    mount(happy);
    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(3));
    const rows: HTMLElement[] = screen.getAllByRole("row").slice(1);
    expect(rows[1].querySelector("[data-has-comment]")).toBeNull();
    expect(within(rows[1]).queryByText(/note/i)).toBeNull();
  });

  it("shows an error with a working retry when the journal fails", async () => {
    let failing: boolean = true;
    const { get } = mount((url) => {
      if (url.includes("courses/1/journals")) return Promise.resolve({ data: PERIODS });
      return failing ? Promise.reject(new Error("boom")) : Promise.resolve({ data: JOURNAL });
    });
    const retry: HTMLElement = await screen.findByRole("button", { name: /retry/i });
    failing = false;
    retry.click();
    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(3));
    expect(get).toHaveBeenCalled();
  });

  it("explains a course without periods", async () => {
    mount(() => Promise.resolve({ data: [] }));
    expect(await screen.findByText("No journal periods yet")).toBeTruthy();
  });
});
