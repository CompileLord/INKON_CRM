import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { Header } from "../Header";
import { useAuthStore } from "../../store/authStore";
import { httpClient } from "../../lib/auth/httpClient";
import i18n from "../../i18n";

const mock = new MockAdapter(httpClient);

beforeEach(async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  useAuthStore.setState({ status: "authenticated", userId: 1, role: "superadmin", mustSetPassword: false });
  mock.onGet("/notifications/unread-count").reply(200, { unread_count: 0 });
  await i18n.changeLanguage("ru");
});
afterEach(async () => {
  cleanup();
  mock.reset();
  vi.unstubAllGlobals();
  await i18n.changeLanguage("en");
});

function renderHeader(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><Header /></MemoryRouter></QueryClientProvider>);
}

describe("Header tooltips", () => {
  it("labels the bell and the gear with tooltips", () => {
    renderHeader();
    const bell: HTMLElement = screen.getByRole("button", { name: "Уведомления" });
    fireEvent.focus(bell);
    expect(screen.getByRole("tooltip").textContent).toBe("Уведомления");
    fireEvent.blur(bell);
    const gear: HTMLElement = document.querySelector("[data-shell-settings]") as HTMLElement;
    fireEvent.focus(gear);
    expect(screen.getByRole("tooltip").textContent).toBe("Быстрые настройки");
  });
});
