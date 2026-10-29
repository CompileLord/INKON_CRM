import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

function debt(studentId: number, first: string, status: "active" | "withdrawn"): DebtItem {
  return {
    student: { id: studentId, first_name: first, last_name: "Karimova", email: `${first}@example.com`, payment_day_of_month: 5 },
    course: { id: 10 + studentId, title: `Course ${first}` },
    price_at_enrollment: "1000.00",
    billed_to_date: "900.00",
    total_paid: "150.00",
    debt: "700.10",
    overdue_days: 4,
    parent_telegram_linked: true,
    reminder_channel: "telegram",
    reminder_masked_destination: null,
    last_reminder_at: null,
    enrollment_status: status,
  };
}

const active: DebtItem = debt(7, "Anisa", "active");
const withdrawn: DebtItem = debt(8, "Zara", "withdrawn");

beforeEach(async () => {
  mock.reset();
  await i18n.changeLanguage("en");
  useAuthStore.setState({ role: "accountant" });
  mock.onGet(/\/finance\/analytics\//).reply(200, { net_receivable: "0", collected_in_period: "0", unpaid_students_count: 0 });
  mock.onGet(/\/finance\/payments\/\?/).reply(200, { items: [], total: 0, page: 1, page_size: 20, total_pages: 1 });
  mock.onGet(/\/finance\/debts\/\?/).reply(200, { items: [active, withdrawn, { ...withdrawn, course: { id: 99, title: "Second" } }], total: 3, student_total: 2, page: 1, page_size: 20, total_pages: 1 });
});
afterEach(() => cleanup());

describe("Withdrawn debtors", () => {
  it("excludes students whose rows are all withdrawn from reminders", () => {
    expect(DebtReminders.eligibleStudentIds([active, withdrawn])).toEqual([7]);
    expect(DebtReminders.eligibleStudentIds([active, withdrawn, { ...withdrawn, student: active.student }])).toEqual([7]);
  });

  it("badges withdrawn rows, hides their reminder and counts distinct students", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/finance?tab=debtors"]}>
          <Finance />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText("Anisa Karimova");
    expect(screen.getAllByText("Withdrawn")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remind the parent of Anisa Karimova" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remind the parent of Zara Karimova" })).toBeNull();
    expect(screen.getByText(/2 debtors/)).toBeTruthy();
  });
});
