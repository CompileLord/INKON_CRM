import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { DebtorsTab } from "./DebtorsTab";
import { FinanceUrlState } from "../../lib/finance/urlState";
import { Finance } from "../../pages/Finance";
import { httpClient } from "../../lib/auth/httpClient";
import { useAuthStore } from "../../store/authStore";
import type { DebtItem, PaymentItem } from "../../lib/finance/types";
import i18n from "../../i18n";

const mock = new MockAdapter(httpClient);
const debtsUrl = /\/finance\/debts\/\?/;
const analyticsUrl = /\/finance\/analytics\//;
const paymentsUrl = /\/finance\/payments\/\?/;

function debt(studentId: number, courseId: number, first: string, course: string, amount: string, overdue: number = 4): DebtItem {
  return {
    student: { id: studentId, first_name: first, last_name: "Karimova", email: first.toLowerCase() + "@example.com", payment_day_of_month: 5 },
    course: { id: courseId, title: course },
    price_at_enrollment: "1000.00",
    billed_to_date: "900.00",
    total_paid: "150.00",
    debt: amount,
    overdue_days: overdue,
  };
}

const anisa: DebtItem = debt(7, 11, "Anisa", "Python Advanced", "700.10");
const zara: DebtItem = debt(8, 12, "Zara", "English IELTS", "500.20", 0);
const paymentReply: PaymentItem = {
  id: 55, student_id: 7, amount: "100", paid_at: "2026-10-15T10:00:00Z", created_at: "2026-10-15T10:00:00Z", method: "cash", recorded_by_id: 1,
  allocated_amount: "100", unallocated_amount: "0", refunded_amount: "0", is_voided: false, allocations: [],
};

function listing(items: DebtItem[], overrides: Record<string, number> = {}) {
  return { items, total: items.length, page: 1, page_size: 20, total_pages: 1, ...overrides };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderDebtors(query: string = "?tab=debtors") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/finance" + query]}>
        <Finance />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function location(): string {
  return screen.getByTestId("location").textContent ?? "";
}

function debtRequests() {
  return mock.history.get.filter((request) => debtsUrl.test(request.url ?? ""));
}

function stubContainerWidth(width: number): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element): void {
        this.callback([{ target, contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve(): void {}
      disconnect(): void {}
    },
  );
}

beforeEach(async () => {
  mock.reset();
  await i18n.changeLanguage("en");
  useAuthStore.setState({ role: "accountant" });
  mock.onGet(analyticsUrl).reply(200, { net_receivable: "0", collected_in_period: "0", unpaid_students_count: 0 });
  mock.onGet(paymentsUrl).reply(200, listing([]));
  mock.onGet(debtsUrl).reply(200, listing([anisa, zara]));
  mock.onGet(/\/finance\/students\/\d+\/payment-options/).reply(200, {
    wallet_credit: "0",
    enrollments: [
      { enrollment_id: 501, course_id: 11, course_title: "Python Advanced", open_debt: "700.10", overdue_days: 4, remaining_contract_maximum: "1000", billing_mode: "paid" },
      { enrollment_id: 502, course_id: 12, course_title: "English IELTS", open_debt: "500.20", overdue_days: 0, remaining_contract_maximum: "800", billing_mode: "paid" },
    ],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Debtors toolbar and counts", () => {
  it("uses the singular debtor count for one row", async () => {
    mock.onGet(debtsUrl).reply(200, listing([anisa]));
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    expect(screen.getByText("1 debtor")).toBeTruthy();
  });

  it("searches only loaded rows, keeping the page-scoped count apart from the server total", async () => {
    mock.onGet(debtsUrl).reply(200, listing([anisa, zara], { total: 45, total_pages: 3 }));
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    expect(screen.getByText("45 debtors")).toBeTruthy();
    const before = debtRequests().length;
    await userEvent.type(screen.getByLabelText("Search this page"), "ielts");
    expect(screen.queryByText("Anisa Karimova")).toBeNull();
    expect(screen.getByText("Zara Karimova")).toBeTruthy();
    expect(screen.getByText("On this page: 1 of 2")).toBeTruthy();
    expect(screen.getByText("45 debtors")).toBeTruthy();
    expect(debtRequests()).toHaveLength(before);
    expect(location()).toBe("/finance?tab=debtors");
  });

  it("explains a page-local no-match and clears the search", async () => {
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.type(screen.getByLabelText("Search this page"), "zzz");
    expect(screen.getByText("No rows on this page match your search.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("Anisa Karimova")).toBeTruthy();
  });

  it("shows the localized record range with the server total", async () => {
    mock.onGet(debtsUrl).reply(200, listing([anisa, zara], { total: 45, page: 2, total_pages: 3 }));
    renderDebtors("?tab=debtors&dpage=2");
    expect(await screen.findByText("21–22 of 45")).toBeTruthy();
  });
});

describe("Debtors filters", () => {
  it("applies the overdue threshold through a listbox, resets only the page and sends overdue_days", async () => {
    renderDebtors("?tab=debtors&dpage=2&ppage=3");
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: /^Overdue/ }));
    const listbox = await screen.findByRole("listbox", { name: "Overdue" });
    expect(within(listbox).getAllByRole("option")).toHaveLength(6);
    await userEvent.click(within(listbox).getByRole("option", { name: "30+ d" }));
    await waitFor(() => expect(location()).toBe("/finance?tab=debtors&doverdue=30&ppage=3"));
    await waitFor(() => expect(debtRequests().at(-1)?.url).toContain("overdue_days=30"));
    expect(debtRequests().at(-1)?.url).toContain("page=1");
    expect(screen.getByText("Overdue 30+ d")).toBeTruthy();
    expect(document.querySelector("select")).toBeNull();
  });

  it("applies the status filter, removes chips and clears everything", async () => {
    renderDebtors("?tab=debtors&dcourse=11&doverdue=7");
    await screen.findByText("Course debts: Python Advanced");
    await userEvent.click(screen.getByRole("button", { name: /^Status/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Active" }));
    await waitFor(() => expect(debtRequests().at(-1)?.url).toContain("enrollment_status=active"));
    expect(screen.getByText("Status: Active")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Remove filter: Overdue 7+ d" }));
    await waitFor(() => expect(location()).toBe("/finance?tab=debtors&dcourse=11&dstatus=active"));
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(location()).toBe("/finance?tab=debtors"));
  });

  it("restores filters and page from the URL and never sends a student id", async () => {
    renderDebtors("?tab=debtors&dpage=2&doverdue=30&dstatus=active&student_id=7");
    await screen.findByText("Anisa Karimova");
    const url = debtRequests()[0].url ?? "";
    expect(url).toContain("page=2");
    expect(url).toContain("overdue_days=30");
    expect(url).toContain("enrollment_status=active");
    expect(url).not.toContain("student_id");
    expect(screen.getByRole("button", { name: /^Overdue.*30\+ d/ })).toBeTruthy();
  });

  it("distinguishes filtered-empty from never-empty and offers Clear filters", async () => {
    mock.onGet(debtsUrl).reply(200, listing([]));
    renderDebtors("?tab=debtors&doverdue=90");
    expect(await screen.findByText("No course balances match these filters.")).toBeTruthy();
    expect(screen.getByText("Overdue 90+ d")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(location()).toBe("/finance?tab=debtors"));
  });
});

describe("Debtors rows", () => {
  it("shows the overdue pill only for positive overdue days and Unavailable in details for unknown overdue", async () => {
    mock.onGet(debtsUrl).reply(200, listing([zara, { ...anisa, overdue_days: Number.NaN }]));
    renderDebtors();
    await screen.findByText("Zara Karimova");
    expect(screen.queryByText("0 d")).toBeNull();
    expect(screen.queryByText("NaN d")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Details for Anisa Karimova, Python Advanced" }));
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });

  it("opens details with the five definitions, never labelling settled amounts as paid, and keeps them open across payment", async () => {
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    const toggle = screen.getByRole("button", { name: "Details for Anisa Karimova, Python Advanced" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    for (const label of ["Monthly price", "Billed to date", "Settled against due charges", "Due unpaid", "Days overdue"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("150 TJS")).toBeTruthy();
    expect(screen.queryByText(/^Paid$|Amount paid|Cash paid|Contracted total/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Accept payment for Anisa Karimova, Python Advanced" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Details for Anisa Karimova, Python Advanced" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Monthly price")).toBeTruthy();
  });

  it("opens the payment dialog for the exact student and course of the row", async () => {
    renderDebtors();
    await screen.findByText("Zara Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Accept payment for Zara Karimova, English IELTS" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Zara Karimova")).toBeTruthy();
    expect(((await within(dialog).findByLabelText("Amount for English IELTS (TJS)")) as HTMLInputElement).value).toBe("500.20");
    expect((within(dialog).getByLabelText("Amount for Python Advanced (TJS)") as HTMLInputElement).value).toBe("");
  });

  it("links the name to the profile for a superadmin and keeps plain text for an accountant", async () => {
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    cleanup();
    useAuthStore.setState({ role: "superadmin" });
    renderDebtors();
    const link = await screen.findByRole("link", { name: "Open profile: Anisa Karimova" });
    expect(link.getAttribute("href")).toBe("/students/7");
  });

  it("renders one list layout at every width without a native table", async () => {
    stubContainerWidth(900);
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.querySelectorAll("li[data-row-key]").length).toBeGreaterThan(0);
  });

  it("offers an action slot per row and in the toolbar for later features", async () => {
    mock.onGet(debtsUrl).reply(200, listing([anisa]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DebtorsTab
            view={FinanceUrlState.parse(new URLSearchParams("tab=debtors")).debtors}
            recordedPayment={null}
            onPageChange={vi.fn()}
            onChangeFilters={vi.fn()}
            onAcceptPayment={vi.fn()}
            renderRowAction={(debt) => <button type="button">Slot {debt.student.first_name}</button>}
            toolbarAction={<button type="button">Bulk slot</button>}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText("Anisa Karimova");
    expect(screen.getByRole("button", { name: "Slot Anisa" })).toBeTruthy();
    expect(document.querySelector("[data-debtors-toolbar-action]")?.firstElementChild?.textContent).toBe("Bulk slot");
  });
});

describe("Debtors registry states", () => {
  it("keeps loaded rows with a stale notice when a refresh fails, and recovers with Retry", async () => {
    let failing = false;
    mock.onGet(debtsUrl).reply(() => (failing ? [500] : [200, listing([anisa, zara])]));
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    failing = true;
    await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
    await userEvent.click(screen.getByRole("tab", { name: "Debtors" }));
    const notice = await screen.findByText("Could not refresh. Showing the last loaded data.");
    expect(screen.getByText("Anisa Karimova")).toBeTruthy();
    failing = false;
    await userEvent.click(within(notice.closest("[role='status']") as HTMLElement).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("Could not refresh. Showing the last loaded data.")).toBeNull());
  });

  it("shows an actionable error before any data and retries", async () => {
    mock.onGet(debtsUrl).reply(500);
    renderDebtors();
    expect(await screen.findByText("Debtors could not be loaded.")).toBeTruthy();
    mock.onGet(debtsUrl).reply(200, listing([anisa]));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Anisa Karimova")).toBeTruthy();
  });

  it("announces the move to the last valid page", async () => {
    mock.onGet(debtsUrl).reply(200, { items: [], total: 4, page: 9, page_size: 20, total_pages: 1 });
    renderDebtors("?tab=debtors&dpage=9");
    await waitFor(() => expect(location()).toBe("/finance?tab=debtors"));
    expect(screen.getAllByRole("status").some((node) => node.textContent === "Moved to the last page.")).toBe(true);
  });

  it("moves focus to the next row when a paid row disappears", async () => {
    let remaining: DebtItem[] = [anisa, zara];
    mock.onGet(debtsUrl).reply(() => [200, listing(remaining)]);
    mock.onPost("/finance/payments/").reply(() => {
      remaining = [zara];
      return [201, paymentReply];
    });
    renderDebtors();
    await screen.findByText("Anisa Karimova");
    await userEvent.click(screen.getByRole("button", { name: "Accept payment for Anisa Karimova, Python Advanced" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect((within(dialog).getByLabelText("Amount for Python Advanced (TJS)") as HTMLInputElement).value).toBe("700.10"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Accept Payment" }));
    await waitFor(() => expect(screen.queryByText("Anisa Karimova")).toBeNull());
    await waitFor(() => {
      const row = document.querySelector("[data-row-key='8-12']");
      expect(row?.contains(document.activeElement)).toBe(true);
    });
  });
});

describe("Debtors exact student context", () => {
  it("sends student_id together with course_id and shows a clearable student chip", async () => {
    mock.onGet(debtsUrl).reply(200, listing([anisa]));
    renderDebtors("?tab=debtors&dcourse=11&dstudent=7&dname=Anisa+Karimova");
    await screen.findByText("Python Advanced");
    const url = debtRequests()[0].url ?? "";
    expect(url).toContain("student_id=7");
    expect(url).toContain("course_id=11");
    expect(screen.getByText("Student: Anisa Karimova")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Clear the student filter" }));
    await waitFor(() => expect(location()).toBe("/finance?tab=debtors&dcourse=11"));
    await waitFor(() => expect(debtRequests().at(-1)?.url).not.toContain("student_id"));
    expect(debtRequests().at(-1)?.url).toContain("course_id=11");
  });

  it("restarts the page at one when the student changes and never filters by name locally", async () => {
    renderDebtors("?tab=debtors&dpage=3&dstudent=7&dname=Anisa+Karimova");
    await screen.findByText("Python Advanced");
    expect(debtRequests()[0].url).toContain("page=3");
    await userEvent.click(screen.getByRole("button", { name: "Clear the student filter" }));
    await waitFor(() => expect(location()).toBe("/finance?tab=debtors"));
    expect(debtRequests().at(-1)?.url).toContain("page=1");
  });

  it("explains a missing student balance with Back and keeps the context chip", async () => {
    mock.onGet(debtsUrl).reply(200, listing([]));
    renderDebtors("?tab=debtors&dstudent=99&dname=Removed+Person");
    expect(await screen.findByText(/No unpaid balance found for this student/)).toBeTruthy();
    expect(screen.getByText("Student: Removed Person")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.queryByText("Accept payment", { selector: "dialog *" })).toBeNull();
  });

  it("keeps the student context while a failed request is retried", async () => {
    mock.onGet(debtsUrl).reply(500);
    renderDebtors("?tab=debtors&dstudent=7&dname=Anisa+Karimova");
    await screen.findByText("Debtors could not be loaded.");
    expect(screen.getByText("Student: Anisa Karimova")).toBeTruthy();
    mock.onGet(debtsUrl).reply(200, listing([anisa]));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Python Advanced");
    expect(debtRequests().every((request) => (request.url ?? "").includes("student_id=7"))).toBe(true);
  });

  it("ignores an invalid student id in the URL", async () => {
    renderDebtors("?tab=debtors&dstudent=abc");
    await screen.findByText("Anisa Karimova");
    expect(debtRequests()[0].url).not.toContain("student_id");
  });
});
