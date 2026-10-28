import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FinanceUrlState } from "../lib/finance/urlState";
import { analytics, analyticsUrl, configureFinanceMocks, debt, debtsUrl, location, mock, page, payment, paymentsUrl, renderFinance, requests, twoCourseDebts, typeDate } from "./FinanceTestSupport";

beforeEach(async () => {
  await configureFinanceMocks();
});
afterEach(() => cleanup());

describe("Finance navigation", () => {
  it("renders one H1, one global Accept payment action and three accessible tabs", async () => {
    renderFinance();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Overview", "Debtors", "Payments"]);
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("button", { name: "Accept Payment" })).toHaveLength(1);
    await screen.findAllByText("Anisa Karimova");
  });

  it("changes tabs immediately, supports arrow keys and restores each tab's own page", async () => {
    renderFinance("/finance?tab=debtors&dpage=1&ppage=1");
    await screen.findAllByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("tab", { name: "Payments" }));
    expect(location()).toBe("/finance?tab=payments");
    screen.getByRole("tab", { name: "Payments" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(location()).toBe("/finance?tab=debtors");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Debtors" }));
  });

  it("keeps the debtors page when switching away and back, and a filter change resets only the debtors page", async () => {
    mock.onGet(debtsUrl).reply(200, { items: twoCourseDebts, total: 60, page: 3, page_size: 20, total_pages: 3 });
    mock.onGet(paymentsUrl).reply(200, { items: [payment], total: 60, page: 2, page_size: 20, total_pages: 3 });
    renderFinance("/finance?tab=debtors&dpage=3&dcourse=11&ppage=2");
    await screen.findAllByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("tab", { name: "Payments" }));
    expect(location()).toBe("/finance?tab=payments&dpage=3&dcourse=11&ppage=2");
    await userEvent.click(screen.getByRole("tab", { name: "Debtors" }));
    expect(location()).toBe("/finance?tab=debtors&dpage=3&dcourse=11&ppage=2");
    await userEvent.click(screen.getByRole("button", { name: "Clear the course filter" }));
    expect(location()).toBe("/finance?tab=debtors&ppage=2");
  });

  it("ignores unsupported URL state and never sends student_id to the debts endpoint", async () => {
    renderFinance("/finance?tab=bogus&student_id=7&dcourse=-1&dstatus=nope");
    await screen.findAllByText("Anisa Karimova");
    for (const request of [...requests(debtsUrl), ...requests(paymentsUrl)]) {
      expect(request.url).not.toContain("student_id");
      expect(request.url).not.toContain("course_id");
    }
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("Finance overview", () => {
  it("shows two identified course balances for one student and never a fetched-page sum", async () => {
    renderFinance();
    await screen.findAllByText("Python Advanced");
    const balances = screen.getByRole("region", { name: "Course balances" });
    const rows = within(balances).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Python Advanced")).toBeTruthy();
    expect(within(rows[1]).getByText("English IELTS")).toBeTruthy();
    expect(within(rows[0]).getByText("700.10 TJS")).toBeTruthy();
    expect(requests(debtsUrl)[0].url).toContain("page=1");
    expect(requests(debtsUrl)[0].url).toContain("page_size=5");
    expect(requests(paymentsUrl)[0].url).toContain("page_size=5");
    expect(requests(paymentsUrl)[0].url).not.toContain("date_from");
    expect(within(balances).queryByText("1 200.30 TJS")).toBeNull();
  });

  it("opens the payment dialog for the exact student and course of the row", async () => {
    renderFinance();
    await screen.findAllByText("Python Advanced");
    const balances = screen.getByRole("region", { name: "Course balances" });
    await userEvent.click(within(balances).getByRole("button", { name: "Accept payment for Anisa Karimova, English IELTS" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Anisa Karimova")).toBeTruthy();
    expect(((await within(dialog).findByLabelText("Amount for English IELTS (TJS)")) as HTMLInputElement).value).toBe("500.20");
    expect((within(dialog).getByLabelText("Amount for Python Advanced (TJS)") as HTMLInputElement).value).toBe("");
  });

  it("keeps big decimal strings exact without float conversion", async () => {
    renderFinance();
    expect(await screen.findByText("12 345 678 901 234 567 890.125 TJS")).toBeTruthy();
  });

  it("shows a valid zero collection as 0.00 and labels current values as current", async () => {
    renderFinance();
    const summary = screen.getByRole("region", { name: "Finance summary" });
    await within(summary).findByText("0 TJS");
    expect(within(summary).getByText("Current due unpaid")).toBeTruthy();
    expect(within(summary).getByText("Current unpaid students")).toBeTruthy();
    expect(within(summary).getByText("Collected in period")).toBeTruthy();
  });

  it("builds the summary from one shared stat group without info tooltips", async () => {
    renderFinance();
    const summary = screen.getByRole("region", { name: "Finance summary" });
    await within(summary).findByText("0 TJS");
    expect(summary.querySelectorAll("[data-stat-group]")).toHaveLength(1);
    expect(summary.querySelectorAll("[data-stat-tile]")).toHaveLength(3);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.queryByRole("button", { name: /^About:/ })).toBeNull();
  });

  it("shows names, not student numbers, unless two visible rows share a name", async () => {
    renderFinance();
    await screen.findAllByText("Python Advanced");
    expect(within(screen.getByRole("region", { name: "Course balances" })).queryByText(/Student #/)).toBeNull();
    mock.onGet(debtsUrl).reply(200, page([debt(7, 11, "Anisa", "Python Advanced", "700.10"), debt(8, 12, "Anisa", "English IELTS", "500.20")]));
    cleanup();
    renderFinance();
    await screen.findAllByText("English IELTS");
    const balances = screen.getByRole("region", { name: "Course balances" });
    expect(within(balances).getByText("Student #7")).toBeTruthy();
    expect(within(balances).getByText("Student #8")).toBeTruthy();
  });

  it("defaults the range to the school month and requests it explicitly", async () => {
    renderFinance();
    await screen.findAllByText("Anisa Karimova");
    const range = FinanceUrlState.defaultRange();
    expect(requests(analyticsUrl)[0].url).toContain("date_from=" + range.from);
    expect(requests(analyticsUrl)[0].url).toContain("date_to=" + range.to);
  });

  it("rejects inverted and incomplete ranges before any query and keeps the URL", async () => {
    renderFinance();
    const summary = screen.getByRole("region", { name: "Finance summary" });
    await within(summary).findByText("0 TJS");
    const before = requests(analyticsUrl).length;
    await userEvent.click(within(summary).getByRole("button", { name: /^Collection period:/ }));
    await screen.findByLabelText("From");
    typeDate("From", "");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Choose both a start date and an end date.");
    typeDate("From", "20.10.2026");
    typeDate("To", "01.10.2026");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The start date must not be after the end date.");
    expect(requests(analyticsUrl)).toHaveLength(before);
    expect(location()).toBe("/finance");
  });

  it("applies a valid range to collection only while current values keep their labels and request", async () => {
    mock.onGet(analyticsUrl).reply((config) => {
      const isHistorical = (config.url ?? "").includes("date_from=2026-01-01");
      return [200, { ...analytics, collected_in_period: isHistorical ? "-25.50" : "0" }];
    });
    renderFinance();
    const summary = screen.getByRole("region", { name: "Finance summary" });
    await within(summary).findByText("0 TJS");
    await userEvent.click(within(summary).getByRole("button", { name: /^Collection period:/ }));
    await screen.findByLabelText("From");
    typeDate("From", "01.01.2026");
    typeDate("To", "31.01.2026");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await within(summary).findByText("-25.50 TJS");
    expect(location()).toBe("/finance?from=2026-01-01&to=2026-01-31");
    expect(within(summary).getByText("12 345 678 901 234 567 890.125 TJS")).toBeTruthy();
    expect(within(summary).getByText("Current due unpaid")).toBeTruthy();
    const currentRange = FinanceUrlState.defaultRange();
    expect(requests(analyticsUrl).some((request) => (request.url ?? "").includes("date_from=" + currentRange.from))).toBe(true);
  });

  it("applies the Last month preset from the compact range popover", async () => {
    renderFinance();
    const summary = screen.getByRole("region", { name: "Finance summary" });
    await within(summary).findByText("0 TJS");
    const range = FinanceUrlState.presetRange("lastMonth");
    await userEvent.click(within(summary).getByRole("button", { name: /^Collection period:/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Last month" }));
    await waitFor(() => expect(location()).toBe("/finance?from=" + range.from + "&to=" + range.to));
    expect(requests(analyticsUrl).some((request) => (request.url ?? "").includes("date_from=" + range.from))).toBe(true);
    expect(screen.queryByLabelText("From")).toBeNull();
  });

  it("isolates preview failures, never shows zero for them and retries only the failed one", async () => {
    mock.onGet(debtsUrl).reply(500);
    renderFinance();
    const balances = await screen.findByRole("region", { name: "Course balances" });
    expect(await within(balances).findByRole("alert")).toBeTruthy();
    const latest = screen.getByRole("region", { name: "Latest payments" });
    expect(await within(latest).findByRole("button", { name: "Details for Dilnoza Rustamova, payment 123" })).toBeTruthy();
    const paymentCalls = requests(paymentsUrl).length;
    mock.onGet(debtsUrl).reply(200, page(twoCourseDebts));
    await userEvent.click(within(balances).getByRole("button", { name: "Retry" }));
    await within(balances).findByText("Python Advanced");
    expect(requests(paymentsUrl)).toHaveLength(paymentCalls);
  });

  it("shows Unavailable and Retry for failed metrics instead of zero", async () => {
    mock.onGet(analyticsUrl).reply(500);
    renderFinance();
    const summary = screen.getByRole("region", { name: "Finance summary" });
    await waitFor(() => expect(within(summary).getAllByText("Unavailable").length).toBeGreaterThan(0));
    expect(within(summary).queryByText(/0\.00 TJS/)).toBeNull();
    expect(within(summary).getAllByRole("button", { name: "Retry" }).length).toBeGreaterThan(0);
  });

  it("explains empty previews without a scope badge", async () => {
    mock.onGet(debtsUrl).reply(200, page([]));
    mock.onGet(paymentsUrl).reply(200, page([]));
    renderFinance();
    expect(await screen.findByText(/no unpaid course balances right now/)).toBeTruthy();
    expect(await screen.findByText(/No payments have been recorded yet/)).toBeTruthy();
    expect(screen.queryByText("All dates")).toBeNull();
  });

  it("opens Debtors and Payments from the preview footers", async () => {
    renderFinance();
    await screen.findAllByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "View all course balances" }));
    expect(location()).toBe("/finance?tab=debtors");
    expect(screen.getByRole("tab", { name: "Debtors" }).getAttribute("aria-selected")).toBe("true");
  });

  it("opens payment details from the latest payments and returns focus to the trigger", async () => {
    mock.onGet("/finance/payments/123/receipt").reply(200, { receipt_number: "R-1", student_name: "Anisa", accepted_by_name: "Acc", allocations: [] });
    renderFinance();
    const trigger = await screen.findByRole("button", { name: "Details for Dilnoza Rustamova, payment 123" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("R-1");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
