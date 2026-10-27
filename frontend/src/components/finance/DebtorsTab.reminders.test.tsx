import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function debt(studentId: number, first: string, channel: "telegram" | "sms" | null, lastReminderAt: string | null): DebtItem {
  return {
    student: { id: studentId, first_name: first, last_name: "Karimova", email: `${first}@example.com`, payment_day_of_month: 5 },
    course: { id: 10 + studentId, title: `Course ${first}` },
    price_at_enrollment: "1000.00",
    billed_to_date: "900.00",
    total_paid: "150.00",
    debt: "700.10",
    overdue_days: 4,
    parent_telegram_linked: channel === "telegram",
    reminder_channel: channel,
    reminder_masked_destination: channel === "sms" ? "+992 90 ••• 98 76" : null,
    last_reminder_at: lastReminderAt,
  };
}

const anisa: DebtItem = debt(7, "Anisa", "telegram", "2026-10-19T06:30:00Z");
const zara: DebtItem = debt(8, "Zara", null, null);
const bakhtior: DebtItem = debt(9, "Bakhtior", "sms", null);

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
  it("collects each student with a telegram or sms channel once and tallies outcomes", () => {
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
    const zaraButton: HTMLElement = screen.getByRole("button", { name: "Remind the parent of Zara Karimova" });
    expect((zaraButton as HTMLButtonElement).disabled).toBe(true);
    expect(zaraButton.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("No Telegram or phone: add a parent phone")).toBeTruthy();
    expect(screen.getByText("Last reminder: 19.10.2026 11:30")).toBeTruthy();
    expect(screen.getAllByText("No reminder sent yet")).toHaveLength(2);
    expect((screen.getByRole("button", { name: "Remind the parent of Anisa Karimova" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends one student id for a single reminder and reports the queued outcome", async () => {
    mock.onPost(remindersUrl).reply(200, { results: [{ student_id: 7, outcome: "queued", next_allowed_at: null }] });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Remind the parent of Anisa Karimova" }));
    expect(await screen.findByText("Reminder queued for Anisa Karimova in Telegram.")).toBeTruthy();
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ student_ids: [7] });
  });

  it("reports a recently reminded outcome with the next allowed time", async () => {
    mock.onPost(remindersUrl).reply(200, { results: [{ student_id: 7, outcome: "recently_reminded", next_allowed_at: "2026-10-21T06:30:00Z" }] });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Remind the parent of Anisa Karimova" }));
    expect(await screen.findByText("Anisa Karimova was reminded in the last 24 hours. Next reminder: 21.10.2026 11:30.")).toBeTruthy();
  });

  it("bulk-sends students with any channel (telegram and sms) on the page and summarizes the result", async () => {
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

  it("disables bulk with a reason when nobody on the page has a channel", async () => {
    mock.onGet(debtsUrl).reply(200, listing([zara]));
    renderDebtors();
    await screen.findByText("Zara Karimova");
    const bulk: HTMLElement = screen.getByRole("button", { name: "Remind all on this page (0)" });
    expect((bulk as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("No debtors with a reminder channel on this page")).toBeTruthy();
  });

  it("shows the settings-disabled message on HTTP 409 and never claims success", async () => {
    mock.onPost(remindersUrl).reply(409, { detail: "disabled" });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Remind the parent of Anisa Karimova" }));
    expect(await screen.findByText("Debt reminders are turned off in notification settings. Turn them on to send.")).toBeTruthy();
    expect(screen.queryByText(/queued/i)).toBeNull();
  });

  it("shows a generic failure and keeps the action available for retry", async () => {
    mock.onPost(remindersUrl).replyOnce(500).onPost(remindersUrl).reply(200, { results: [{ student_id: 7, outcome: "queued", next_allowed_at: null }] });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    const button: HTMLElement = screen.getByRole("button", { name: "Remind the parent of Anisa Karimova" });
    await userEvent.click(button);
    expect(await screen.findByText("Reminders could not be sent. Try again.")).toBeTruthy();
    await userEvent.click(button);
    await waitFor(() => expect(screen.getByText("Reminder queued for Anisa Karimova in Telegram.")).toBeTruthy());
  });

  it("localizes the action in Russian and Tajik", async () => {
    await i18n.changeLanguage("ru");
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    expect(within(screen.getByText("Anisa Karimova").closest("li") as HTMLElement).getByText("Напомнить")).toBeTruthy();
    cleanup();
    await i18n.changeLanguage("tg");
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    expect(within(screen.getByText("Anisa Karimova").closest("li") as HTMLElement).getByText("Ёдрас")).toBeTruthy();
  });
});


describe("Debt reminder channels", () => {
  it("enables the action for telegram and sms rows and disables it for rows without a channel", async () => {
    renderDebtors();
    await screen.findByText("Zara Karimova");
    const enabled = (name: string): boolean => !(screen.getByRole("button", { name: `Remind the parent of ${name}` }) as HTMLButtonElement).disabled;
    expect(enabled("Anisa Karimova")).toBe(true);
    expect(enabled("Bakhtior Karimova")).toBe(true);
    expect(enabled("Zara Karimova")).toBe(false);
  });

  it("explains the destination per channel in a tooltip", async () => {
    renderDebtors();
    await screen.findByText("Bakhtior Karimova");
    const bakhtiorRow: HTMLElement = screen.getByText("Bakhtior Karimova").closest("li") as HTMLElement;
    await userEvent.click(within(bakhtiorRow).getByRole("button", { name: "Where the reminder goes" }));
    expect(within(bakhtiorRow).getByRole("tooltip").textContent).toBe("The reminder will go by SMS to +992\u00A090\u00A0•••\u00A098\u00A076");
    cleanup();
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    const anisaRow: HTMLElement = screen.getByText("Anisa Karimova").closest("li") as HTMLElement;
    await userEvent.click(within(anisaRow).getByRole("button", { name: "Where the reminder goes" }));
    expect(within(anisaRow).getByRole("tooltip").textContent).toBe("The reminder will go to the parent in Telegram");
    const zaraRow: HTMLElement = screen.getByText("Zara Karimova").closest("li") as HTMLElement;
    expect(within(zaraRow).queryByRole("button", { name: "Where the reminder goes" })).toBeNull();
  });

  it("shows the channel and masked destination when an sms reminder is queued", async () => {
    mock.onPost(remindersUrl).reply(200, { results: [{ student_id: 9, outcome: "queued", channel: "sms", masked_destination: "+992 90 ••• 98 76", next_allowed_at: null }] });
    renderDebtors();
    await screen.findByText("Bakhtior Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Remind the parent of Bakhtior Karimova" }));
    expect(await screen.findByText("Reminder queued for Bakhtior Karimova by SMS to +992 90 ••• 98 76.")).toBeTruthy();
  });

  it("reports the no_channel outcome", async () => {
    mock.onPost(remindersUrl).reply(200, { results: [{ student_id: 7, outcome: "no_channel", next_allowed_at: null }] });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Remind the parent of Anisa Karimova" }));
    expect(await screen.findByText("Anisa Karimova has no Telegram or phone. Add a parent phone.")).toBeTruthy();
  });

  it("shows when the next reminder is allowed on HTTP 429 using Retry-After", async () => {
    const now: number = Date.parse("2026-10-27T06:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    mock.onPost(remindersUrl).reply(429, { detail: { code: "debt_reminder_rate_limited" } }, { "retry-after": "3600" });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Remind the parent of Anisa Karimova" }));
    expect(await screen.findByText("A reminder was sent recently. The next one is allowed at 27.10.2026 12:00.")).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("shows the translated no-channel message on HTTP 422", async () => {
    mock.onPost(remindersUrl).reply(422, { detail: { code: "debt_reminder_no_channel" } });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Remind the parent of Anisa Karimova" }));
    expect(await screen.findByText("No Telegram or phone for the selected students: add a parent phone.")).toBeTruthy();
  });
});
