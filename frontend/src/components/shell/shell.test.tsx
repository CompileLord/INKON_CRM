import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { AppLayout } from "../../layouts/AppLayout";
import { useAuthStore } from "../../store/authStore";
import { useShellStore } from "../../store/shellStore";
import { httpClient } from "../../lib/auth/httpClient";
import { navigationFor, primaryNavigation } from "./navigation";
import { PaymentModal } from "../finance/PaymentModal";
import type { NotificationLogItem } from "../../lib/notifications/types";
import i18n from "../../i18n";
import type { Role } from "../../lib/users/types";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) });
});

const mock = new MockAdapter(httpClient);
function layout(role: Role = "student") {
  useAuthStore.setState({ status: "authenticated", userId: 42, role, mustSetPassword: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><Routes><Route element={<AppLayout/>}><Route path="/" element={<><h1>Content fixture</h1><Link to="/settings">Destination fixture</Link><input aria-label="Draft fixture"/></>}/><Route path="/settings" element={<h1>Settings fixture</h1>}/><Route path="/notifications" element={<h1>History fixture</h1>}/></Route></Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  useShellStore.getState().close(); await i18n.changeLanguage("en"); mock.reset();
  mock.onGet("/notifications/unread-count").reply(200, { unread_count: 2 });
});
afterEach(() => { cleanup(); mock.reset(); vi.unstubAllGlobals(); });

describe("role navigation", () => {
  it.each(["superadmin", "mentor", "student", "accountant"] as const)("uses permitted destinations for %s", (role) => {
    const links = navigationFor(role, 42); expect(primaryNavigation(role, 42)).toHaveLength(3);
    expect(links.some((item) => item.to === "/notifications")).toBe(true);
    expect(links.some((item) => item.to === "/students")).toBe(role === "superadmin");
    expect(links.some((item) => item.to === "/finance")).toBe(role === "superadmin" || role === "accountant");
    expect(links.some((item) => item.to === "/students/42")).toBe(role === "student");
    expect(links.some((item) => item.to === "/mentors/42")).toBe(role === "mentor");
  });
  it("does not invent a profile without identity", () => expect(navigationFor("student", null).some((item) => item.key === "nav.ownProfile")).toBe(false));
});
describe("shared shell lifecycle", () => {
  it("opens only on activation and retains drafts through theme and locale changes", async () => {
    layout(); const user = userEvent.setup(); const settings = screen.getByRole("button", { name: "Theme and language settings" });
    await user.hover(settings); settings.focus(); expect(screen.queryByRole("dialog")).toBeNull();
    await user.type(screen.getByLabelText("Draft fixture"), "persistent"); await user.click(settings);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(screen.getByRole("button", { name: "Dark theme" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Русский" })); expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText("Draft fixture") as HTMLInputElement).value).toBe("persistent");
    await user.keyboard("{Escape}"); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useShellStore.getState().surface).toBeNull();
  });
  it("keeps one surface and closes it on navigation", async () => {
    layout(); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1); await user.click(screen.getByRole("link", { name: "Settings" }));
    expect(await screen.findByText("Settings fixture")).toBeTruthy(); expect(useShellStore.getState().surface).toBeNull();
    await waitFor(() => expect(document.activeElement?.id).toBe("main-content"));
  });
  it("shows safe events and retains read success after a refetch failure", async () => {
    const notification = { id: 7, type: "exam_result", notification_date: "2026-10-10", read_at: null, error_message: "private exception score:999", recipient: "private recipient", related_entity_id: 42 };
    mock.onGet("/notifications/").replyOnce(200, { items: [notification], total: 1, page: 1, page_size: 5 }).onGet("/notifications/").reply(503);
    mock.onPatch("/notifications/7/read").reply(200, { ...notification, read_at: "2026-10-10T10:00:00Z" });
    layout("mentor"); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Exam result")).toBeTruthy(); expect(screen.queryByText(/private exception|private recipient|score:999/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mark as read" })); expect(await screen.findByText("Read")).toBeTruthy();
    expect(await screen.findByText("The latest update failed. Previous information is shown.")).toBeTruthy(); expect(screen.getByText("Exam result")).toBeTruthy();
  });
  it("never announces zero on unread failure", async () => {
    mock.onGet("/notifications/unread-count").reply(503); layout();
    expect(await screen.findAllByText("Unread count unavailable")).not.toHaveLength(0); expect(screen.queryByLabelText("Unread notifications: 0")).toBeNull();
  });
  it("renders aria-busy loading skeleton with 5 bars while fetching notifications", async () => {
    mock.onGet("/notifications/").reply(() => new Promise(() => {}));
    layout("mentor");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    const skeleton = await screen.findByLabelText("Loading...");
    expect(skeleton.getAttribute("aria-busy")).toBe("true");
    expect(skeleton.children).toHaveLength(5);
  });
  it("shows empty notifications message when item list is empty", async () => {
    mock.onGet("/notifications/").reply(200, { items: [], total: 0, page: 1, page_size: 5 });
    layout("mentor");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Results and reminders for your account will appear here.")).toBeTruthy();
  });
  it("allows retrying both unread count and notification list on failure", async () => {
    mock.resetHandlers();
    mock.onGet("/notifications/unread-count").reply(503);
    mock.onGet("/notifications/").reply(503);
    layout("mentor");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Unread count unavailable")).toBeTruthy();
    expect(await within(dialog).findByText("Notifications could not be loaded. Try again.")).toBeTruthy();
    mock.resetHandlers();
    mock.onGet("/notifications/unread-count").reply(200, { unread_count: 3 });
    mock.onGet("/notifications/").reply(200, {
      items: [{ id: 1, type: "exam_result", notification_date: "2026-10-10", read_at: null, error_message: null, recipient: "test", related_entity_id: 1 }],
      total: 1,
      page: 1,
      page_size: 5,
    });
    const retryButtons = screen.getAllByRole("button", { name: "Retry" });
    for (const button of retryButtons) {
      await user.click(button);
    }
    expect(await screen.findByText("Unread notifications: 3")).toBeTruthy();
    expect(await screen.findByText("Exam result")).toBeTruthy();
  });
  it("handles row-local read failure and retry while preserving adjacent row actions", async () => {
    const itemA: NotificationLogItem = { id: 11, user_id: 42, type: "exam_result", status: "sent", attempts: 1, sent_at: "2026-10-10T10:00:00Z", notification_date: "2026-10-10", read_at: null, error_message: null, recipient: "test1", related_entity_id: 1 };
    const itemB: NotificationLogItem = { id: 12, user_id: 42, type: "payment_reminder_1d", status: "sent", attempts: 1, sent_at: "2026-10-10T10:00:00Z", notification_date: "2026-10-10", read_at: null, error_message: null, recipient: "test2", related_entity_id: 2 };
    mock.onGet("/notifications/").reply(() => [200, { items: [itemA, itemB], total: 2, page: 1, page_size: 5 }]);
    mock.onPatch("/notifications/11/read").replyOnce(500).onPatch("/notifications/11/read").reply(() => {
      itemA.read_at = "2026-10-10T12:00:00Z";
      return [200, itemA];
    });
    mock.onPatch("/notifications/12/read").reply(() => {
      itemB.read_at = "2026-10-10T12:00:00Z";
      return [200, itemB];
    });
    layout("mentor");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Exam result")).toBeTruthy();
    expect(await screen.findByText("Payment reminder")).toBeTruthy();
    const markButtons = screen.getAllByRole("button", { name: "Mark as read" });
    await user.click(markButtons[0]);
    expect(await screen.findByText("Could not mark this notification as read. Try again.")).toBeTruthy();
    const remainingMark = screen.getByRole("button", { name: "Mark as read" });
    await user.click(remainingMark);
    expect(await screen.findByText("Read")).toBeTruthy();
    const retryButton = screen.getByRole("button", { name: "Retry marking as read" });
    await user.click(retryButton);
    await waitFor(() => expect(screen.getAllByText("Read")).toHaveLength(2));
  });
  it("falls back to generic notification event without leaking error or internal identifiers", async () => {
    const item = { id: 99, type: "unrecognized_system_event", notification_date: "2026-10-10", read_at: null, error_message: "private SQL connection failed table_id:888", recipient: "confidential_admin@inkon.tj", related_entity_id: 888 };
    mock.onGet("/notifications/").reply(200, { items: [item], total: 1, page: 1, page_size: 5 });
    layout("mentor");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Account notification")).toBeTruthy();
    expect(screen.queryByText(/unrecognized_system_event|private SQL|confidential_admin|888/)).toBeNull();
  });
  it("isolates notification queries when the authenticated user changes", async () => {
    mock.onGet("/notifications/").reply(() => {
      const currentId = useAuthStore.getState().userId;
      if (currentId === 42) {
        return [200, { items: [{ id: 42, type: "exam_result", notification_date: "2026-10-10", read_at: null, error_message: null, recipient: "user42", related_entity_id: 1 }], total: 1, page: 1, page_size: 5 }];
      }
      return [200, { items: [{ id: 99, type: "payment_reminder_1d", notification_date: "2026-10-10", read_at: null, error_message: null, recipient: "user99", related_entity_id: 2 }], total: 1, page: 1, page_size: 5 }];
    });
    layout("mentor");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Exam result")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    useAuthStore.setState({ userId: 99 });
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Payment reminder")).toBeTruthy();
    expect(screen.queryByText("Exam result")).toBeNull();
  });
  it("closes open shell overlay when PaymentModal opens", async () => {
    const client = new QueryClient();
    const button = document.createElement("button");
    useShellStore.getState().toggle("settings", button);
    expect(useShellStore.getState().surface).toBe("settings");
    const { rerender } = render(<QueryClientProvider client={client}><PaymentModal isOpen={false} onClose={() => {}} onSuccess={() => {}} /></QueryClientProvider>);
    expect(useShellStore.getState().surface).toBe("settings");
    rerender(<QueryClientProvider client={client}><PaymentModal isOpen={true} onClose={() => {}} onSuccess={() => {}} /></QueryClientProvider>);
    expect(useShellStore.getState().surface).toBeNull();
  });
  it("has a first skip link and no global search", () => {
    layout(); expect(screen.getAllByRole("link")[0].getAttribute("href")).toBe("#main-content"); expect(screen.queryByPlaceholderText("Search...")).toBeNull();
  });
});
