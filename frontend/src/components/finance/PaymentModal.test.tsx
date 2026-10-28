import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { PaymentModal } from "./PaymentModal";
import { PaymentCompletion } from "./PaymentCompletion";
import type { PaymentItem } from "../../lib/finance/types";
import { httpClient } from "../../lib/auth/httpClient";
import { useShellStore } from "../../store/shellStore";
import "../../i18n";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
});

const mock = new MockAdapter(httpClient);
const AMOUNT: string = "Amount for Test Course (TJS)";

function mockOptions(): void {
  mock.onGet("/finance/students/10/payment-options").reply(200, {
    wallet_credit: "0",
    enrollments: [{ enrollment_id: 600, course_id: 20, course_title: "Test Course", open_debt: "900", overdue_days: 0, remaining_contract_maximum: "2000", billing_mode: "paid" }],
  });
}

function Fixture() {
  const [open, setOpen] = useState(false);
  const [recorded, setRecorded] = useState<PaymentItem | null>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open payment trigger
      </button>
      <PaymentCompletion payment={recorded} />
      <PaymentModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSuccess={payment => { setRecorded(payment); setOpen(false); }}
        defaultStudentId={10}
        defaultStudentName="Test Student"
      />
    </>
  );
}

describe("PaymentModal shared modal integration", () => {
  beforeEach(() => {
    mock.reset();
    mockOptions();
    useShellStore.getState().close();
  });

  afterEach(() => {
    cleanup();
    mock.reset();
  });

  it("integrates with shared Modal: owns focus, locks scroll, inerts background, closes shell overlay, and preserves typed amount across resize", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={client}>
        <Fixture />
      </QueryClientProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Open payment trigger" });
    useShellStore.getState().toggle("settings", trigger);
    expect(useShellStore.getState().surface).toBe("settings");

    await user.click(trigger);

    expect(useShellStore.getState().surface).toBeNull();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Accept Payment" })).toBeTruthy();

    await waitFor(() => {
      expect(document.activeElement?.closest('[role="dialog"]')).toBeTruthy();
    });

    expect(document.body.style.overflowY).toBe("hidden");
    expect(document.querySelector("[data-base-ui-inert]") || document.querySelector('[aria-hidden="true"]')).toBeTruthy();

    const amountInput = (await screen.findByLabelText(AMOUNT)) as HTMLInputElement;
    expect(amountInput).toBeTruthy();
    await user.clear(amountInput);
    await user.type(amountInput, "750.5");
    expect(amountInput.value).toBe("750.5");

    window.dispatchEvent(new Event("resize"));
    expect(amountInput.value).toBe("750.5");

    await user.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: "Keep editing" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(amountInput.value).toBe("750.5");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(document.body.style.overflowY).not.toBe("hidden");
    expect(document.activeElement).toBe(trigger);

    expect(mock.history.post).toHaveLength(0);
  });
});


async function pickDate(_user: ReturnType<typeof userEvent.setup>, day: string) {
  const input = screen.getByLabelText("Date");
  const [year, month, dayOfMonth] = day.split("-");
  fireEvent.change(input, { target: { value: `${dayOfMonth}.${month}.${year}` } });
  fireEvent.blur(input);
  await waitFor(() => expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe(`${dayOfMonth}.${month}.${year}`));
}

const savedPayment: PaymentItem = { id: 123, student_id: 10, amount: "750.50", paid_at: "2026-10-10T19:00:00Z", method: "cash", recorded_by_id: 1, created_at: "2026-10-11T10:00:00Z", allocated_amount: "750.50", unallocated_amount: "0", is_voided: false, refunded_amount: "0", allocations: [{ charge_id: 1, course_id: 20, course_title: "Test Course", due_date: "2026-10-11", amount: "750.50" }] };

function paymentFixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>);
  return userEvent.setup();
}

describe("payment recording reliability", () => {
  beforeEach(() => { mock.reset(); mockOptions(); });
  afterEach(() => { cleanup(); mock.reset(); });

  it("serializes locale decimals and the chosen school date without device-timezone conversion", async () => {
    mock.onPost("/finance/payments/").reply(201, savedPayment);
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" }));
    await user.type((await screen.findByLabelText(AMOUNT)), "750,50");
    await pickDate(user, "2026-10-11");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect(await screen.findByText("Payment #123 recorded")).toBeTruthy();
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({ amount: "750.5", paid_at: "2026-10-10T19:00:00.000Z", student_id: 10, targets: [{ enrollment_id: 600, amount: "750.50" }] });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("applying a date inside the date popover never submits the payment form", async () => {
    mock.onPost("/finance/payments/").reply(201, savedPayment);
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" }));
    await user.type((await screen.findByLabelText(AMOUNT)), "750,50");
    await pickDate(user, "2026-10-11");
    expect(mock.history.post).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("11.10.2026");
  });

  it("keeps the primary action clearly enabled", async () => {
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" }));
    const accept = screen.getByRole("button", { name: "Accept Payment" }) as HTMLButtonElement;
    expect(accept.disabled).toBe(false);
    expect(accept.querySelector("svg")).toBeNull();
    expect(accept.className).toContain("bg-maroon");
    expect(accept.className).not.toMatch(/(^|\s)bg-beige/);
    expect(mock.history.post).toHaveLength(0);
  });

  it("rejects zero and invalid money without sending a payment", async () => {
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" }));
    const amount = (await screen.findByLabelText(AMOUNT));
    for (const invalid of ["0", "-1", "750,5,0", "abc"]) {
      await user.clear(amount); await user.type(amount, invalid); await user.click(screen.getByRole("button", { name: "Accept Payment" }));
      expect(await screen.findByRole("alert")).toBeTruthy(); expect(document.activeElement).toBe(amount);
    }
    expect(mock.history.post).toHaveLength(0);
  });

  it("disables duplicate submission, fields and dismissal while the actual mutation is pending", async () => {
    let settle: ((response: [number, PaymentItem]) => void) | undefined;
    mock.onPost("/finance/payments/").reply(() => new Promise<[number, PaymentItem]>(resolve => { settle = resolve; }));
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" }));
    await user.type((await screen.findByLabelText(AMOUNT)), "750.50"); await user.dblClick(screen.getByRole("button", { name: "Accept Payment" }));
    expect(mock.history.post).toHaveLength(1); expect(((await screen.findByLabelText(AMOUNT)) as HTMLInputElement).disabled).toBe(false);
    expect((await screen.findByLabelText(AMOUNT)).closest("fieldset")?.disabled).toBe(true);
    await user.keyboard("{Escape}"); expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    settle?.([201, savedPayment]); expect(await screen.findByText("Payment #123 recorded")).toBeTruthy(); expect(mock.history.post).toHaveLength(1);
  });

  it("preserves exact decimal input, method and comment after a confirmed rejection", async () => {
    mock.onPost("/finance/payments/").replyOnce(400, { detail: "Accounting period closed" }).onPost("/finance/payments/").reply(201, savedPayment);
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" }));
    await user.type((await screen.findByLabelText(AMOUNT)), "750.123456789"); await user.click(screen.getByRole("radio", { name: "Bank Transfer" })); await user.type(screen.getByLabelText("Comment"), "Keep this entry");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect(await screen.findByRole("alert")).toBeTruthy(); expect(((await screen.findByLabelText(AMOUNT)) as HTMLInputElement).value).toBe("750.123456789");
    expect((screen.getByRole("radio", { name: "Bank Transfer" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Comment") as HTMLTextAreaElement).value).toBe("Keep this entry");
    await user.click(screen.getByRole("button", { name: "Accept Payment" })); await screen.findByText("Payment #123 recorded");
    expect(JSON.parse(mock.history.post[1].data).amount).toBe("750.123456789");
  });

  it("explains a 422 withdrawn_enrollment_payment_exceeds_debt rejection and keeps the entered values", async () => {
    mock.onPost("/finance/payments/").replyOnce(422, { detail: "withdrawn_enrollment_payment_exceeds_debt" });
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" }));
    await user.type((await screen.findByLabelText(AMOUNT)), "900.00");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect((await screen.findByRole("alert")).textContent).toContain("This student has withdrawn from the course. A payment can't exceed the remaining debt.");
    expect(((await screen.findByLabelText(AMOUNT)) as HTMLInputElement).value).toBe("900.00");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("requires verification before resubmission after an ambiguous transport result", async () => {
    mock.onPost("/finance/payments/").networkError();
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" })); await user.type((await screen.findByLabelText(AMOUNT)), "750.50"); await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect(await screen.findByRole("checkbox")).toBeTruthy(); expect((screen.getByRole("button", { name: "Accept Payment" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mock.history.post).toHaveLength(1); expect(((await screen.findByLabelText(AMOUNT)) as HTMLInputElement).value).toBe("750.50");
  });

  it("retains confirmed success and offers only receipt retry when the receipt request fails", async () => {
    mock.onPost("/finance/payments/").reply(201, savedPayment);
    mock.onGet(/\/finance\/payments\/\?/).reply(200, { items: [savedPayment], total: 1, page: 1, page_size: 100, total_pages: 1 });
    mock.onGet("/finance/payments/123/receipt").replyOnce(500).onGet("/finance/payments/123/receipt").reply(200, { receipt_number: "ACTUAL-123", student_name: "Test Student", accepted_by_name: "Accountant", allocations: [] });
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" })); await user.type((await screen.findByLabelText(AMOUNT)), "750.50"); await user.click(screen.getByRole("button", { name: "Accept Payment" })); await screen.findByText("Payment #123 recorded");
    await user.click(screen.getByRole("button", { name: "View payment" })); await screen.findByRole("alert");
    expect(screen.getByRole("heading", { name: "Payment #123" })).toBeTruthy(); expect(screen.queryByRole("button", { name: "Accept Payment" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry" })); expect(await screen.findByText("ACTUAL-123")).toBeTruthy(); expect(mock.history.post).toHaveLength(1);
  });
});


describe("payment route ownership", () => {
  beforeEach(() => { mockOptions(); });
  afterEach(() => { cleanup(); mock.reset(); });
  it("keeps unsaved values when navigation is rejected and proceeds only after explicit discard", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const router = createMemoryRouter([{ path: "/", element: <Fixture /> }, { path: "/other", element: <h1>Other destination</h1> }]);
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Open payment trigger" })); await user.type((await screen.findByLabelText(AMOUNT)), "123.45");
    await act(async () => { await router.navigate("/other"); });
    expect(await screen.findByRole("button", { name: "Keep editing" })).toBeTruthy(); expect(router.state.location.pathname).toBe("/");
    await user.click(screen.getByRole("button", { name: "Keep editing" })); expect(((await screen.findByLabelText(AMOUNT)) as HTMLInputElement).value).toBe("123.45");
    await act(async () => { await router.navigate("/other"); }); await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByRole("heading", { name: "Other destination" })).toBeTruthy(); expect(mock.history.post).toHaveLength(0);
  });
  it("blocks navigation while recording without presenting a discard action", async () => {
    let settle: ((response: [number, PaymentItem]) => void) | undefined;
    mock.onPost("/finance/payments/").reply(() => new Promise<[number, PaymentItem]>(resolve => { settle = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const router = createMemoryRouter([{ path: "/", element: <Fixture /> }, { path: "/other", element: <h1>Other destination</h1> }]);
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Open payment trigger" })); await user.type((await screen.findByLabelText(AMOUNT)), "123.45"); await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await act(async () => { await router.navigate("/other"); });
    expect(router.state.location.pathname).toBe("/"); expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
    settle?.([201, savedPayment]); expect(await screen.findByText("Payment #123 recorded")).toBeTruthy(); expect(mock.history.post).toHaveLength(1);
  });
});
