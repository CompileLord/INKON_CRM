import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import { StudentPasswordSmsDialog } from "./StudentPasswordSmsDialog";
import * as userEndpoints from "../../lib/users/endpoints";
import { AuthApiError } from "../../lib/auth/errors";
import type { PasswordSmsDelivery } from "../../lib/users/types";

function delivery(overrides: Partial<PasswordSmsDelivery>): PasswordSmsDelivery {
  return {
    id: 1,
    user_id: 7,
    status: "delivered",
    masked_phone: "***4567",
    attempt_count: 1,
    max_attempts: 3,
    last_error: null,
    provider_message_id: null,
    provider_status: null,
    created_at: "2026-10-21T08:30:00Z",
    delivered_at: null,
    ...overrides,
  };
}

function renderDialog() {
  const queryClient: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudentPasswordSmsDialog open studentId={7} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudentPasswordSmsDialog resend", () => {
  it("reports the student phone destination on success and refreshes the deliveries", async () => {
    const list = vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockResolvedValue([]);
    const resend = vi.spyOn(userEndpoints, "resendPasswordSms").mockResolvedValue({ destination: "student_phone" });
    renderDialog();
    await screen.findByText(/No SMS sent yet/);
    await userEvent.setup().click(screen.getByRole("button", { name: /Resend password SMS/ }));
    expect(await screen.findByText("New code sent to the student phone.")).toBeDefined();
    expect(resend).toHaveBeenCalledWith(7);
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("reports the parent phone destination", async () => {
    vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockResolvedValue([]);
    vi.spyOn(userEndpoints, "resendPasswordSms").mockResolvedValue({ destination: "parent_phone" });
    renderDialog();
    await userEvent.setup().click(screen.getByRole("button", { name: /Resend password SMS/ }));
    expect(await screen.findByText("New code sent to the parent phone.")).toBeDefined();
  });

  it("explains the rate limit on 429", async () => {
    vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockResolvedValue([]);
    vi.spyOn(userEndpoints, "resendPasswordSms").mockRejectedValue(new AuthApiError(429, "Too many"));
    renderDialog();
    await userEvent.setup().click(screen.getByRole("button", { name: /Resend password SMS/ }));
    expect(await screen.findByText("Too many requests. Try again later.")).toBeDefined();
  });

  it("asks to add a phone on 400", async () => {
    vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockResolvedValue([]);
    vi.spyOn(userEndpoints, "resendPasswordSms").mockRejectedValue(new AuthApiError(400, "no phone"));
    renderDialog();
    await userEvent.setup().click(screen.getByRole("button", { name: /Resend password SMS/ }));
    expect(await screen.findByText("Add a student or parent phone first.")).toBeDefined();
  });

  it("falls back to a generic message for other failures", async () => {
    vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockResolvedValue([]);
    vi.spyOn(userEndpoints, "resendPasswordSms").mockRejectedValue(new AuthApiError(500, "boom"));
    renderDialog();
    await userEvent.setup().click(screen.getByRole("button", { name: /Resend password SMS/ }));
    expect(await screen.findByText("Could not send the SMS. Try again.")).toBeDefined();
  });
});

describe("password SMS deliveries list", () => {
  it("shows a skeleton while loading", () => {
    vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockReturnValue(new Promise(() => undefined));
    renderDialog();
    expect(document.querySelector('ul[aria-busy="true"]')).not.toBeNull();
  });

  it("shows the empty state with guidance", async () => {
    vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockResolvedValue([]);
    renderDialog();
    expect(await screen.findByText("No SMS sent yet. They appear here after a code is sent.")).toBeDefined();
  });

  it("shows an error with a working retry", async () => {
    const list = vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockRejectedValueOnce(new AuthApiError(500, "boom")).mockResolvedValueOnce([delivery({ id: 5 })]);
    renderDialog();
    expect(await screen.findByText("Couldn't load deliveries.")).toBeDefined();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("***4567")).toBeDefined();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("lists status, masked phone, attempts and time, keeping the server order, and exposes a failed delivery error", async () => {
    vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockResolvedValue([
      delivery({ id: 3, status: "failed", masked_phone: "***1111", attempt_count: 3, last_error: "Provider rejected the number" }),
      delivery({ id: 2, status: "delivered", masked_phone: "***2222", attempt_count: 1 }),
    ]);
    renderDialog();
    await screen.findByText("***1111");
    const items: HTMLElement[] = within(screen.getByRole("list", { name: "Password SMS deliveries" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute("data-delivery-status")).toBe("failed");
    expect(within(items[0]).getByText("Failed")).toBeDefined();
    expect(within(items[0]).getByText("***1111")).toBeDefined();
    expect(within(items[0]).getByText("Attempts 3 of 3")).toBeDefined();
    expect(within(items[0]).getByText("Error: Provider rejected the number")).toBeDefined();
    expect(within(items[0]).getByText("21.10.2026 13:30")).toBeDefined();
    expect(within(items[1]).getByText("Delivered")).toBeDefined();
    expect(within(items[1]).queryByText(/Error:/)).toBeNull();
  });

  it("requests deliveries for the student with all statuses", async () => {
    const list = vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockResolvedValue([]);
    renderDialog();
    await screen.findByText(/No SMS sent yet/);
    expect(list).toHaveBeenCalledWith(7);
  });
});
