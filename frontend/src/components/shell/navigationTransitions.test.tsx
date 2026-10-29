import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { Sidebar } from "../Sidebar";
import { BottomNavigation } from "./BottomNavigation";
import { useAuthStore } from "../../store/authStore";
import { httpClient } from "../../lib/auth/httpClient";
import "../../i18n";

const mock = new MockAdapter(httpClient);

function mountNavigation(): void {
  useAuthStore.setState({ status: "authenticated", userId: 42, role: "student", mustSetPassword: false });
  const client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/"]}><Sidebar /><BottomNavigation /></MemoryRouter></QueryClientProvider>);
}

describe("navigation color transitions", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
    mock.onGet("/notifications/unread-count").reply(200, { unread_count: 0 });
  });

  afterEach(() => {
    cleanup();
    mock.reset();
    vi.unstubAllGlobals();
  });

  it("transitions background and text color in 150ms on every sidebar and bottom navigation item", () => {
    mountNavigation();
    const items: HTMLElement[] = [
      ...within(screen.getByRole("complementary")).getAllByRole("link"),
      ...within(screen.getAllByRole("navigation")[1]).getAllByRole("link"),
      ...within(screen.getAllByRole("navigation")[1]).getAllByRole("button"),
    ];
    expect(items.length).toBeGreaterThan(4);
    const navigationItems: HTMLElement[] = items.filter((item) => item.className.includes("rounded-[10px]"));
    expect(navigationItems.length).toBeGreaterThan(4);
    navigationItems.forEach((item) => {
      expect(item.className).toContain("motion-safe:transition-[color,background-color]");
      expect(item.className).toContain("motion-safe:duration-150");
      expect(item.className).toContain("motion-safe:ease-out");
    });
  });
});
