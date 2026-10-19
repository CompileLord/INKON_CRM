import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { Finance } from "./Finance";
import { httpClient } from "../lib/auth/httpClient";
import { FinanceUrlState } from "../lib/finance/urlState";
import type { DebtItem, FinanceAnalyticsResponse, PaymentItem } from "../lib/finance/types";
import i18n from "../i18n";

const mock = new MockAdapter(httpClient);
const analyticsUrl = /\/finance\/analytics\//;
const debtsUrl = /\/finance\/debts\/\?/;
const paymentsUrl = /\/finance\/payments\/\?/;

const analytics: FinanceAnalyticsResponse = {
  gross_contract_value: "5000.00", billed_to_date: "1500.00", billed_in_period: "1500.00",
  net_receivable: "12345678901234567890.125", collected_in_period: "0", outstanding_credit: "0",
  aging: { d0_30: "0", d31_60: "0", d61_90: "0", d90_plus: "0" }, unpaid_students_count: 3, collection_rate: "0", debtors_preview: [],
};

function debt(studentId: number, courseId: number, name: string, course: string, amount: string): DebtItem {
  return {
    student: { id: studentId, first_name: name, last_name: "Karimova", email: name.toLowerCase() + "@example.com", payment_day_of_month: 5 },
    course: { id: courseId, title: course }, price_at_enrollment: "1000.00", billed_to_date: "1000.00", total_paid: "0", debt: amount, overdue_days: 4,
  };
}

const twoCourseDebts: DebtItem[] = [debt(7, 11, "Anisa", "Python Advanced", "700.10"), debt(7, 12, "Anisa", "English IELTS", "500.20")];
const payment: PaymentItem = {
  id: 123, student_id: 7, student_first_name: "Dilnoza", student_last_name: "Rustamova", amount: "750.50", paid_at: "2026-09-20T19:00:00Z", created_at: "2026-10-11T10:00:00Z", method: "cash",
  recorded_by_id: 1, allocated_amount: "500.25", unallocated_amount: "250.25", refunded_amount: "0", is_voided: false,
  allocations: [{ charge_id: 1, course_id: 2, course_title: "First Course", amount: "500.25", due_date: "2026-09-21" }],
};

function page<T>(items: T[]) { return { items, total: items.length, page: 1, page_size: 5, total_pages: items.length ? 1 : 0 }; }

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderFinance(initial: string = "/finance") {
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

function location(): string {
  return screen.getByTestId("location").textContent ?? "";
}

function requests(pattern: RegExp) {
  return mock.history.get.filter((request) => pattern.test(request.url ?? ""));
}

beforeEach(async () => {
  mock.reset();
  await i18n.changeLanguage("en");
  mock.onGet(analyticsUrl).reply(200, analytics);
  mock.onGet(debtsUrl).reply(200, page(twoCourseDebts));
  mock.onGet(paymentsUrl).reply(200, page([payment]));
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
    expect(within(dialog).getByText("English IELTS")).toBeTruthy();
    expect(within(dialog).queryByText("Python Advanced")).toBeNull();
  });

  it("keeps big decimal strings exact without float conversion", async () => {
    renderFinance();
    expect(await screen.findByText("12 345 678 901 234 567 890.125 TJS")).toBeTruthy();
  });

  it("shows a valid zero collection as 0.00 and labels current values as current", async () => {
    renderFinance();
    const summary = screen.getByRole("region", { name: "Finance summary" });
    await within(summary).findByText("0.00 TJS");
    expect(within(summary).getByText("Current due unpaid")).toBeTruthy();
    expect(within(summary).getByText("Current unpaid students")).toBeTruthy();
    expect(within(summary).getByText("Net cash collected")).toBeTruthy();
  });

  it("keeps explanations out of the page until an info tooltip is opened", async () => {
    renderFinance();
    const summary = screen.getByRole("region", { name: "Finance summary" });
    await within(summary).findByText("0.00 TJS");
    expect(screen.queryByText(/cash refunds paid out/)).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
    await userEvent.click(within(summary).getByRole("button", { name: "About: Net cash collected" }));
    expect(screen.getByRole("tooltip").textContent).toMatch(/cash refunds paid out/);
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
    await within(summary).findByText("0.00 TJS");
    const before = requests(analyticsUrl).length;
    await userEvent.click(within(summary).getByRole("button", { name: /^Collection period:/ }));
    const from = await screen.findByLabelText("From");
    const to = screen.getByLabelText("To");
    await userEvent.clear(from);
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Choose both a start date and an end date.");
    await userEvent.type(from, "2026-10-20");
    await userEvent.clear(to);
    await userEvent.type(to, "2026-10-01");
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
    await within(summary).findByText("0.00 TJS");
    await userEvent.click(within(summary).getByRole("button", { name: /^Collection period:/ }));
    await userEvent.clear(await screen.findByLabelText("From"));
    await userEvent.type(screen.getByLabelText("From"), "2026-01-01");
    await userEvent.clear(screen.getByLabelText("To"));
    await userEvent.type(screen.getByLabelText("To"), "2026-01-31");
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
    await within(summary).findByText("0.00 TJS");
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

  it("explains empty previews and labels the payments preview as all dates", async () => {
    mock.onGet(debtsUrl).reply(200, page([]));
    mock.onGet(paymentsUrl).reply(200, page([]));
    renderFinance();
    expect(await screen.findByText(/no unpaid course balances right now/)).toBeTruthy();
    expect(await screen.findByText(/No payments have been recorded yet/)).toBeTruthy();
    expect(screen.getByText("All dates")).toBeTruthy();
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

describe("Course balance action", () => {
  it("is a quiet ghost Pay action with the full accessible name, 44px target and no border", async () => {
    renderFinance();
    await screen.findAllByText("Python Advanced");
    const balances = screen.getByRole("region", { name: "Course balances" });
    const action = within(balances).getByRole("button", { name: "Accept payment for Anisa Karimova, Python Advanced" });
    expect(action.textContent).toBe("Pay");
    expect(action.className).toContain("min-h-11");
    expect(action.className).toContain("text-maroon-text");
    expect(action.className).not.toMatch(/(^|\s)border(\s|$)/);
    expect(action.className).not.toContain("bg-card");
    expect(within(balances).queryByText("Accept Payment")).toBeNull();
  });
});

describe("Latest payments identity", () => {
  it("leads with the student's name and demotes the payment reference", async () => {
    renderFinance();
    const latest = screen.getByRole("region", { name: "Latest payments" });
    expect(await within(latest).findByText("Dilnoza Rustamova")).toBeTruthy();
    expect(within(latest).queryByText(/Payment #/)).toBeNull();
    expect(within(latest).getByText("First Course")).toBeTruthy();
    expect(within(latest).getByText("Cash")).toBeTruthy();
    expect(within(latest).queryByText(/Student #/)).toBeNull();
  });

  it("falls back to a translated Unknown student when both name parts are missing", async () => {
    mock.onGet(paymentsUrl).reply(200, page([{ ...payment, student_first_name: null, student_last_name: null }]));
    renderFinance();
    const latest = screen.getByRole("region", { name: "Latest payments" });
    expect(await within(latest).findByText("Unknown student")).toBeTruthy();
    expect(within(latest).queryByText(/Student #7/)).toBeNull();
  });

  it("adds the student number only when two visible payers share a name", async () => {
    mock.onGet(paymentsUrl).reply(200, page([payment, { ...payment, id: 124, student_id: 9 }]));
    renderFinance();
    const latest = screen.getByRole("region", { name: "Latest payments" });
    await within(latest).findAllByText("Dilnoza Rustamova");
    expect(within(latest).getByText("Student #7")).toBeTruthy();
    expect(within(latest).getByText("Student #9")).toBeTruthy();
  });
});

describe("Finance motion and controls", () => {
  it("crossfades tab panels over 200ms with a fresh panel per tab and uses no native select", async () => {
    renderFinance();
    await screen.findAllByText("Anisa Karimova");
    const overviewPanel = screen.getByRole("tabpanel");
    expect(overviewPanel.className).toContain("duration-200");
    expect(overviewPanel.className).toContain("starting:opacity-0");
    await userEvent.click(screen.getByRole("tab", { name: "Debtors" }));
    const debtorsPanel = screen.getByRole("tabpanel");
    expect(debtorsPanel).not.toBe(overviewPanel);
    expect(debtorsPanel.className).toContain("duration-200");
    expect(document.querySelector("select")).toBeNull();
  });

  it("opens the range popover with a 150ms opacity and scale arrival from its anchor", async () => {
    renderFinance();
    const summary = screen.getByRole("region", { name: "Finance summary" });
    await userEvent.click(within(summary).getByRole("button", { name: /^Collection period:/ }));
    const popup = (await screen.findByText("Collection period", { selector: "[id]" })).closest("[class*='origin-']") as HTMLElement;
    expect(popup.className).toContain("duration-150");
    expect(popup.className).toContain("origin-[var(--transform-origin)]");
    expect(popup.className).toContain("data-[starting-style]:opacity-0");
    expect(popup.className).toContain("motion-safe:data-[starting-style]:scale-[0.96]");
  });
});

describe("Debtors course handoff", () => {
  it("labels a validated course filter as course debts, sends only course_id and clears it", async () => {
    renderFinance("/finance?tab=debtors&dcourse=11");
    expect(await screen.findByText("Course debts: Python Advanced")).toBeTruthy();
    const request = requests(debtsUrl)[0];
    expect(request.url).toContain("course_id=11");
    expect(request.url).not.toContain("student_id");
    await userEvent.click(screen.getByRole("button", { name: "Clear the course filter" }));
    expect(location()).toBe("/finance?tab=debtors");
    expect(screen.queryByText(/Course debts:/)).toBeNull();
  });

  it("falls back to the course number when no returned row names the course", async () => {
    mock.onGet(debtsUrl).reply(200, page([]));
    renderFinance("/finance?tab=debtors&dcourse=99");
    expect(await screen.findByText("Course debts: Course #99")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear the course filter" })).toBeTruthy();
  });

  it("moves to the last valid page when the requested page no longer exists", async () => {
    mock.onGet(debtsUrl).reply(200, { items: [], total: 4, page: 9, page_size: 20, total_pages: 1 });
    renderFinance("/finance?tab=debtors&dpage=9");
    await waitFor(() => expect(location()).toBe("/finance?tab=debtors"));
  });
});

describe("Accountant containment", () => {
  it("renders no student, course or profile links anywhere on the finance page", async () => {
    renderFinance();
    await screen.findAllByText("Anisa Karimova");
    for (const link of screen.queryAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/\/(students|courses|mentors)/);
    }
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
