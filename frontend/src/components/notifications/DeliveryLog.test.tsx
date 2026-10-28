import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { AuthApiError } from "../../lib/auth/errors";
import type { DeliveryLogItem, PaginatedDeliveryLog } from "../../lib/notifications/types";
import { useAuthStore } from "../../store/authStore";
import { DeliveryLog } from "./DeliveryLog";

const endpoints = vi.hoisted(() => ({
  fetchDeliveryLog: vi.fn(),
  retryDeliveryLog: vi.fn(),
}));

vi.mock("../../lib/notifications/endpoints", () => ({
  fetchDeliveryLog: endpoints.fetchDeliveryLog,
  retryDeliveryLog: endpoints.retryDeliveryLog,
  fetchNotifications: vi.fn(),
  fetchUnreadNotificationCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

function entry(id: number, overrides: Partial<DeliveryLogItem> = {}): DeliveryLogItem {
  return { id, recipient_name: `Student ${id}`, type: "payment_reminder_1d", notification_date: "2026-10-10", status: "sent", attempts: 1, sent_at: "2026-10-10T08:00:00Z", student_id: 100 + id, course_id: 200 + id, course_title: `Course ${id}`, amount: "750.00", score: null, ...overrides };
}

function listing(items: DeliveryLogItem[]): PaginatedDeliveryLog {
  return { items, total: items.length, page: 1, page_size: 20, total_pages: 1 };
}

function renderLog(role: "superadmin" | "accountant" | "student" = "superadmin"): void {
  useAuthStore.setState({ role, userId: 1, status: "authenticated" });
  const client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DeliveryLog failedOnly={false} page={1} onFailedOnlyChange={vi.fn()} onPageChange={vi.fn()} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  endpoints.fetchDeliveryLog.mockReset();
  endpoints.retryDeliveryLog.mockReset();
});
afterEach(() => cleanup());

describe("DeliveryLog context and links", () => {
  it("shows course and amount for a payment reminder and course and score for an exam result", async () => {
    endpoints.fetchDeliveryLog.mockResolvedValue(listing([
      entry(1),
      entry(2, { type: "exam_result", amount: null, score: 87 }),
      entry(3, { type: "telegram_link_lockout", course_title: null, course_id: null, amount: null, score: null }),
    ]));
    renderLog();
    const cards: HTMLElement[] = await screen.findAllByTestId("delivery-item");
    expect(within(cards[0]).getByTestId("delivery-context").textContent).toBe("Course 1·750 TJS");
    expect(within(cards[1]).getByTestId("delivery-context").textContent).toBe("Course 2·Score: 87");
    expect(within(cards[2]).queryByTestId("delivery-context")).toBeNull();
  });

  it("links the recipient to the student and the course title to the course for the superadmin", async () => {
    endpoints.fetchDeliveryLog.mockResolvedValue(listing([entry(1)]));
    renderLog("superadmin");
    expect((await screen.findByRole("link", { name: "Student 1" })).getAttribute("href")).toBe("/students/101");
    expect(screen.getByRole("link", { name: "Course 1" }).getAttribute("href")).toBe("/courses/201");
  });

  it("renders plain text without links when the role may not open those pages", async () => {
    endpoints.fetchDeliveryLog.mockResolvedValue(listing([entry(1)]));
    renderLog("accountant");
    expect(await screen.findByText("Student 1")).toBeTruthy();
    expect(screen.getByText("Course 1")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does not link an unknown recipient", async () => {
    endpoints.fetchDeliveryLog.mockResolvedValue(listing([entry(1, { recipient_name: null })]));
    renderLog();
    expect(await screen.findByText("Unknown recipient")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Unknown recipient" })).toBeNull();
  });

  it("marks each category with its own icon", async () => {
    endpoints.fetchDeliveryLog.mockResolvedValue(listing([entry(1), entry(2, { type: "exam_result" }), entry(3, { type: "telegram_link_lockout" })]));
    renderLog();
    const icons: HTMLElement[] = await screen.findAllByTestId("delivery-icon");
    expect(icons.map((icon) => icon.getAttribute("data-kind"))).toEqual(["paymentOneDay", "examResult", "telegramLockout"]);
    expect(icons.every((icon) => icon.querySelector("svg") !== null)).toBe(true);
  });
});

describe("DeliveryLog retry", () => {
  it("offers Retry only on failed items", async () => {
    endpoints.fetchDeliveryLog.mockResolvedValue(listing([entry(1), entry(2, { status: "failed", attempts: 3, sent_at: null }), entry(3, { status: "queued", sent_at: null }), entry(4, { status: "inflight", sent_at: null })]));
    renderLog();
    const cards: HTMLElement[] = await screen.findAllByTestId("delivery-item");
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
    expect(within(cards[1]).getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("turns the row into queued, drops the button and toasts after a successful retry", async () => {
    const failed: DeliveryLogItem = entry(2, { status: "failed", attempts: 3, sent_at: null });
    endpoints.fetchDeliveryLog.mockResolvedValueOnce(listing([failed])).mockResolvedValue(listing([{ ...failed, status: "queued", attempts: 0 }]));
    endpoints.retryDeliveryLog.mockResolvedValue({ ...failed, status: "queued", attempts: 0 });
    renderLog();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(endpoints.retryDeliveryLog).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.getByTestId("delivery-status").getAttribute("data-status")).toBe("queued"));
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Message queued for resending.");
  });

  it("disables the button while the retry is pending", async () => {
    endpoints.fetchDeliveryLog.mockResolvedValue(listing([entry(2, { status: "failed", sent_at: null })]));
    endpoints.retryDeliveryLog.mockReturnValue(new Promise(() => undefined));
    renderLog();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect((screen.getByRole("button", { name: /Retry/ }) as HTMLButtonElement).disabled).toBe(true));
  });

  it.each([
    [409, "This message is no longer failed, so it can't be retried."],
    [429, "Too many retries. Try again in a minute."],
    [404, "This message no longer exists."],
    [500, "Couldn't retry the message. Try again."],
  ])("maps a %i response to a translated message", async (status: number, message: string) => {
    endpoints.fetchDeliveryLog.mockResolvedValue(listing([entry(2, { status: "failed", sent_at: null })]));
    endpoints.retryDeliveryLog.mockRejectedValue(new AuthApiError(status, undefined));
    renderLog();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(message));
  });

  it("translates the retry strings in Russian and Tajik", async () => {
    endpoints.fetchDeliveryLog.mockResolvedValue(listing([entry(2, { status: "failed", sent_at: null })]));
    await i18n.changeLanguage("ru");
    renderLog();
    expect(await screen.findByRole("button", { name: "Повторить" })).toBeTruthy();
    cleanup();
    await i18n.changeLanguage("tg");
    renderLog();
    expect(await screen.findByRole("button", { name: "Такрор" })).toBeTruthy();
  });
});

describe("DeliveryLog list states", () => {
  it("shows a skeleton while loading", () => {
    endpoints.fetchDeliveryLog.mockReturnValue(new Promise(() => undefined));
    renderLog();
    expect(screen.getByLabelText("Loading...")).toBeTruthy();
  });

  it("shows an error with a working retry", async () => {
    endpoints.fetchDeliveryLog.mockRejectedValueOnce(new Error("down")).mockResolvedValue(listing([entry(1)]));
    renderLog();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("delivery-item")).toBeTruthy();
  });

  it("explains why it is empty and what happens next", async () => {
    endpoints.fetchDeliveryLog.mockResolvedValue(listing([]));
    renderLog();
    expect(await screen.findByText("No Telegram messages have been sent yet.")).toBeTruthy();
    expect(screen.getByText("Payment reminders and exam results sent to students and parents will appear here.")).toBeTruthy();
  });

  it("lists loaded items as cards", async () => {
    endpoints.fetchDeliveryLog.mockResolvedValue(listing([entry(1), entry(2)]));
    renderLog();
    const cards: HTMLElement[] = await screen.findAllByTestId("delivery-item");
    expect(cards).toHaveLength(2);
    expect(cards[0].className).toContain("bg-card");
    expect(cards[0].className).toContain("border-border");
  });
});
