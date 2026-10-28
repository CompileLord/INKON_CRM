import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Finance } from "./Finance";
import type { DebtItem, FinanceAnalyticsResponse, PaymentItem } from "../lib/finance/types";
import i18n from "../i18n";
import MockAdapter from "axios-mock-adapter";
import { httpClient } from "../lib/auth/httpClient";

export const mock = new MockAdapter(httpClient);
export const analyticsUrl = /\/finance\/analytics\//;
export const debtsUrl = /\/finance\/debts\/\?/;
export const paymentsUrl = /\/finance\/payments\/\?/;

export const analytics: FinanceAnalyticsResponse = {
  gross_contract_value: "5000.00", billed_to_date: "1500.00", billed_in_period: "1500.00",
  net_receivable: "12345678901234567890.125", collected_in_period: "0", outstanding_credit: "0",
  aging: { d0_30: "0", d31_60: "0", d61_90: "0", d90_plus: "0" }, unpaid_students_count: 3, collection_rate: "0", debtors_preview: [],
};

export function debt(studentId: number, courseId: number, name: string, course: string, amount: string): DebtItem {
  return {
    student: { id: studentId, first_name: name, last_name: "Karimova", email: name.toLowerCase() + "@example.com", payment_day_of_month: 5 },
    course: { id: courseId, title: course }, price_at_enrollment: "1000.00", billed_to_date: "1000.00", total_paid: "0", debt: amount, overdue_days: 4,
  };
}

export const twoCourseDebts: DebtItem[] = [debt(7, 11, "Anisa", "Python Advanced", "700.10"), debt(7, 12, "Anisa", "English IELTS", "500.20")];
export const payment: PaymentItem = {
  id: 123, student_id: 7, student_first_name: "Dilnoza", student_last_name: "Rustamova", amount: "750.50", paid_at: "2026-09-20T19:00:00Z", created_at: "2026-10-11T10:00:00Z", method: "cash",
  recorded_by_id: 1, allocated_amount: "500.25", unallocated_amount: "250.25", refunded_amount: "0", is_voided: false,
  allocations: [{ charge_id: 1, course_id: 2, course_title: "First Course", amount: "500.25", due_date: "2026-09-21" }],
};

export function page<T>(items: T[]) { return { items, total: items.length, page: 1, page_size: 5, total_pages: items.length ? 1 : 0 }; }

export function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

export function renderFinance(initial: string = "/finance") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <Finance />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

export function location(): string {
  return screen.getByTestId("location").textContent ?? "";
}

export function requests(pattern: RegExp) {
  return mock.history.get.filter((request) => pattern.test(request.url ?? ""));
}

export async function configureFinanceMocks(): Promise<void> {
  mock.reset();
  await i18n.changeLanguage("en");
  mock.onGet(analyticsUrl).reply(200, analytics);
  mock.onGet(debtsUrl).reply(200, page(twoCourseDebts));
  mock.onGet(paymentsUrl).reply(200, page([payment]));
  mockPaymentOptions();
}

export function mockPaymentOptions(): void {
  mock.onGet(/\/finance\/students\/\d+\/payment-options/).reply(200, {
    wallet_credit: "0",
    enrollments: [
      { enrollment_id: 501, course_id: 11, course_title: "Python Advanced", open_debt: "700.10", overdue_days: 4, remaining_contract_maximum: "1000", billing_mode: "paid" },
      { enrollment_id: 502, course_id: 12, course_title: "English IELTS", open_debt: "500.20", overdue_days: 4, remaining_contract_maximum: "800", billing_mode: "paid" },
    ],
  });
}

export function typeDate(label: string | RegExp, typedValue: string): void {
  const input: HTMLElement = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value: typedValue } });
  fireEvent.blur(input);
}
