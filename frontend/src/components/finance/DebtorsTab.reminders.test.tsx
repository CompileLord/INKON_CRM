import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { Finance } from "../../pages/Finance";
import { httpClient } from "../../lib/auth/httpClient";
import { useAuthStore } from "../../store/authStore";
import { DebtReminders } from "../../lib/finance/debtReminders";
import type { DebtItem } from "../../lib/finance/types";
import i18n from "../../i18n";

const mock: MockAdapter = new MockAdapter(httpClient);
const debtsUrl: RegExp = /\/finance\/debts\/\?/;
const remindersUrl: string = "/finance/debts/reminders";

function debt(studentId: number, first: string, linked: boolean, lastReminderAt: string | null): DebtItem {
  return {
    student: { id: studentId, first_name: first, last_name: "Karimova", email: `${first}@example.com`, payment_day_of_month: 5 },
    course: { id: 10 + studentId, title: `Course ${first}` },
    price_at_enrollment: "1000.00",
    billed_to_date: "900.00",
    total_paid: "150.00",
    debt: "700.10",
    overdue_days: 4,
    parent_telegram_linked: linked,
    last_reminder_at: lastReminderAt,
  };
}

const anisa: DebtItem = debt(7, "Anisa", true, "2026-10-19T06:30:00Z");
const zara: DebtItem = debt(8, "Zara", false, null);
const bakhtior: DebtItem = debt(9, "Bakhtior", true, null);

function listing(items: DebtItem[]) {
  return { items, total: items.length, page: 1, page_size: 20, total_pages: 1 };
}

function renderDebtors(): void {
  const client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/finance?tab=debtors"]}>
        <Finance />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  mock.reset();
  await i18n.changeLanguage("en");
  useAuthStore.setState({ role: "accountant" });
  mock.onGet(/\/finance\/analytics\//).reply(200, { net_receivable: "0", collected_in_period: "0", unpaid_students_count: 0 });
  mock.onGet(/\/finance\/payments\/\?/).reply(200, listing([]));
  mock.onGet(debtsUrl).reply(200, listing([anisa, zara, bakhtior]));
});
afterEach(() => cleanup());

describe("DebtReminders", () => {
  it("collects each linked student once and tallies outcomes", () => {
    expect(DebtReminders.eligibleStudentIds([anisa, zara, bakhtior, { ...anisa, course: { id: 99, title: "Other" } }])).toEqual([7, 9]);
    expect(
      DebtReminders.tally([
        { student_id: 7, outcome: "queued", next_allowed_at: null },
        { student_id: 9, outcome: "recently_reminded", next_allowed_at: "2026-10-21T06:30:00Z" },
      ]),
    ).toEqual({ queued: 1, skipped: 1 });
  });
});

describe("Debt reminder controls", () => {
  it("disables the action with a visible reason when no parent is linked and shows last reminder dates", async () => {
    renderDebtors();
    await screen.findByText("Zara Karimova");
    const zaraButton: HTMLElement = screen.getByRole("button", { name: "Remind the parent of Zara Karimova in Telegram" });
    expect((zaraButton as HTMLButtonElement).disabled).toBe(true);
    expect(zaraButton.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Parent is not linked in Telegram")).toBeTruthy();
    expect(screen.getByText("Last reminder: 19.10.2026 11:30")).toBeTruthy();
    expect(screen.getAllByText("No reminder sent yet")).toHaveLength(2);
    expect((screen.getByRole("button", { name: "Remind the parent of Anisa Karimova in Telegram" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends one student id for a single reminder and reports the queued outcome", async () => {
    mock.onPost(remindersUrl).reply(200, { results: [{ student_id: 7, outcome: "queued", next_allowed_at: null }] });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Remind the parent of Anisa Karimova in Telegram" }));
    expect(await screen.findByText("Reminder queued for Anisa Karimova.")).toBeTruthy();
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ student_ids: [7] });
  });

  it("reports a recently reminded outcome with the next allowed time", async () => {
    mock.onPost(remindersUrl).reply(200, { results: [{ student_id: 7, outcome: "recently_reminded", next_allowed_at: "2026-10-21T06:30:00Z" }] });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Remind the parent of Anisa Karimova in Telegram" }));
    expect(await screen.findByText("Anisa Karimova was reminded in the last 24 hours. Next reminder: 21.10.2026 11:30.")).toBeTruthy();
  });

  it("bulk-sends only linked students on the page and summarizes the result", async () => {
    mock.onPost(remindersUrl).reply(200, {
      results: [
        { student_id: 7, outcome: "queued", next_allowed_at: null },
        { student_id: 9, outcome: "recently_reminded", next_allowed_at: "2026-10-21T06:30:00Z" },
      ],
    });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Remind all on this page (2)" }));
    expect(await screen.findByText(/Reminders queued: 1\. Skipped: 1/)).toBeTruthy();
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ student_ids: [7, 9] });
  });

  it("disables bulk with a reason when nobody on the page has a linked parent", async () => {
    mock.onGet(debtsUrl).reply(200, listing([zara]));
    renderDebtors();
    await screen.findByText("Zara Karimova");
    const bulk: HTMLElement = screen.getByRole("button", { name: "Remind all on this page (0)" });
    expect((bulk as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("No linked parents on this page")).toBeTruthy();
  });

  it("shows the settings-disabled message on HTTP 409 and never claims success", async () => {
    mock.onPost(remindersUrl).reply(409, { detail: "disabled" });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Remind the parent of Anisa Karimova in Telegram" }));
    expect(await screen.findByText("Debt reminders are turned off in notification settings. Turn them on to send.")).toBeTruthy();
    expect(screen.queryByText(/queued/i)).toBeNull();
  });

  it("shows a generic failure and keeps the action available for retry", async () => {
    mock.onPost(remindersUrl).replyOnce(500).onPost(remindersUrl).reply(200, { results: [{ student_id: 7, outcome: "queued", next_allowed_at: null }] });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    const button: HTMLElement = screen.getByRole("button", { name: "Remind the parent of Anisa Karimova in Telegram" });
    await userEvent.click(button);
    expect(await screen.findByText("Reminders could not be sent. Try again.")).toBeTruthy();
    await userEvent.click(button);
    await waitFor(() => expect(screen.getByText("Reminder queued for Anisa Karimova.")).toBeTruthy());
  });

  it("localizes the action in Russian and Tajik", async () => {
    await i18n.changeLanguage("ru");
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    expect(within(screen.getByText("Anisa Karimova").closest("li") as HTMLElement).getByText("Напомнить в Telegram")).toBeTruthy();
    cleanup();
    await i18n.changeLanguage("tg");
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    expect(within(screen.getByText("Anisa Karimova").closest("li") as HTMLElement).getByText("Ёдрас дар Telegram")).toBeTruthy();
  });
});
