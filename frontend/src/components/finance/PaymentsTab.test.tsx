import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { Finance } from "../../pages/Finance";
import { httpClient } from "../../lib/auth/httpClient";
import { useAuthStore } from "../../store/authStore";
import type { PaymentAllocationItem, PaymentItem } from "../../lib/finance/types";
import i18n from "../../i18n";

const mock = new MockAdapter(httpClient);
const paymentsUrl = /\/finance\/payments\/\?/;
const debtsUrl = /\/finance\/debts\/\?/;
const analyticsUrl = /\/finance\/analytics\//;

function allocation(courseId: number, title: string): PaymentAllocationItem {
  return { charge_id: courseId * 10, course_id: courseId, course_title: title, due_date: "2026-10-05", amount: "100.00" };
}

function payment(id: number, studentId: number, first: string | null, last: string | null, overrides: Partial<PaymentItem> = {}): PaymentItem {
  return {
    id, student_id: studentId, student_first_name: first, student_last_name: last, amount: "750.50", paid_at: "2026-10-12T10:00:00Z", created_at: "2026-10-12T10:00:00Z",
    method: "cash", recorded_by_id: 1, allocated_amount: "100.00", unallocated_amount: "650.50", is_voided: false, refunded_amount: "0", allocations: [allocation(2, "Python Advanced")], ...overrides,
  };
}

const unallocated = payment(31, 1, "Zara", "Nazarova", { allocations: [] });
const single = payment(32, 2, "Dilnoza", "Rustamova");
const many = payment(33, 3, "Anisa", "Karimova", { allocations: [allocation(2, "Python Advanced"), allocation(3, "English IELTS"), allocation(3, "English IELTS")] });
const voided = payment(34, 4, "Bahrom", "Qodirov", { is_voided: true, amount: "900.25", method: "transfer" });
const refunded = payment(35, 5, "Nigora", "Saidova", { refunded_amount: "50.25" });
const nameless = payment(36, 6, null, null);
const REGISTRY: PaymentItem[] = [unallocated, single, many, voided, refunded, nameless];

function listing(items: PaymentItem[], overrides: Record<string, number> = {}) {
  return { items, total: items.length, page: 1, page_size: 20, total_pages: items.length ? 1 : 0, ...overrides };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderPayments(query: string = "?tab=payments") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/finance" + query]}>
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

function paymentRequests() {
  return mock.history.get.filter((request) => paymentsUrl.test(request.url ?? ""));
}

function lastParams(): URLSearchParams {
  return new URL("http://x" + (paymentRequests().at(-1)?.url ?? "")).searchParams;
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
  mock.onGet(debtsUrl).reply(200, listing([]));
  mock.onGet(paymentsUrl).reply(200, listing(REGISTRY));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Payments registry layout", () => {
  it("renders a seven-column table at 960px of content width and a divided list below it", async () => {
    stubContainerWidth(960);
    renderPayments();
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Student", "Allocation", "Cash received", "Method and date", "Status", "Details",
    ]);
    cleanup();
    stubContainerWidth(959);
    renderPayments();
    await screen.findByText("Dilnoza Rustamova");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(REGISTRY.length);
  });

  it("summarises allocations as none, one course title or the distinct course count", async () => {
    stubContainerWidth(1200);
    renderPayments();
    await screen.findByRole("table");
    const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;
    expect(within(rowOf("Zara Nazarova")).getByText("No allocation")).toBeTruthy();
    expect(within(rowOf("Dilnoza Rustamova")).getByText("Python Advanced")).toBeTruthy();
    expect(within(rowOf("Anisa Karimova")).getByText("Courses: 2")).toBeTruthy();
    expect(within(rowOf("Anisa Karimova")).queryByText("Python Advanced")).toBeNull();
  });

  it("keeps voided and refunded visible beside the original cash and shows nothing loud for ordinary payments", async () => {
    stubContainerWidth(1200);
    renderPayments();
    await screen.findByRole("table");
    const voidedRow = screen.getByText("Bahrom Qodirov").closest("tr") as HTMLElement;
    expect(within(voidedRow).getByText("900.25 TJS")).toBeTruthy();
    expect(within(voidedRow).getByText("Voided").closest("[title]")?.getAttribute("title")).toBe("This payment was voided.");
    expect(within(voidedRow).getByText("Voided")).toBeTruthy();
    const refundedRow = screen.getByText("Nigora Saidova").closest("tr") as HTMLElement;
    expect(within(refundedRow).getByText("750.50 TJS")).toBeTruthy();
    expect(within(refundedRow).getByText("Refunded 50.25 TJS")).toBeTruthy();
    const ordinaryRow = screen.getByText("Dilnoza Rustamova").closest("tr") as HTMLElement;
    expect(within(ordinaryRow).queryByText(/voided|Refunded/i)).toBeNull();
  });

  it("identifies students by name, falls back to Unknown student and never uses the student ID as identity", async () => {
    stubContainerWidth(1200);
    renderPayments();
    await screen.findByRole("table");
    expect(screen.getByText("Unknown student")).toBeTruthy();
    expect(screen.queryByText(/Student #/)).toBeNull();
    expect(screen.queryByText(/Payment #/)).toBeNull();
    expect(screen.getByRole("button", { name: "Details for Dilnoza Rustamova, payment 32" })).toBeTruthy();
  });

  it("adds the student number only when two visible payers share a name", async () => {
    mock.onGet(paymentsUrl).reply(200, listing([payment(41, 8, "Same", "Name"), payment(42, 9, "Same", "Name"), payment(43, 10, "Solo", "Person")]));
    stubContainerWidth(1200);
    renderPayments();
    await screen.findAllByText("Same Name");
    expect(screen.getByText("Student #8")).toBeTruthy();
    expect(screen.getByText("Student #9")).toBeTruthy();
    expect(screen.queryByText("Student #10")).toBeNull();
  });

  it("loads names from the payments list only and never requests a profile per row", async () => {
    stubContainerWidth(1200);
    renderPayments();
    await screen.findByRole("table");
    expect(mock.history.get.filter((request) => /\/students\//.test(request.url ?? ""))).toEqual([]);
  });
});

describe("Payments filters and URL state", () => {
  it("restores student, method and inclusive Dushanbe day bounds from the URL into the request", async () => {
    renderPayments("?tab=payments&pstudent=7&pname=Dilnoza+Rustamova&pmethod=transfer&pfrom=2026-10-01&pto=2026-10-31&ppage=1");
    await screen.findByText("Bahrom Qodirov");
    const params = lastParams();
    expect(params.get("student_id")).toBe("7");
    expect(params.get("method")).toBe("transfer");
    expect(params.get("date_from")).toBe("2026-10-01T00:00:00+05:00");
    expect(params.get("date_to")).toBe("2026-10-31T23:59:59.999999+05:00");
    expect(screen.getByRole("button", { name: "Remove filter: Dilnoza Rustamova" })).toBeTruthy();
  });

  it("changes the method through the custom listbox, resets only the payments page and keeps the debtors page", async () => {
    renderPayments("?tab=payments&ppage=2&dpage=3");
    await screen.findByText("Dilnoza Rustamova");
    await userEvent.click(screen.getByRole("button", { name: /^Method/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Bank Transfer" }));
    await waitFor(() => expect(location()).toBe("/finance?tab=payments&dpage=3&pmethod=transfer"));
    await waitFor(() => expect(lastParams().get("method")).toBe("transfer"));
    expect(lastParams().get("page")).toBe("1");
    expect(document.querySelector("select")).toBeNull();
  });

  it("applies a date range from the popover, keeps it separate from the overview range and clears it", async () => {
    renderPayments("?tab=payments&ppage=2&from=2026-09-01&to=2026-09-30");
    await screen.findByText("Dilnoza Rustamova");
    await userEvent.click(screen.getByRole("button", { name: /^Date/ }));
    const from = await screen.findByLabelText("From");
    await userEvent.type(from, "2026-10-05");
    await userEvent.type(screen.getByLabelText("To"), "2026-10-06");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(location()).toContain("pfrom=2026-10-05&pto=2026-10-06"));
    expect(location()).toContain("from=2026-09-01&to=2026-09-30");
    expect(location()).not.toContain("ppage");
    await waitFor(() => expect(lastParams().get("date_from")).toBe("2026-10-05T00:00:00+05:00"));
    expect(lastParams().get("date_to")).toBe("2026-10-06T23:59:59.999999+05:00");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(location()).toBe("/finance?tab=payments&from=2026-09-01&to=2026-09-30"));
    await waitFor(() => expect(lastParams().has("date_from")).toBe(false));
  });

  it("rejects an inverted payment day range before any request", async () => {
    renderPayments();
    await screen.findByText("Dilnoza Rustamova");
    const before = paymentRequests().length;
    await userEvent.click(screen.getByRole("button", { name: /^Date/ }));
    await userEvent.type(await screen.findByLabelText("From"), "2026-10-20");
    await userEvent.type(screen.getByLabelText("To"), "2026-10-01");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(paymentRequests()).toHaveLength(before);
    expect(location()).toBe("/finance?tab=payments");
  });

  it("filters by a student chosen from the authorized search and shows a removable context chip", async () => {
    mock.onGet("/students/").reply(200, { items: [{ id: 7, first_name: "Dilnoza", last_name: "Rustamova", email: "d@example.com" }], page: 1, page_size: 8, total: 1, total_pages: 1 });
    renderPayments("?tab=payments&ppage=2");
    await screen.findByText("Dilnoza Rustamova");
    await userEvent.click(screen.getByRole("button", { name: /^Student/ }));
    await userEvent.type(await screen.findByRole("combobox", { name: "Search students" }), "Dil");
    await userEvent.click(await screen.findByRole("option", { name: /Dilnoza Rustamova/ }));
    await waitFor(() => expect(lastParams().get("student_id")).toBe("7"));
    expect(lastParams().get("page")).toBe("1");
    expect(location()).toContain("pstudent=7");
    await userEvent.click(screen.getByRole("button", { name: "Remove filter: Dilnoza Rustamova" }));
    await waitFor(() => expect(lastParams().has("student_id")).toBe(false));
    expect(location()).toBe("/finance?tab=payments");
  });
});

describe("Payments registry states", () => {
  it("distinguishes no payments from no matches and offers the right action", async () => {
    mock.onGet(paymentsUrl).reply(200, listing([]));
    renderPayments();
    expect(await screen.findByText("No payments have been recorded yet. Accepted payments appear here.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Accept Payment" }).length).toBeGreaterThan(0);
    cleanup();
    renderPayments("?tab=payments&pmethod=cash");
    expect(await screen.findByText("No payments match these filters.")).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await waitFor(() => expect(location()).toBe("/finance?tab=payments"));
  });

  it("shows an error with a working retry and keeps loaded rows when a refetch fails", async () => {
    mock.onGet(paymentsUrl).reply(500);
    const client = renderPayments();
    expect(await screen.findByText("Payments could not be loaded.")).toBeTruthy();
    mock.onGet(paymentsUrl).reply(200, listing(REGISTRY));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Dilnoza Rustamova");
    mock.onGet(paymentsUrl).reply(500);
    await client.refetchQueries({ queryKey: ["finance", "payments"] });
    expect(await screen.findByText("Could not refresh. Showing the last loaded data.")).toBeTruthy();
    expect(screen.getByText("Dilnoza Rustamova")).toBeTruthy();
  });

  it("reserves skeleton rows while loading", async () => {
    mock.onGet(paymentsUrl).reply(() => new Promise(() => undefined));
    renderPayments();
    const loading = await screen.findByText("Loading payments");
    expect(loading.closest("[aria-busy='true']")).toBeTruthy();
  });
});
