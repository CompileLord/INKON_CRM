import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
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
        defaultCourseId={20}
        defaultCourseName="Test Course"
      />
    </>
  );
}

describe("PaymentModal shared modal integration", () => {
  beforeEach(() => {
    mock.reset();
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

    const amountInput = screen.getByLabelText("Amount (TJS)") as HTMLInputElement;
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


async function pickDate(user: ReturnType<typeof userEvent.setup>, day: string) {
  await user.click(screen.getByLabelText("Date"));
  const input = await waitFor(() => { const node = document.querySelector<HTMLInputElement>("input[type=date]"); if (!node) throw new Error("no date input"); return node; });
  await user.clear(input);
  await user.type(input, day);
  await user.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() => expect(document.querySelector("input[type=date]")).toBeNull());
}

const savedPayment: PaymentItem = { id: 123, student_id: 10, amount: "750.50", paid_at: "2026-10-10T19:00:00Z", method: "cash", recorded_by_id: 1, created_at: "2026-10-11T10:00:00Z", allocated_amount: "750.50", unallocated_amount: "0", is_voided: false, refunded_amount: "0", allocations: [{ charge_id: 1, course_id: 20, course_title: "Test Course", due_date: "2026-10-11", amount: "750.50" }] };

function paymentFixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>);
  return userEvent.setup();
}

describe("payment recording reliability", () => {
  beforeEach(() => { mock.reset(); });
  afterEach(() => { cleanup(); mock.reset(); });

  it("serializes locale decimals and the chosen school date without device-timezone conversion", async () => {
    mock.onPost("/finance/payments/").reply(201, savedPayment);
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" }));
    await user.type(screen.getByLabelText("Amount (TJS)"), "750,50");
    await pickDate(user, "2026-10-11");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect(await screen.findByText("Payment #123 recorded")).toBeTruthy();
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({ amount: "750.50", paid_at: "2026-10-10T19:00:00.000Z", student_id: 10, course_id: 20 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("applying a date inside the date popover never submits the payment form", async () => {
    mock.onPost("/finance/payments/").reply(201, savedPayment);
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" }));
    await user.type(screen.getByLabelText("Amount (TJS)"), "750,50");
    await pickDate(user, "2026-10-11");
    expect(mock.history.post).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Date").textContent).toBe("11.10.2026");
  });

  it("rejects zero and invalid money without sending a payment", async () => {
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" }));
    const amount = screen.getByLabelText("Amount (TJS)");
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
    await user.type(screen.getByLabelText("Amount (TJS)"), "750.50"); await user.dblClick(screen.getByRole("button", { name: "Accept Payment" }));
    expect(mock.history.post).toHaveLength(1); expect((screen.getByLabelText("Amount (TJS)") as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByLabelText("Amount (TJS)").closest("fieldset")?.disabled).toBe(true);
    await user.keyboard("{Escape}"); expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    settle?.([201, savedPayment]); expect(await screen.findByText("Payment #123 recorded")).toBeTruthy(); expect(mock.history.post).toHaveLength(1);
  });

  it("preserves exact decimal input, method and comment after a confirmed rejection", async () => {
    mock.onPost("/finance/payments/").replyOnce(400, { detail: "Accounting period closed" }).onPost("/finance/payments/").reply(201, savedPayment);
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" }));
    await user.type(screen.getByLabelText("Amount (TJS)"), "750.123456789"); await user.click(screen.getByRole("radio", { name: "Bank Transfer" })); await user.type(screen.getByLabelText("Comment"), "Keep this entry");
    await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect(await screen.findByRole("alert")).toBeTruthy(); expect((screen.getByLabelText("Amount (TJS)") as HTMLInputElement).value).toBe("750.123456789");
    expect((screen.getByRole("radio", { name: "Bank Transfer" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Comment") as HTMLTextAreaElement).value).toBe("Keep this entry");
    await user.click(screen.getByRole("button", { name: "Accept Payment" })); await screen.findByText("Payment #123 recorded");
    expect(JSON.parse(mock.history.post[1].data).amount).toBe("750.123456789");
  });

  it("requires verification before resubmission after an ambiguous transport result", async () => {
    mock.onPost("/finance/payments/").networkError();
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" })); await user.type(screen.getByLabelText("Amount (TJS)"), "750.50"); await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    expect(await screen.findByRole("checkbox")).toBeTruthy(); expect((screen.getByRole("button", { name: "Accept Payment" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mock.history.post).toHaveLength(1); expect((screen.getByLabelText("Amount (TJS)") as HTMLInputElement).value).toBe("750.50");
  });

  it("retains confirmed success and offers only receipt retry when the receipt request fails", async () => {
    mock.onPost("/finance/payments/").reply(201, savedPayment);
    mock.onGet(/\/finance\/payments\/\?/).reply(200, { items: [savedPayment], total: 1, page: 1, page_size: 100, total_pages: 1 });
    mock.onGet("/finance/payments/123/receipt").replyOnce(500).onGet("/finance/payments/123/receipt").reply(200, { receipt_number: "ACTUAL-123", student_name: "Test Student", accepted_by_name: "Accountant", allocations: [] });
    const user = paymentFixture(); await user.click(screen.getByRole("button", { name: "Open payment trigger" })); await user.type(screen.getByLabelText("Amount (TJS)"), "750.50"); await user.click(screen.getByRole("button", { name: "Accept Payment" })); await screen.findByText("Payment #123 recorded");
    await user.click(screen.getByRole("button", { name: "View payment" })); await screen.findByRole("alert");
    expect(screen.getByRole("heading", { name: "Payment #123" })).toBeTruthy(); expect(screen.queryByRole("button", { name: "Accept Payment" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry" })); expect(await screen.findByText("ACTUAL-123")).toBeTruthy(); expect(mock.history.post).toHaveLength(1);
  });
});


describe("payment route ownership", () => {
  afterEach(() => { cleanup(); mock.reset(); });
  it("keeps unsaved values when navigation is rejected and proceeds only after explicit discard", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const router = createMemoryRouter([{ path: "/", element: <Fixture /> }, { path: "/other", element: <h1>Other destination</h1> }]);
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Open payment trigger" })); await user.type(screen.getByLabelText("Amount (TJS)"), "123.45");
    await act(async () => { await router.navigate("/other"); });
    expect(await screen.findByRole("button", { name: "Keep editing" })).toBeTruthy(); expect(router.state.location.pathname).toBe("/");
    await user.click(screen.getByRole("button", { name: "Keep editing" })); expect((screen.getByLabelText("Amount (TJS)") as HTMLInputElement).value).toBe("123.45");
    await act(async () => { await router.navigate("/other"); }); await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByRole("heading", { name: "Other destination" })).toBeTruthy(); expect(mock.history.post).toHaveLength(0);
  });
  it("blocks navigation while recording without presenting a discard action", async () => {
    let settle: ((response: [number, PaymentItem]) => void) | undefined;
    mock.onPost("/finance/payments/").reply(() => new Promise<[number, PaymentItem]>(resolve => { settle = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const router = createMemoryRouter([{ path: "/", element: <Fixture /> }, { path: "/other", element: <h1>Other destination</h1> }]);
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Open payment trigger" })); await user.type(screen.getByLabelText("Amount (TJS)"), "123.45"); await user.click(screen.getByRole("button", { name: "Accept Payment" }));
    await act(async () => { await router.navigate("/other"); });
    expect(router.state.location.pathname).toBe("/"); expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
    settle?.([201, savedPayment]); expect(await screen.findByText("Payment #123 recorded")).toBeTruthy(); expect(mock.history.post).toHaveLength(1);
  });
});

function GeneralFixture() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Open general payment</button><PaymentModal isOpen={open} onClose={() => setOpen(false)} onSuccess={() => {}} /></>;
}

describe("authorized payment selection", () => {
  afterEach(() => { cleanup(); mock.reset(); });
  function mockStudents(withProfile: boolean = true) {
    mock.onGet("/students/").reply(config => Number(config.params.page) === 2
      ? [200, { items: [{ id: 90, first_name: "Later", last_name: "Match", email: "later@example.com" }], page: 2, page_size: 8, total: 9, total_pages: 2 }]
      : [200, { items: Array.from({ length: 8 }, (_, index) => ({ id: index + 10, first_name: "First", last_name: "Match " + index, email: "first" + index + "@example.com" })), page: 1, page_size: 8, total: 9, total_pages: 2 }]);
    if (withProfile) mockCourses([{ courseId: 20, title: "Returned archived enrollment" }]);
  }
  function mockCourses(courses: { courseId: number; title: string }[]) {
    const enrollments = courses.map((course, index) => ({ id: 500 + index, student_id: 90, course_id: course.courseId, price_at_enrollment: "1000", color_hex: "#000000", enrolled_at: "2026-09-01T00:00:00Z", status: "withdrawn", is_deleted: false }));
    const charges = courses.map((course, index) => ({ id: 700 + index, enrollment_id: 500 + index, student_id: 90, sequence_no: 1, amount: "10", due_date: "2026-10-01", type: "tuition", status: "open", allocated_amount: "0", remaining_balance: "10", course_title: course.title }));
    mock.onGet("/enrollments/").reply(200, { items: enrollments, total: enrollments.length, page: 1, page_size: 100, total_pages: 1 });
    mock.onGet(/\/finance\/charges\//).reply(200, { items: charges, total: charges.length, page: 1, page_size: 100, total_pages: 1 });
  }
  function openGeneral() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><GeneralFixture /></QueryClientProvider>);
    return userEvent.setup();
  }

  it("reaches students beyond the first page with More results and uses the selected student's returned enrollments with the custom picker", async () => {
    mockStudents();
    const user = openGeneral(); await user.click(screen.getByRole("button", { name: "Open general payment" }));
    const search = screen.getByRole("combobox", { name: "Student" }); await user.type(search, "Match");
    expect((await screen.findAllByRole("option")).length).toBe(8);
    await user.click(await screen.findByRole("button", { name: "More results" }));
    await user.click(await screen.findByRole("option", { name: /Later Match/ }));
    expect(await screen.findByText("Later Match")).toBeTruthy();
    await user.click(await screen.findByLabelText("Priority course"));
    await user.click(await screen.findByRole("option", { name: "Returned archived enrollment" }));
    expect((screen.getByRole("button", { name: "Accept Payment" }) as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector("select")).toBeNull();
    expect(mock.history.get.find(request => request.url === "/enrollments/")?.params).toMatchObject({ student_id: 90 });
    expect(mock.history.get.some(request => /\/students\/\d+\/profile/.test(request.url ?? ""))).toBe(false);
    expect(mock.history.get.some(request => request.url?.startsWith("/courses/"))).toBe(false);
  });

  it("selects with the keyboard and announces the result state", async () => {
    mockStudents();
    const user = openGeneral(); await user.click(screen.getByRole("button", { name: "Open general payment" }));
    const search = screen.getByRole("combobox", { name: "Student" }); await user.type(search, "Match");
    await screen.findAllByRole("option");
    expect((await screen.findAllByRole("status")).some(node => node.textContent === "8 of 9 students")).toBe(true);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(await screen.findByText("First Match 1")).toBeTruthy();
  });

  it("clears the course and its stale data when the student is changed", async () => {
    mockStudents();
    const user = openGeneral(); await user.click(screen.getByRole("button", { name: "Open general payment" }));
    await user.type(screen.getByRole("combobox", { name: "Student" }), "Match");
    await user.click(await screen.findByRole("button", { name: "More results" })); await user.click(await screen.findByRole("option", { name: /Later Match/ }));
    await user.click(await screen.findByLabelText("Priority course")); await user.click(await screen.findByRole("option", { name: "Returned archived enrollment" }));
    expect(screen.getByLabelText("Priority course").textContent).toContain("Returned archived enrollment");
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.queryByLabelText("Priority course")).toBeNull(); expect(screen.queryByText("Returned archived enrollment")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Student" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Accept Payment" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows distinct course loading, error with retry and no-enrollment states", async () => {
    mockStudents(false);
    mock.onGet("/enrollments/").reply(500);
    mock.onGet(/\/finance\/charges\//).reply(200, { items: [], total: 0, page: 1, page_size: 100, total_pages: 0 });
    const user = openGeneral(); await user.click(screen.getByRole("button", { name: "Open general payment" }));
    await user.type(screen.getByRole("combobox", { name: "Student" }), "Match");
    await user.click(await screen.findByRole("button", { name: "More results" })); await user.click(await screen.findByRole("option", { name: /Later Match/ }));
    expect(await screen.findByText("Course context could not be loaded.")).toBeTruthy();
    mock.onGet("/enrollments/").reply(200, { items: [], total: 0, page: 1, page_size: 100, total_pages: 0 });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No available enrollments were returned for this student.")).toBeTruthy();
    expect(screen.queryByText("Course context could not be loaded.")).toBeNull();
  });

  it("reports no match and a retryable search failure separately", async () => {
    mock.onGet("/students/").replyOnce(200, { items: [], page: 1, page_size: 8, total: 0, total_pages: 0 }).onGet("/students/").replyOnce(500);
    const user = openGeneral(); await user.click(screen.getByRole("button", { name: "Open general payment" }));
    const search = screen.getByRole("combobox", { name: "Student" }); await user.type(search, "Nobody");
    expect((await screen.findAllByText("No matching students. Try another name or email.")).length).toBeGreaterThan(0);
    await user.clear(search); await user.type(search, "Broken");
    expect(await screen.findByText("Student search could not be loaded. Retry without changing the payment.", { selector: "p:not(.sr-only)" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Retry" }).length).toBeGreaterThan(0);
  });
});
