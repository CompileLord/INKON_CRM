import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../i18n";
import { Notifications } from "./Notifications";
import { useAuthStore } from "../store/authStore";
import type { DeliveryLogItem, NotificationLogItem } from "../lib/notifications/types";

const mocks = vi.hoisted(() => ({
  inbox: { isLoading: false, isError: false, data: undefined as unknown, refetch: vi.fn() },
  unread: { data: { unread_count: 0 } as { unread_count: number } | undefined },
  markOne: vi.fn(),
  markAll: vi.fn(),
  deliveryLog: { isLoading: false, isError: false, data: undefined as unknown, refetch: vi.fn() },
  deliveryLogCalls: [] as Array<{ enabled: boolean; page: number; status: string | undefined }>,
}));

vi.mock("../lib/notifications/hooks", () => ({
  useNotifications: () => mocks.inbox,
  useUnreadNotificationCount: () => mocks.unread,
  useMarkNotificationRead: () => ({ mutate: mocks.markOne, isPending: false, isError: false }),
  useMarkAllNotificationsRead: () => ({ mutate: mocks.markAll, isPending: false, isError: false }),
  useDeliveryLog: (enabled: boolean, page: number, status?: string) => {
    mocks.deliveryLogCalls.push({ enabled, page, status });
    return mocks.deliveryLog;
  },
}));

function todayInSchoolZone(offsetDays = 0): string {
  const moment = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dushanbe", year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
}

function notification(id: number, day: string, type: NotificationLogItem["type"], unread: boolean, sentAt: string | null = null): NotificationLogItem {
  return { id, user_id: 5, recipient: "private-chat-id", type, related_entity_id: 77, notification_date: day, status: "sent", attempts: 1, sent_at: sentAt, read_at: unread ? null : "2026-10-10T09:00:00Z" };
}

function page(items: NotificationLogItem[], totalPages = 1) {
  return { items, total: items.length, page: 1, page_size: 20, total_pages: totalPages };
}

function renderNotifications(role: "student" | "superadmin", url = "/notifications") {
  useAuthStore.setState({ role, userId: 5, status: "authenticated" });
  return render(<MemoryRouter initialEntries={[url]}><Notifications /></MemoryRouter>);
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  mocks.inbox = { isLoading: false, isError: false, data: page([]), refetch: vi.fn() };
  mocks.unread = { data: { unread_count: 0 } };
  mocks.deliveryLog = { isLoading: false, isError: false, data: { items: [], total: 0, page: 1, page_size: 20, total_pages: 1 }, refetch: vi.fn() };
  mocks.deliveryLogCalls = [];
  mocks.markOne.mockReset();
  mocks.markAll.mockReset();
});
afterEach(() => cleanup());

describe("Notifications inbox", () => {
  it("is titled Notifications without a title icon or info tooltip", () => {
    renderNotifications("student");
    expect(screen.getByRole("heading", { level: 1, name: /^Notifications/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    expect(document.querySelector("h1 svg")).toBeNull();
    expect(document.querySelector("[data-page-container]")).not.toBeNull();
    expect(screen.queryByText("System Notifications Log")).toBeNull();
  });

  it("groups by day with Today and Yesterday headings, translated titles and bodies, and unread dots", () => {
    mocks.inbox.data = page([
      notification(1, todayInSchoolZone(), "exam_result", true, new Date().toISOString()),
      notification(2, todayInSchoolZone(), "payment_reminder_1d", false),
      notification(3, todayInSchoolZone(-1), "payment_reminder_2d", true),
    ]);
    mocks.unread.data = { unread_count: 2 };
    renderNotifications("student");
    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Yesterday" })).toBeTruthy();
    const items = screen.getAllByTestId("notification-item");
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.getAttribute("data-unread"))).toEqual(["true", "false", "true"]);
    expect(within(items[0]).getByText("Exam result")).toBeTruthy();
    expect(within(items[0]).getByText("Your exam result is ready.")).toBeTruthy();
    expect(within(items[0]).getByTestId("unread-dot")).toBeTruthy();
    expect(within(items[1]).queryByTestId("unread-dot")).toBeNull();
    expect(within(items[2]).getByText("Your payment is due in 2 days.")).toBeTruthy();
    expect(screen.getByText("Unread: 2")).toBeTruthy();
  });

  it("never renders recipient identifiers, entity ids or raw type codes", () => {
    mocks.inbox.data = page([notification(1, todayInSchoolZone(), "exam_result", true), notification(2, todayInSchoolZone(), "mystery_event" as NotificationLogItem["type"], true)]);
    mocks.unread.data = { unread_count: 2 };
    const { container } = renderNotifications("student");
    expect(container.textContent).not.toContain("private-chat-id");
    expect(container.textContent).not.toContain("77");
    expect(container.textContent).not.toContain("mystery_event");
    expect(container.textContent).not.toContain("exam_result");
    expect(screen.getByText("You have a new message.")).toBeTruthy();
  });

  it("marks one record read from its own button and everything read from Mark all read", () => {
    mocks.inbox.data = page([notification(11, todayInSchoolZone(), "exam_result", true), notification(12, todayInSchoolZone(), "payment_reminder_1d", true)]);
    mocks.unread.data = { unread_count: 2 };
    renderNotifications("student");
    const rows = screen.getAllByTestId("notification-item");
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Mark as read" }));
    expect(mocks.markOne).toHaveBeenCalledWith(12);
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(mocks.markAll).toHaveBeenCalledTimes(1);
  });

  it("disables Mark all read when nothing is unread and offers no per-item button for read items", () => {
    mocks.inbox.data = page([notification(1, todayInSchoolZone(), "exam_result", false)]);
    renderNotifications("student");
    expect((screen.getByRole("button", { name: "Mark all read" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull();
    expect(screen.getByText("All caught up")).toBeTruthy();
  });

  it("shows a one-sentence empty state, a skeleton while loading and a retry on error", () => {
    renderNotifications("student");
    expect(screen.getByText("Nothing here yet. New messages from the center will show up here.")).toBeTruthy();
    cleanup();
    mocks.inbox.isLoading = true;
    renderNotifications("student");
    expect(screen.getByLabelText("Loading...")).toBeTruthy();
    cleanup();
    mocks.inbox = { isLoading: false, isError: true, data: undefined, refetch: vi.fn() };
    renderNotifications("student");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.inbox.refetch).toHaveBeenCalledTimes(1);
  });

  it("gives non-superadmin roles no tabs and never requests the delivery log, even from the address", () => {
    for (const role of ["student", "mentor", "accountant"] as const) {
      cleanup();
      mocks.deliveryLogCalls = [];
      useAuthStore.setState({ role, userId: 5, status: "authenticated" });
      render(<MemoryRouter initialEntries={["/notifications?tab=log"]}><Notifications /></MemoryRouter>);
      expect(screen.queryByRole("tablist")).toBeNull();
      expect(mocks.deliveryLogCalls).toEqual([]);
      expect(screen.getByText("Nothing here yet. New messages from the center will show up here.")).toBeTruthy();
    }
  });
});

describe("Notifications delivery log", () => {
  function deliveries(): { items: DeliveryLogItem[]; total: number; page: number; page_size: number; total_pages: number } {
    return {
      items: [
        { id: 1, recipient_name: "Aziza Karimova", type: "exam_result", notification_date: "2026-10-10", status: "sent", attempts: 1, sent_at: "2026-10-10T08:00:00Z" },
        { id: 2, recipient_name: null, type: "payment_reminder_1d", notification_date: "2026-10-09", status: "failed", attempts: 3, sent_at: null },
      ],
      total: 2, page: 1, page_size: 20, total_pages: 1,
    };
  }

  it("shows the Inbox and Delivery log tabs to the superadmin and switches with the keyboard", () => {
    renderNotifications("superadmin");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Inbox", "Delivery log"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Delivery log" }).getAttribute("aria-selected")).toBe("true");
  });

  it("lists names with status chips, a localized event and an unknown recipient fallback, never ids", () => {
    mocks.deliveryLog.data = deliveries();
    const { container } = renderNotifications("superadmin", "/notifications?tab=log");
    const rows = screen.getAllByTestId("delivery-item");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Aziza Karimova")).toBeTruthy();
    expect(within(rows[0]).getByTestId("delivery-status").getAttribute("data-status")).toBe("sent");
    expect(within(rows[1]).getByText("Unknown recipient")).toBeTruthy();
    expect(within(rows[1]).getByTestId("delivery-status").textContent).toContain("Failed · 3");
    expect(within(rows[1]).getByText("Not sent")).toBeTruthy();
    expect(container.textContent).not.toContain("payment_reminder_1d");
  });

  it("requests only failed deliveries when the failed-only chip is on and removes the filter with the chip", () => {
    mocks.deliveryLog.data = deliveries();
    renderNotifications("superadmin", "/notifications?tab=log");
    expect(mocks.deliveryLogCalls.at(-1)).toEqual({ enabled: true, page: 1, status: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Failed only" }));
    expect(mocks.deliveryLogCalls.at(-1)).toEqual({ enabled: true, page: 1, status: "failed" });
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(mocks.deliveryLogCalls.at(-1)).toEqual({ enabled: true, page: 1, status: undefined });
  });

  it("restores the failed-only filter from the address and explains an empty failed list", () => {
    renderNotifications("superadmin", "/notifications?tab=log&failed=1");
    expect(mocks.deliveryLogCalls.at(-1)?.status).toBe("failed");
    expect(screen.getByText("No failed deliveries.")).toBeTruthy();
  });

  it("shows a retry when the log cannot be loaded", () => {
    mocks.deliveryLog = { isLoading: false, isError: true, data: undefined, refetch: vi.fn() };
    renderNotifications("superadmin", "/notifications?tab=log");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.deliveryLog.refetch).toHaveBeenCalledTimes(1);
  });
});
