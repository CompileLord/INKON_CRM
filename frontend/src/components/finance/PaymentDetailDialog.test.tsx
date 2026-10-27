import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { PaymentDetailModal } from "./PaymentDetailDialog";
import { httpClient } from "../../lib/auth/httpClient";
import type { PaymentItem } from "../../lib/finance/types";
import i18n from "../../i18n";

const mock = new MockAdapter(httpClient);
const statusUrl = /\/finance\/payments\/\?/;
const receiptUrl = "/finance/payments/77/receipt";

const known: PaymentItem = {
  id: 77, student_id: 5, student_first_name: "Dilnoza", student_last_name: "Rustamova", amount: "900.25", paid_at: "2026-10-12T10:00:00Z", created_at: "2026-10-12T10:00:00Z",
  method: "transfer", recorded_by_id: 1, comment: "Autumn tuition", allocated_amount: "100.00", unallocated_amount: "800.25", is_voided: true, refunded_amount: "0",
  allocations: [{ charge_id: 1, course_id: 2, course_title: "Python Advanced", due_date: "2026-10-05", amount: "100.00" }],
};

const receipt = {
  receipt_number: "R-2026-0077", occurred_at: "2026-10-12T10:00:00Z", student_id: 5, student_name: "Receipt Name", student_email: "dilnoza@example.com", amount: "900.25",
  method: "transfer", accepted_by_name: "Acc Ountant", comment: null,
  allocations: [{ charge_id: 1, charge_type: "tuition", course_title: "Python Advanced", due_date: "2026-10-05", allocated_amount: "100.00" }],
};

function listing(items: PaymentItem[]) {
  return { items, total: items.length, page: 1, page_size: 100, total_pages: 1 };
}

function renderDetail(payment: PaymentItem = known) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PaymentDetailModal payment={payment} onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  mock.reset();
  await i18n.changeLanguage("en");
});
afterEach(() => cleanup());

describe("Payment detail", () => {
  it("leads with the student's name and reference, never the student ID, and exposes no mutation or export action", async () => {
    mock.onGet(statusUrl).reply(200, listing([known]));
    mock.onGet(receiptUrl).reply(200, receipt);
    renderDetail();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Payment #77" })).toBeTruthy();
    expect(within(dialog).getByText("Dilnoza Rustamova")).toBeTruthy();
    expect(await within(dialog).findByText("R-2026-0077")).toBeTruthy();
    expect(within(dialog).getByText("Acc Ountant")).toBeTruthy();
    expect(within(dialog).getByText("Autumn tuition")).toBeTruthy();
    expect(within(dialog).queryByText(/Student #|\b5\b/)).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /download|export|share|void|refund|accept/i })).toBeNull();
  });

  it("keeps the original cash beside a void and never clears the status from receipt fields", async () => {
    mock.onGet(statusUrl).reply(200, listing([known]));
    mock.onGet(receiptUrl).reply(200, { ...receipt, is_voided: false, refunded_amount: "0" });
    renderDetail();
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("R-2026-0077");
    expect(within(dialog).getByText("900.25 TJS")).toBeTruthy();
    expect(within(dialog).getByText("This payment was voided.")).toBeTruthy();
  });

  it("shows a refreshed void from the payments list over the opener's stale not-voided record", async () => {
    mock.onGet(statusUrl).reply(200, listing([known]));
    mock.onGet(receiptUrl).reply(200, receipt);
    renderDetail({ ...known, is_voided: false });
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("This payment was voided.")).toBeTruthy();
    expect(within(dialog).queryByText("Status could not be refreshed. Showing the last known status.")).toBeNull();
  });

  it("labels the last known status as stale with Retry when the status refresh fails, then recovers", async () => {
    mock.onGet(statusUrl).reply(500);
    mock.onGet(receiptUrl).reply(200, receipt);
    renderDetail();
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Status could not be refreshed. Showing the last known status.")).toBeTruthy();
    expect(within(dialog).getByText("This payment was voided.")).toBeTruthy();
    mock.onGet(statusUrl).reply(200, listing([{ ...known, is_voided: false, refunded_amount: "25.00" }]));
    await userEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(await within(dialog).findByText("Refunded: 25 TJS")).toBeTruthy();
    expect(within(dialog).queryByText("This payment was voided.")).toBeNull();
    expect(within(dialog).queryByText("Status could not be refreshed. Showing the last known status.")).toBeNull();
  });

  it("treats a payment missing from the refreshed list as stale instead of assuming it is unvoided", async () => {
    mock.onGet(statusUrl).reply(200, listing([]));
    mock.onGet(receiptUrl).reply(200, receipt);
    renderDetail();
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Status could not be refreshed. Showing the last known status.")).toBeTruthy();
    expect(within(dialog).getByText("This payment was voided.")).toBeTruthy();
  });

  it("keeps the known reference and status when the receipt fails and retries only the receipt", async () => {
    mock.onGet(statusUrl).reply(200, listing([known]));
    mock.onGet(receiptUrl).reply(500);
    renderDetail();
    const dialog = await screen.findByRole("dialog");
    const alert = await within(dialog).findByRole("alert");
    expect(within(dialog).getByRole("heading", { name: "Payment #77" })).toBeTruthy();
    expect(within(dialog).getByText("This payment was voided.")).toBeTruthy();
    expect(within(dialog).getByText("Python Advanced")).toBeTruthy();
    const statusCalls = mock.history.get.filter((request) => statusUrl.test(request.url ?? "")).length;
    mock.onGet(receiptUrl).reply(200, receipt);
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await within(dialog).findByText("R-2026-0077")).toBeTruthy();
    expect(mock.history.get.filter((request) => statusUrl.test(request.url ?? ""))).toHaveLength(statusCalls);
    expect(mock.history.post).toHaveLength(0);
  });

  it("reserves receipt geometry while loading and tells no allocations apart from a failed load", async () => {
    mock.onGet(statusUrl).reply(200, listing([{ ...known, allocations: [] }]));
    mock.onGet(receiptUrl).reply(() => new Promise(() => undefined));
    renderDetail({ ...known, allocations: [] });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Loading receipt reference…").closest("[aria-busy='true']")).toBeTruthy();
    expect(within(dialog).getByText("No current allocations")).toBeTruthy();
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("falls back to the receipt name and then Unknown student when the payment carries no name", async () => {
    mock.onGet(statusUrl).reply(200, listing([]));
    mock.onGet(receiptUrl).reply(200, receipt);
    renderDetail({ ...known, student_first_name: null, student_last_name: null });
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Receipt Name")).toBeTruthy();
    cleanup();
    mock.onGet(receiptUrl).reply(500);
    renderDetail({ ...known, student_first_name: null, student_last_name: null });
    expect(await within(await screen.findByRole("dialog")).findByText("Unknown student")).toBeTruthy();
  });
});
