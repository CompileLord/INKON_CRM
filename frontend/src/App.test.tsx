import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import App from "./App";
import { useAuthStore } from "./store/authStore";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useAuthStore.getState().setUnauthenticated();
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

describe("legacy activation route", () => {
  it("redirects a bookmarked /verify-email URL to the login page", async () => {
    window.history.pushState({}, "", "/verify-email");

    render(
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: /system sign in/i })).not.toBeNull();
    });
    expect(window.location.pathname).toBe("/login");
  });
});
