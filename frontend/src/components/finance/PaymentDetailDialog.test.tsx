import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

describe("Payment detail receipt print", () => {
  const withTargets = {
    ...receipt,
    comment: "Autumn tuition",
    targets: [
      { enrollment_id: 501, course_id: 11, course_title: "Web Frontend", amount: "600.25" },
      { enrollment_id: 502, course_id: 12, course_title: "English Elementary", amount: "300.00" },
    ],
  };

  it("lists the payment targets with course and amount", async () => {
    mock.onGet(statusUrl).reply(200, listing([known]));
    mock.onGet(receiptUrl).reply(200, withTargets);
    renderDetail();
    const section = (await screen.findByRole("heading", { name: "Paid by course" })).closest("section") as HTMLElement;
    expect(within(section).getByText("Web Frontend")).toBeTruthy();
    expect(within(section).getByText("600.25 TJS")).toBeTruthy();
    expect(within(section).getByText("English Elementary")).toBeTruthy();
    expect(within(section).getByText("300 TJS")).toBeTruthy();
  });

  it("keeps Print receipt disabled until the receipt arrives, then prints the receipt with its targets", async () => {
    mock.onGet(statusUrl).reply(200, listing([known]));
    mock.onGet(receiptUrl).reply(200, withTargets);
    const printed = { document: document.implementation.createHTMLDocument(""), focus: vi.fn(), print: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(printed as unknown as Window);
    renderDetail();
    const button = (await screen.findByRole("button", { name: "Print receipt" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await waitFor(() => expect(button.disabled).toBe(false));
    await userEvent.click(button);
    expect(open).toHaveBeenCalledTimes(1);
    expect(printed.print).toHaveBeenCalledTimes(1);
    const body = printed.document.body.textContent ?? "";
    expect(printed.document.body.querySelector("h1")?.textContent).toBe("Receipt R-2026-0077");
    for (const expected of ["Receipt Name", "Acc Ountant", "900.25 TJS", "Web Frontend", "600.25 TJS", "English Elementary", "300 TJS", "Autumn tuition"]) {
      expect(body).toContain(expected);
    }
    open.mockRestore();
  });

  it("tells the user when the browser blocks the print window", async () => {
    mock.onGet(statusUrl).reply(200, listing([known]));
    mock.onGet(receiptUrl).reply(200, withTargets);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderDetail();
    const button = (await screen.findByRole("button", { name: "Print receipt" })) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    await userEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toBe("The browser blocked the print window. Allow pop-ups and try again.");
    open.mockRestore();
  });
});

describe("Payment detail receipt reversals", () => {
  const printed = () => ({ document: document.implementation.createHTMLDocument(""), focus: vi.fn(), print: vi.fn() });

  it("marks a valid receipt with nothing extra", async () => {
    mock.onGet(statusUrl).reply(200, listing([known]));
    mock.onGet(receiptUrl).reply(200, { ...receipt, status: "valid", refunded_amount: "0", net_amount: "900.25" });
    renderDetail();
    await screen.findByText("R-2026-0077");
    expect(screen.queryByTestId("receipt-reversal")).toBeNull();
  });

  it("shows a voided receipt on screen and in print", async () => {
    mock.onGet(statusUrl).reply(200, listing([known]));
    mock.onGet(receiptUrl).reply(200, { ...receipt, status: "voided", refunded_amount: "0", net_amount: "0" });
    const window2 = printed();
    const open = vi.spyOn(window, "open").mockReturnValue(window2 as unknown as Window);
    renderDetail();
    expect((await screen.findByTestId("receipt-reversal")).textContent).toContain("Voided");
    const button = screen.getByRole("button", { name: "Print receipt" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(button);
    expect(window2.document.body.querySelector(".mark")?.textContent).toBe("Voided");
    expect(window2.document.body.textContent).toContain("Net amount");
    open.mockRestore();
  });

  it("shows the refunded amount and the net amount for a partly refunded receipt", async () => {
    mock.onGet(statusUrl).reply(200, listing([known]));
    mock.onGet(receiptUrl).reply(200, { ...receipt, status: "partially_refunded", refunded_amount: "100", net_amount: "800.25" });
    const window2 = printed();
    const open = vi.spyOn(window, "open").mockReturnValue(window2 as unknown as Window);
    renderDetail();
    const mark = await screen.findByTestId("receipt-reversal");
    expect(mark.textContent).toContain("Refunded 100 TJS");
    expect(mark.textContent).toContain("800.25 TJS");
    const button = screen.getByRole("button", { name: "Print receipt" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(button);
    expect(window2.document.body.querySelector(".mark")?.textContent).toBe("Refunded 100 TJS");
    expect(window2.document.body.textContent).toContain("800.25 TJS");
    open.mockRestore();
  });
});
