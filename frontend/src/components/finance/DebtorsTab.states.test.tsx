import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { Finance } from "../../pages/Finance";
import { httpClient } from "../../lib/auth/httpClient";
import { useAuthStore } from "../../store/authStore";
import type { DebtItem } from "../../lib/finance/types";
import i18n from "../../i18n";

const mock: MockAdapter = new MockAdapter(httpClient);
const debtsUrl: RegExp = /\/finance\/debts\/\?/;

const anisa: DebtItem = {
  student: { id: 7, first_name: "Anisa", last_name: "Karimova", email: null, payment_day_of_month: 5 },
  course: { id: 11, title: "Python Advanced" },
  price_at_enrollment: "1000.00", billed_to_date: "900.00", total_paid: "150.00", debt: "750.00", overdue_days: 75,
  reminder_channel: "telegram", last_reminder_at: null,
};

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
  mock.onGet(/\/finance\/payments\/\?/).reply(200, { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 });
});
afterEach(() => cleanup());

describe("Debtors list four states", () => {
  it("shows a row-shaped loading skeleton, then the loaded rows", async () => {
    let release: (() => void) | undefined;
    mock.onGet(debtsUrl).reply(() => new Promise((resolve) => { release = () => resolve([200, { items: [anisa], total: 1, page: 1, page_size: 20, total_pages: 1 }]); }));
    renderDebtors();
    const loading = (await screen.findByText("Loading course balances")).closest("[aria-busy='true']") as HTMLElement;
    expect(loading.querySelectorAll("li")).toHaveLength(6);
    release?.();
    expect(await screen.findByText("Anisa Karimova")).toBeTruthy();
    expect(screen.queryByText("Loading course balances")).toBeNull();
  });

  it("shows an error with a retry that loads the list", async () => {
    mock.onGet(debtsUrl).replyOnce(500).onGet(debtsUrl).reply(200, { items: [anisa], total: 1, page: 1, page_size: 20, total_pages: 1 });
    renderDebtors();
    expect(await screen.findByText("Debtors could not be loaded.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Anisa Karimova")).toBeTruthy();
  });

  it("explains the empty state", async () => {
    mock.onGet(debtsUrl).reply(200, { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 });
    renderDebtors();
    expect(await screen.findByText("There are no unpaid course balances for this view.")).toBeTruthy();
  });

  it("has no repeated list heading inside the Debtors tab and opens details when the row is clicked", async () => {
    mock.onGet(debtsUrl).reply(200, { items: [anisa], total: 1, page: 1, page_size: 20, total_pages: 1 });
    renderDebtors();
    const row: HTMLElement = (await screen.findByText("Anisa Karimova")).closest("li") as HTMLElement;
    expect(screen.queryByText("Debtors List")).toBeNull();
    expect(screen.getAllByText("Debtors")).toHaveLength(2);
    expect(screen.queryByText("No reminder sent yet")).toBeNull();
    expect(screen.queryByText(/Parent is not linked/i)).toBeNull();
    await userEvent.click(within(row).getByText("Python Advanced"));
    await waitFor(() => expect(within(row).getByText("Monthly price")).toBeTruthy());
    await userEvent.click(within(row).getByText("Python Advanced"));
    await waitFor(() => expect(within(row).queryByText("Monthly price")).toBeNull());
  });

  it("does not toggle details when the Pay button inside the row is clicked", async () => {
    mock.onGet(debtsUrl).reply(200, { items: [anisa], total: 1, page: 1, page_size: 20, total_pages: 1 });
    mock.onGet(/\/finance\/students\/\d+\/payment-options/).reply(200, { wallet_credit: "0", enrollments: [] });
    renderDebtors();
    const row: HTMLElement = (await screen.findByText("Anisa Karimova")).closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: /Accept payment for Anisa Karimova/ }));
    await screen.findByRole("dialog");
    expect(within(row).queryByText("Monthly price")).toBeNull();
  });
});
