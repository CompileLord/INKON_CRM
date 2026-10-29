import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { Finance } from "../../pages/Finance";
import { AccountantDashboard } from "../dashboard/AccountantDashboard";
import { httpClient } from "../../lib/auth/httpClient";
import { useAuthStore } from "../../store/authStore";
import type { DebtItem, PaymentItem } from "../../lib/finance/types";
import i18n from "../../i18n";

const mock = new MockAdapter(httpClient);
const paymentsUrl = /\/finance\/payments\/\?/;
const debtsUrl = /\/finance\/debts\/\?/;
const analyticsUrl = /\/finance\/analytics\//;

const created: PaymentItem = {
  id: 321, student_id: 7, student_first_name: "Anisa", student_last_name: "Karimova", amount: "750.50", paid_at: "2026-10-12T10:00:00Z", created_at: "2026-10-12T10:00:00Z",
  method: "cash", recorded_by_id: 1, allocated_amount: "750.50", unallocated_amount: "0", is_voided: false, refunded_amount: "0",
  allocations: [{ charge_id: 1, course_id: 11, course_title: "Python Advanced", due_date: "2026-10-05", amount: "750.50" }],
};

const debt: DebtItem = {
  student: { id: 7, first_name: "Anisa", last_name: "Karimova", email: "anisa@example.com", payment_day_of_month: 5 },
  course: { id: 11, title: "Python Advanced" }, price_at_enrollment: "1000.00", billed_to_date: "900.00", total_paid: "0", debt: "700.10", overdue_days: 4,
};

function listing<T>(items: T[]) {
  return { items, total: items.length, page: 1, page_size: 20, total_pages: items.length ? 1 : 0 };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderFinance(query: string) {
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

const AMOUNT_LABEL: string = "Amount for Python Advanced (TJS)";

function mockPayableCourses() {
  mock.onGet("/finance/students/7/payment-options").reply(200, {
    wallet_credit: "0",
    enrollments: [{ enrollment_id: 500, course_id: 11, course_title: "Python Advanced", open_debt: "700.10", overdue_days: 4, remaining_contract_maximum: "1000", billing_mode: "paid" }],
  });
}

beforeEach(async () => {
  mock.reset();
  await i18n.changeLanguage("en");
  useAuthStore.setState({ role: "accountant" });
  mock.onGet(analyticsUrl).reply(200, { net_receivable: "0", collected_in_period: "0", unpaid_students_count: 0 });
  mock.onGet(debtsUrl).reply(200, listing([debt]));
  mock.onGet(paymentsUrl).reply(200, listing([]));
  mock.onGet("/students/").reply(200, { items: [{ id: 7, first_name: "Anisa", last_name: "Karimova", email: "anisa@example.com" }], page: 1, page_size: 8, total: 1, total_pages: 1 });
  mockPayableCourses();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function pickDate(_user: ReturnType<typeof userEvent.setup>, day: string) {
  const input = screen.getByLabelText("Date");
  const [year, month, dayOfMonth] = day.split("-");
  fireEvent.change(input, { target: { value: `${dayOfMonth}.${month}.${year}` } });
  fireEvent.blur(input);
  await waitFor(() => expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe(`${dayOfMonth}.${month}.${year}`));
}

async function chooseStudentAndCourse(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("combobox", { name: "Student" }), "Anisa");
  await user.click(await screen.findByRole("option", { name: /Anisa Karimova/ }));
  await screen.findByLabelText(AMOUNT_LABEL);
}

describe("Payment entry form", () => {
  it("focuses the student search for general entry and the amount for a locked debtor entry", async () => {
    const user = userEvent.setup();
    renderFinance("?tab=payments");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await screen.findByRole("dialog");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Student" })));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    cleanup();
    renderFinance("?tab=debtors");
    await user.click(await screen.findByRole("button", { name: "Accept payment for Anisa Karimova, Python Advanced" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Python Advanced")).toBeTruthy();
    expect(within(dialog).getByText("Anisa Karimova")).toBeTruthy();
    expect(within(dialog).queryByRole("combobox")).toBeNull();
    expect(within(dialog).getByText("Locked for this debtor")).toBeTruthy();
    expect((within(dialog).getByLabelText(AMOUNT_LABEL) as HTMLInputElement).value).toBe("700.10");
  });

  it("defaults the date to the Dushanbe calendar day instead of the UTC day", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-31T20:30:00Z") });
    renderFinance("?tab=payments");
    const user = userEvent.setup({ advanceTimers: () => undefined });
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect(((await screen.findByLabelText("Date")) as HTMLInputElement).value).toBe("01.11.2026");
  });

  it("submits a large exact amount without float conversion and the chosen Dushanbe day as an instant", async () => {
    mock.onPost("/finance/payments/").reply(201, created);
    const user = userEvent.setup();
    renderFinance("?tab=payments");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await chooseStudentAndCourse(user);
    await user.type(screen.getByLabelText(AMOUNT_LABEL), "12345678901234567890,12");
    await pickDate(user, "2026-03-01");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await screen.findByText("Payment #321 recorded");
    expect(String(mock.history.post[0].headers?.["Idempotency-Key"])).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({ amount: "12345678901234567890.12", paid_at: "2026-02-28T19:00:00.000Z", student_id: 7, targets: [{ enrollment_id: 500, amount: "12345678901234567890.12" }] });
  }, 20000);

  it("announces the pending status and keeps the dialog values when the result is ambiguous", async () => {
    let fail: (() => void) | undefined;
    mock.onPost("/finance/payments/").reply(() => new Promise((_, reject) => { fail = () => reject(new Error("socket hang up")); }));
    const user = userEvent.setup();
    renderFinance("?tab=payments");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await chooseStudentAndCourse(user);
    await user.type(screen.getByLabelText(AMOUNT_LABEL), "100,25");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await waitFor(() => expect(screen.getAllByRole("status").some((node) => node.textContent === "Recording payment…")).toBe(true));
    expect(screen.getByLabelText(AMOUNT_LABEL).closest("fieldset")?.disabled).toBe(true);
    fail?.();
    expect(await screen.findByText(/Check whether the payment was recorded before submitting again/)).toBeTruthy();
    expect((screen.getByLabelText(AMOUNT_LABEL) as HTMLInputElement).value).toBe("100,25");
    expect(screen.queryByText("Payment #321 recorded")).toBeNull();
    expect(mock.history.post).toHaveLength(1);
  });

  it("shows the course loading state before the options arrive", async () => {
    let release: (() => void) | undefined;
    mock.onGet("/finance/students/7/payment-options").reply(() => new Promise((resolve) => { release = () => resolve([200, { wallet_credit: "0", enrollments: [{ enrollment_id: 500, course_id: 11, course_title: "Python Advanced", open_debt: "700.10", overdue_days: 4, remaining_contract_maximum: "1000", billing_mode: "paid" }] }]); }));
    const user = userEvent.setup();
    renderFinance("?tab=payments");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await user.type(screen.getByRole("combobox", { name: "Student" }), "Anisa");
    await user.click(await screen.findByRole("option", { name: /Anisa Karimova/ }));
    expect((await screen.findByText("Loading courses")).closest("[aria-busy='true']")).toBeTruthy();
    expect(screen.queryByLabelText(AMOUNT_LABEL)).toBeNull();
    release?.();
    expect(await screen.findByLabelText(AMOUNT_LABEL)).toBeTruthy();
  });
});

describe("Payment completion", () => {
  it("keeps a durable result with the name and View payment, opens the returned record even when the list excludes it, and does not post again", async () => {
    mock.onPost("/finance/payments/").reply(201, created);
    mock.onGet("/finance/payments/321/receipt").reply(200, { receipt_number: "R-321", student_name: "Anisa Karimova", student_email: "anisa@example.com", accepted_by_name: "Acc", allocations: [] });
    const user = userEvent.setup();
    renderFinance("?tab=payments&pmethod=transfer");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await chooseStudentAndCourse(user);
    await user.type(screen.getByLabelText(AMOUNT_LABEL), "750.50");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    const region = await screen.findByRole("status", { name: "Recorded payment" });
    expect(within(region).getByText("Payment #321 recorded")).toBeTruthy();
    expect(within(region).getByText("Anisa Karimova")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.getByRole("status", { name: "Recorded payment" })).toBeTruthy();
    await user.click(within(region).getByRole("button", { name: "View payment" }));
    const detail = await screen.findByRole("dialog");
    expect(within(detail).getByRole("heading", { name: "Payment #321" })).toBeTruthy();
    expect(within(detail).getByText("750.50 TJS")).toBeTruthy();
    expect(await within(detail).findByText("R-321")).toBeTruthy();
    expect(mock.history.post).toHaveLength(1);
  });

  it("invalidates the payments list while keeping tab, filters, page and the result message", async () => {
    mock.onPost("/finance/payments/").reply(201, created);
    mock.onGet(paymentsUrl).reply(200, { items: [{ ...created, id: 300 }], total: 50, page: 2, page_size: 20, total_pages: 3 });
    const user = userEvent.setup();
    renderFinance("?tab=payments&ppage=2&pmethod=cash");
    await screen.findByText("Anisa Karimova");
    const registryRequests = () => mock.history.get.filter((request) => /page_size=20/.test(request.url ?? "") && paymentsUrl.test(request.url ?? ""));
    const before = registryRequests().length;
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await chooseStudentAndCourse(user);
    await user.type(screen.getByLabelText(AMOUNT_LABEL), "750.50");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await screen.findByText("Payment #321 recorded");
    await waitFor(() => expect(registryRequests().length).toBeGreaterThan(before));
    const latest = registryRequests().at(-1)?.url ?? "";
    expect(latest).toContain("page=2");
    expect(latest).toContain("method=cash");
    expect(screen.getByTestId("location").textContent).toBe("/finance?tab=payments&ppage=2&pmethod=cash");
    expect(screen.getByText("Payment #321 recorded")).toBeTruthy();
  });
});

describe("Dashboard entry", () => {
  it("opens the same shared payment form as Finance", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><AccountantDashboard /></QueryClientProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Accept Payment" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("#shared-payment-form")).toBeTruthy();
    expect(within(dialog).getByRole("combobox", { name: "Student" })).toBeTruthy();
    expect(within(dialog).getByRole("radio", { name: "Cash" })).toBeTruthy();
    expect(within(dialog).getByRole("radio", { name: "Bank Transfer" })).toBeTruthy();
    expect(dialog.querySelector("select")).toBeNull();
  });
});
