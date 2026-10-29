import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { PaymentModal } from "./PaymentModal";
import { httpClient } from "../../lib/auth/httpClient";
import type { PaymentOptions } from "../../lib/finance/types";
import i18n from "../../i18n";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
});

const mock = new MockAdapter(httpClient);
const OPTIONS_URL: string = "/finance/students/7/payment-options";

const twoCourses: PaymentOptions = {
  wallet_credit: "0",
  enrollments: [
    { enrollment_id: 501, course_id: 11, course_title: "Web Frontend", open_debt: "750.00", overdue_days: 75, remaining_contract_maximum: "900.00", billing_mode: "paid" },
    { enrollment_id: 502, course_id: 12, course_title: "English Elementary", open_debt: "500.10", overdue_days: 0, remaining_contract_maximum: "500.10", billing_mode: "paid" },
    { enrollment_id: 503, course_id: 13, course_title: "Scholarship Course", open_debt: "0", overdue_days: 0, remaining_contract_maximum: "0", billing_mode: "grant" },
  ],
};

const created = {
  id: 9, student_id: 7, amount: "750", paid_at: "2026-10-20T10:00:00Z", created_at: "2026-10-20T10:00:00Z", method: "cash", recorded_by_id: 1,
  allocated_amount: "750", unallocated_amount: "0", refunded_amount: "0", is_voided: false, allocations: [],
};

function renderModal(courseId?: number, onSuccess: () => void = () => undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PaymentModal isOpen onClose={() => undefined} onSuccess={onSuccess} defaultStudentId={7} defaultStudentName="Zarina Boboeva" defaultCourseId={courseId} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

function postedBody(): Record<string, unknown> {
  return JSON.parse(mock.history.post[0].data);
}

beforeEach(async () => {
  mock.reset();
  await i18n.changeLanguage("en");
  mock.onGet(OPTIONS_URL).reply(200, twoCourses);
});
afterEach(() => cleanup());

describe("multi-course payment modal", () => {
  it("shows one row per enrollment with debt and overdue days, and a Grant row without an amount input", async () => {
    renderModal();
    const web = await screen.findByTestId("payment-target-501");
    expect(within(web).getByText("Web Frontend")).toBeTruthy();
    expect(within(web).getByText("Debt 750 TJS · 75 d")).toBeTruthy();
    const english = screen.getByTestId("payment-target-502");
    expect(within(english).getByText("Debt 500.10 TJS")).toBeTruthy();
    const grant = screen.getByTestId("payment-target-503");
    expect(within(grant).getByTestId("grant-badge")).toBeTruthy();
    expect(within(grant).queryByRole("textbox")).toBeNull();
    expect(within(grant).queryByRole("button")).toBeNull();
    expect(screen.queryByText("50%")).toBeNull();
  });

  it("fills a row with its debt via the quick-fill button and totals the rows exactly", async () => {
    const user = renderModal();
    await screen.findByTestId("payment-target-501");
    await user.click(screen.getByRole("button", { name: "Pay off debt: Web Frontend" }));
    expect((screen.getByLabelText("Amount for Web Frontend (TJS)") as HTMLInputElement).value).toBe("750.00");
    await user.type(screen.getByLabelText("Amount for English Elementary (TJS)"), "0,1");
    expect(screen.getByText("Total").nextElementSibling?.textContent).toBe("750.10 TJS");
  });

  it("sends targets for the non-zero rows only, with the sum as the payment amount", async () => {
    mock.onPost("/finance/payments/").reply(201, created);
    const onSuccess = vi.fn();
    const user = renderModal(undefined, onSuccess);
    await screen.findByTestId("payment-target-501");
    await user.type(screen.getByLabelText("Amount for Web Frontend (TJS)"), "100.10");
    await user.type(screen.getByLabelText("Amount for English Elementary (TJS)"), "200,20");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const body = postedBody();
    expect(body).toMatchObject({ student_id: 7, amount: "300.3", method: "cash" });
    expect(body.targets).toEqual([
      { enrollment_id: 501, amount: "100.10" },
      { enrollment_id: 502, amount: "200.20" },
    ]);
    expect(body).not.toHaveProperty("course_id");
  });

  it("pre-fills the course debt when opened from a debtor row", async () => {
    mock.onPost("/finance/payments/").reply(201, created);
    const user = renderModal(11);
    await waitFor(() => expect((screen.getByLabelText("Amount for Web Frontend (TJS)") as HTMLInputElement).value).toBe("750.00"));
    expect((screen.getByLabelText("Amount for English Elementary (TJS)") as HTMLInputElement).value).toBe("");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(postedBody().targets).toEqual([{ enrollment_id: 501, amount: "750.00" }]);
  });

  it("asks for an amount when every row is empty and posts nothing", async () => {
    const user = renderModal();
    await screen.findByTestId("payment-target-501");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter the amount received.");
    expect(mock.history.post).toHaveLength(0);
  });

  it("shows the maximum on the right row for payment_target_exceeds_balance", async () => {
    mock.onPost("/finance/payments/").reply(422, { detail: { code: "payment_target_exceeds_balance", enrollment_id: 502, maximum: "500.10" } });
    const user = renderModal();
    await screen.findByTestId("payment-target-501");
    await user.type(screen.getByLabelText("Amount for English Elementary (TJS)"), "999");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    const row = screen.getByTestId("payment-target-502");
    expect((await within(row).findByRole("alert")).textContent).toBe("Maximum for this course: 500.10 TJS");
    expect(within(screen.getByTestId("payment-target-501")).queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Amount for English Elementary (TJS)").getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByRole("button", { name: "Accept Payment" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([
    ["payment_target_sum_mismatch", "The amounts no longer add up to the total. Review the rows and try again."],
    ["invalid_payment_target", "One of the courses is no longer available for payment. The list was refreshed; review the amounts."],
    ["duplicate_payment_target", "The same course appears twice. Refresh the form and try again."],
    ["payment_target_required", "Enter an amount for at least one course."],
  ])("maps %s to a translated message and refreshes the options", async (code, message) => {
    mock.onPost("/finance/payments/").reply(422, { detail: { code } });
    const user = renderModal();
    await screen.findByTestId("payment-target-501");
    await user.type(screen.getByLabelText("Amount for Web Frontend (TJS)"), "10");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect(await screen.findByText(message)).toBeTruthy();
    await waitFor(() => expect(mock.history.get.filter((request) => request.url === OPTIONS_URL).length).toBeGreaterThan(1));
    expect(screen.getByLabelText("Amount for Web Frontend (TJS)")).toHaveProperty("value", "10");
  });

  it("shows loading and an error with a working retry for the rows", async () => {
    let release: (() => void) | undefined;
    mock.reset();
    mock.onGet(OPTIONS_URL).replyOnce(() => new Promise((resolve) => { release = () => resolve([500]); }));
    mock.onGet(OPTIONS_URL).reply(200, twoCourses);
    const user = renderModal();
    expect((await screen.findByText("Loading courses")).closest("[aria-busy='true']")).toBeTruthy();
    release?.();
    expect(await screen.findByText("Course context could not be loaded.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("payment-target-501")).toBeTruthy();
  });
});

describe("wallet credit", () => {
  const withCredit: PaymentOptions = { ...twoCourses, wallet_credit: "120.00" };

  it("hides the credit line when the student has no wallet credit", async () => {
    renderModal();
    await screen.findByTestId("payment-target-501");
    expect(screen.queryByText(/Unallocated balance/)).toBeNull();
  });

  const CREDIT_URL: string = "/finance/students/7/credit-allocations";

  async function openApply(): Promise<ReturnType<typeof userEvent.setup>> {
    mock.onGet(OPTIONS_URL).reply(200, withCredit);
    const user = renderModal();
    expect(await screen.findByText("Unallocated balance: 120 TJS")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Apply to course…" }));
    await user.click(screen.getByRole("button", { name: "Course to apply the balance to" }));
    await user.click(await screen.findByRole("option", { name: "English Elementary" }));
    return user;
  }

  it("applies the credit with one request, shows the amount and refetches options", async () => {
    mock.onPost(CREDIT_URL).reply(201, { allocated_amount: "120.00", wallet_credit: "0.00", allocations: [{ charge_id: 901, ledger_entry_id: 1, amount: "120.00" }] });
    const user = await openApply();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(mock.history.post[0].url).toBe(CREDIT_URL);
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ enrollment_id: 502 });
    expect(await screen.findByText("Applied 120 TJS to the course")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Apply" })).toBeNull());
    expect(mock.history.get.filter((request) => request.url === OPTIONS_URL).length).toBeGreaterThan(1);
    expect(mock.history.get.some((request) => /\/finance\/charges\//.test(request.url ?? ""))).toBe(false);
    expect(mock.history.post.some((request) => request.url === "/finance/allocations/" || request.url === "/finance/payments/")).toBe(false);
  });

  it("shows the refetched debt and clamps a prefilled amount after the credit is applied", async () => {
    const afterCredit: PaymentOptions = {
      wallet_credit: "0.00",
      enrollments: twoCourses.enrollments.map((option) =>
        option.enrollment_id === 502 ? { ...option, open_debt: "380.10", remaining_contract_maximum: "380.10" } : option,
      ),
    };
    let applied: boolean = false;
    mock.onGet(OPTIONS_URL).reply(() => [200, applied ? afterCredit : withCredit]);
    mock.onPost(CREDIT_URL).reply(() => {
      applied = true;
      return [201, { allocated_amount: "120.00", wallet_credit: "0.00", allocations: [] }];
    });
    const user = renderModal(12);
    const input = (await screen.findByLabelText(/Amount for English Elementary/)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("500.10"));
    await user.click(await screen.findByRole("button", { name: "Apply to course…" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Applied 120 TJS to the course");
    await waitFor(() => expect(input.value).toBe("380.10"));
    const row = screen.getByTestId("payment-target-502");
    expect(row.textContent).toContain("Debt 380.10 TJS");
    expect(row.textContent).not.toContain("500.10");
  });

  it.each([
    ["invalid_payment_target", {}, "The course is no longer available for this balance. The list was refreshed."],
    ["no_wallet_credit", {}, "This student has no balance to apply."],
    ["nothing_to_allocate", {}, "Nothing to apply: this course has no open debt."],
    ["credit_exceeds_available", { maximum: "80.00" }, "The balance changed. Available: 80 TJS."],
    ["payment_target_exceeds_balance", { maximum: "50.50" }, "The amount exceeds the course debt. Maximum: 50.50 TJS."],
  ])("maps the %s error to its own message", async (code, extra, message) => {
    mock.onPost(CREDIT_URL).reply(422, { detail: { code, ...extra } });
    const user = await openApply();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(mock.history.post).toHaveLength(1);
    expect(screen.queryByText(/^Applied /)).toBeNull();
  });

  it("shows the generic message for an unrecognised failure", async () => {
    mock.onPost(CREDIT_URL).reply(500);
    const user = await openApply();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("Could not apply the balance. Try again.")).toBeTruthy();
  });
});

describe("withdrawn and grant targets and the amount field", () => {
  const withdrawnOptions: PaymentOptions = {
    wallet_credit: "0",
    enrollments: [
      { enrollment_id: 601, course_id: 21, course_title: "Old Course", open_debt: "300.00", overdue_days: 3, remaining_contract_maximum: "300.00", billing_mode: "paid", status: "withdrawn" },
      { enrollment_id: 602, course_id: 22, course_title: "Grant Course", open_debt: "100.00", overdue_days: 0, remaining_contract_maximum: "100.00", billing_mode: "grant", status: "active" },
    ],
  };

  it("badges withdrawn and grant targets and lets both take an amount", async () => {
    mock.onGet(OPTIONS_URL).reply(200, withdrawnOptions);
    renderModal();
    const old = await screen.findByTestId("payment-target-601");
    expect(within(old).getByText("Withdrawn")).toBeTruthy();
    expect(within(old).getByRole("textbox")).toBeTruthy();
    const grant = screen.getByTestId("payment-target-602");
    expect(within(grant).getByTestId("grant-badge")).toBeTruthy();
    expect(within(grant).getByRole("textbox")).toBeTruthy();
  });

  it("shows an inline error, disables Accept and keeps invalid amounts out of the total", async () => {
    mock.onGet(OPTIONS_URL).reply(200, withdrawnOptions);
    const user = renderModal();
    const input = await screen.findByLabelText("Amount for Old Course (TJS)");
    for (const bad of ["abc", "-5", "1e3", "0", "0.005", "12.345"]) {
      await user.clear(input);
      await user.type(input, bad);
      expect(screen.getByRole("alert").textContent).toContain("up to 2 decimals");
      expect((screen.getByRole("button", { name: "Accept Payment" }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByText(/0\.005/)).toBeNull();
    }
    await user.clear(input);
    await user.type(input, "12,5");
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Accept Payment" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
