import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { AccountantDashboard } from "./AccountantDashboard";
import { httpClient } from "../../lib/auth/httpClient";
import { getSchoolMonthRange } from "../../i18n/formatters";
import type { FinanceAnalyticsResponse, PaymentItem } from "../../lib/finance/types";
import i18n from "../../i18n";

const mock = new MockAdapter(httpClient);
const analytics: FinanceAnalyticsResponse = { gross_contract_value: "5000.00", billed_to_date: "1500.00", billed_in_period: "1500.00", net_receivable: "1200.25", collected_in_period: "0", outstanding_credit: "0", aging: { d0_30: "1200.25", d31_60: "0", d61_90: "0", d90_plus: "0" }, unpaid_students_count: 3, collection_rate: "0", debtors_preview: [] };
const payment: PaymentItem = { id: 123, student_id: 7, amount: "750.50", paid_at: "2026-09-20T19:00:00Z", created_at: "2026-10-11T10:00:00Z", method: "cash", recorded_by_id: 1, allocated_amount: "500.25", unallocated_amount: "250.25", refunded_amount: "12.50", is_voided: false, allocations: [{ charge_id: 1, course_id: 2, course_title: "First Course", amount: "500.25", due_date: "2026-09-21" }] };
function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><AccountantDashboard /></QueryClientProvider>);
  return client;
}
function listReply(items: PaymentItem[] = [payment]) { return { items, total: items.length, page: 1, page_size: 5, total_pages: items.length ? 1 : 0 }; }
const analyticsUrl = /\/finance\/analytics\//;
const paymentsUrl = /\/finance\/payments\/\?/;

beforeEach(async () => { mock.reset(); await i18n.changeLanguage("en"); });
afterEach(() => { cleanup(); mock.reset(); });

describe("Accountant dashboard contract", () => {
  it("uses an explicit school-month cash scope while latest payments remain all dates", async () => {
    mock.onGet(analyticsUrl).reply(200, analytics); mock.onGet(paymentsUrl).reply(200, listReply()); renderDashboard();
    await screen.findByText("Unknown student");
    const range = getSchoolMonthRange(); const request = mock.history.get.find(request => analyticsUrl.test(request.url ?? ""));
    expect(request?.url).toContain("date_from=" + range.start); expect(request?.url).toContain("date_to=" + range.end);
    const listRequest = mock.history.get.find(request => paymentsUrl.test(request.url ?? ""));
    expect(listRequest?.url).toContain("page_size=5"); expect(listRequest?.url).not.toContain("date_from"); expect(listRequest?.url).not.toContain("date_to");
    expect(screen.getByRole("heading", { level: 1, name: "Financial Overview" })).toBeTruthy();
    expect(screen.queryByText("Latest five records · all dates")).toBeNull();
    expect(screen.queryByText(/Payment #\d+/)).toBeNull();
    expect(mock.history.get.some(request => request.url?.startsWith("/students/"))).toBe(false);
  });

  it("renders actual zero collected cash without substituting receivable or gross value", async () => {
    mock.onGet(analyticsUrl).reply(200, analytics); mock.onGet(paymentsUrl).reply(200, listReply()); renderDashboard();
    const summary = screen.getByRole("region", { name: "Dashboard Summary" }); await within(summary).findByText("0.00 TJS");
    expect(within(summary).getByText("1 200.25 TJS")).toBeTruthy(); expect(within(summary).queryByText("5 000.00 TJS")).toBeNull();
    expect(within(summary).getByText("3")).toBeTruthy(); expect(within(summary).queryByRole("alert")).toBeNull();
  });

  it("keeps payment records usable when only analytics fails, without error-to-zero metrics", async () => {
    mock.onGet(analyticsUrl).reply(500); mock.onGet(paymentsUrl).reply(200, listReply()); renderDashboard(); await screen.findByText("Unknown student");
    const summary = screen.getByRole("region", { name: "Dashboard Summary" }); expect(await within(summary).findByRole("alert")).toBeTruthy(); expect(within(summary).queryByText(/0\.00/)).toBeNull();
    const recent = screen.getByRole("region", { name: "Recent Payments" }); expect(within(recent).queryByRole("alert")).toBeNull(); expect(within(recent).getAllByText("750.50 TJS")).toHaveLength(1);
    mock.onGet(analyticsUrl).reply(200, analytics); await userEvent.click(within(summary).getByRole("button", { name: "Retry" })); await within(summary).findByText("1 200.25 TJS");
  });

  it("isolates payment-list initial failure and retries only the list", async () => {
    mock.onGet(analyticsUrl).reply(200, analytics); mock.onGet(paymentsUrl).reply(500); renderDashboard();
    const recent = screen.getByRole("region", { name: "Recent Payments" }); await within(recent).findByRole("alert");
    expect(screen.getByText("1 200.25 TJS")).toBeTruthy(); const summaryCalls = mock.history.get.filter(request => analyticsUrl.test(request.url ?? "")).length;
    mock.onGet(paymentsUrl).reply(200, listReply()); await userEvent.click(within(recent).getByRole("button", { name: "Retry" })); await screen.findByText("Unknown student");
    expect(mock.history.get.filter(request => analyticsUrl.test(request.url ?? ""))).toHaveLength(summaryCalls);
  });

  it("retains loaded records and explicit stale copy after a failed refresh", async () => {
    mock.onGet(analyticsUrl).reply(200, analytics); mock.onGet(paymentsUrl).replyOnce(200, listReply()).onGet(paymentsUrl).reply(500);
    const client = renderDashboard(); await screen.findByText("Unknown student"); await act(async () => { await client.refetchQueries({ queryKey: ["finance", "payments"] }); });
    const recent = screen.getByRole("region", { name: "Recent Payments" }); expect(await within(recent).findByText("Update failed — showing cached data")).toBeTruthy(); expect(within(recent).getAllByText("750.50 TJS")).toHaveLength(1);
  });

  it("distinguishes a successful empty list from request failure", async () => {
    mock.onGet(analyticsUrl).reply(200, analytics); mock.onGet(paymentsUrl).reply(200, listReply([])); renderDashboard();
    expect(await screen.findByText("No operations found")).toBeTruthy(); expect(screen.getByText("Payments appear here after cash is recorded. This list covers all payment dates.")).toBeTruthy(); expect(screen.queryByRole("alert")).toBeNull();
  });

  it("preserves original cash, refund/void state and actual allocations in read-only detail", async () => {
    mock.onGet(analyticsUrl).reply(200, analytics); mock.onGet(paymentsUrl).reply(200, listReply([{ ...payment, is_voided: true }]));
    mock.onGet("/finance/payments/123/receipt").reply(200, { receipt_number: "ACTUAL-123", student_name: "Authorized name", accepted_by_name: "Accountant", allocations: [] });
    renderDashboard(); await screen.findByText("Unknown student");
    expect(screen.getAllByText("This payment was voided.")).toHaveLength(1); expect(screen.getAllByText("Refunded: 12.50 TJS")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "More actions" })); await userEvent.click(await screen.findByRole("menuitem", { name: "View payment" })); const dialog = await screen.findByRole("dialog"); await within(dialog).findByText("ACTUAL-123");
    expect(within(dialog).getByText("750.50 TJS")).toBeTruthy(); expect(within(dialog).getByText("This payment was voided.")).toBeTruthy(); expect(within(dialog).getByText("Refunded: 12.50 TJS")).toBeTruthy();
    expect(within(dialog).getByText("No current allocations")).toBeTruthy(); expect(within(dialog).queryByText("First Course")).toBeNull(); expect(within(dialog).queryByRole("button", { name: "Accept Payment" })).toBeNull();
    await waitFor(() => expect(mock.history.post).toHaveLength(0));
  });
});
