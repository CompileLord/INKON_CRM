import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import i18n from "../../i18n";
import { httpClient } from "../../lib/auth/httpClient";
import { CourseStudentsPane } from "./CourseStudentsPane";
import type { CourseRosterResponse } from "../../lib/enrollments/types";

const mock = new MockAdapter(httpClient);

const roster: CourseRosterResponse = {
  items: [
    {
      id: 11,
      enrollment_id: 77,
      student_id: 301,
      course_id: 42,
      price_at_enrollment: "500.00",
      color_hex: "#107C41",
      enrolled_at: "2026-09-01T10:00:00Z",
      status: "active",
      student: { id: 301, first_name: "Sherzod", last_name: "Toshev", email: "sherzod@kitob.example.com", phone: null },
    },
  ],
  total: 1,
  page: 1,
  page_size: 10,
  total_pages: 1,
  active_count: 1,
};

describe("Withdrawal preview in the roster dialog", () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    mock.reset();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
    mock.onGet("/enrollments/courses/42/roster").reply(200, roster);
  });

  afterEach(() => {
    cleanup();
  });

  async function openWithdrawDialog(language: string): Promise<void> {
    await i18n.changeLanguage(language);
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <CourseStudentsPane
              courseId={42}
              courseTitle="Frontend"
              coursePrice="500.00"
              isSuperAdmin={true}
              isMentor={false}
              searchQuery=""
              onSearchQueryChange={vi.fn()}
              sortOption="enrolled_desc"
              onSortOptionChange={vi.fn()}
              page={1}
              onPageChange={vi.fn()}
              statusFilter="active"
              onStatusFilterChange={vi.fn()}
              onToast={vi.fn()}
              onReady={vi.fn()}
            />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );
    const actions = await screen.findByRole("button", { name: /Sherzod/ });
    fireEvent.click(actions);
    fireEvent.click(await screen.findByRole("menuitem", { name: /^(Withdraw|Отчислить)$/ }));
  }

  it("fetches the preview for the enrollment and shows what stays owed and what is cancelled", async () => {
    mock.onGet("/enrollments/77/withdraw-preview").reply(200, { still_owed: "500.00", cancelled_amount: "1000.00", months_cancelled: 2 });
    await openWithdrawDialog("en");
    const panel: HTMLElement = await screen.findByTestId("withdraw-preview");
    expect(panel.textContent).toContain("Remaining to pay");
    expect(panel.textContent).toContain("500 TJS");
    expect(panel.textContent).toContain("2 months · 1 000 TJS");
    expect(mock.history.get.filter((request) => request.url === "/enrollments/77/withdraw-preview")).toHaveLength(1);
  });

  it.each([
    [1, "1 месяц"],
    [2, "2 месяца"],
    [5, "5 месяцев"],
  ])("uses the Russian plural form for %i cancelled months", async (months: number, expected: string) => {
    mock.onGet("/enrollments/77/withdraw-preview").reply(200, { still_owed: "500.00", cancelled_amount: "1000.00", months_cancelled: months });
    await openWithdrawDialog("ru");
    const panel: HTMLElement = await screen.findByTestId("withdraw-preview");
    expect(panel.textContent).toContain("Останется к оплате");
    expect(panel.textContent).toContain(`${expected} · 1 000 TJS`);
    await i18n.changeLanguage("en");
  });

  it("shows only the owed amount when nothing is cancelled", async () => {
    mock.onGet("/enrollments/77/withdraw-preview").reply(200, { still_owed: "500.00", cancelled_amount: "0.00", months_cancelled: 0 });
    await openWithdrawDialog("en");
    const panel: HTMLElement = await screen.findByTestId("withdraw-preview");
    expect(panel.textContent).not.toContain("Will be cancelled");
  });

  it("shows a skeleton while the preview loads and keeps confirm available", async () => {
    mock.onGet("/enrollments/77/withdraw-preview").reply(() => new Promise(() => undefined));
    await openWithdrawDialog("en");
    expect(await screen.findByTestId("withdraw-preview-loading")).toBeTruthy();
    const dialog: HTMLElement = screen.getByRole("dialog");
    expect((within(dialog).getByRole("button", { name: "Withdraw" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a translated error with a working retry and keeps confirm available", async () => {
    mock.onGet("/enrollments/77/withdraw-preview").replyOnce(500).onGet("/enrollments/77/withdraw-preview").reply(200, { still_owed: "500.00", cancelled_amount: "1000.00", months_cancelled: 2 });
    await openWithdrawDialog("en");
    const errorPanel: HTMLElement = await screen.findByTestId("withdraw-preview-error");
    expect(errorPanel.textContent).toContain("Couldn't load what withdrawal changes");
    expect((within(screen.getByRole("dialog")).getByRole("button", { name: "Withdraw" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(errorPanel).getByRole("button", { name: "Retry" }));
    expect((await screen.findByTestId("withdraw-preview")).textContent).toContain("1 000 TJS");
  });

  it("refreshes roster, finance and debt queries after the withdrawal is confirmed", async () => {
    mock.onGet("/enrollments/77/withdraw-preview").reply(200, { still_owed: "500.00", cancelled_amount: "1000.00", months_cancelled: 2 });
    mock.onPatch("/enrollments/77/withdraw").reply(200, { ...roster.items[0], status: "withdrawn" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await openWithdrawDialog("en");
    await screen.findByTestId("withdraw-preview");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    await waitFor(() => {
      const keys: unknown[] = invalidate.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
      expect(keys).toContainEqual(["enrollments", "by-course", 42]);
      expect(keys).toContainEqual(["finance"]);
    });
  });
});
