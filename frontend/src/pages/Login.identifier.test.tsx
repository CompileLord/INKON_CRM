import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { Login } from "./Login";
import * as authEndpoints from "../lib/auth/endpoints";
import { useAuthStore } from "../store/authStore";
import type { TokenPair } from "../lib/auth/types";

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

function renderLogin() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<div>Set Password Landing</div>} />
          <Route path="/forgot-password" element={<div>Forgot Landing</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

const mustSetPair: TokenPair = { access_token: "a", refresh_token: "r", token_type: "bearer", must_set_password: true };

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useAuthStore.getState().setUnauthenticated();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.getState().setUnauthenticated();
});

describe("Login identifier", () => {
  it("submits an email through the single identifier field", async () => {
    const loginSpy = vi.spyOn(authEndpoints, "login").mockResolvedValue(mustSetPair);
    renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email or phone/i), "kid@example.com");
    await user.type(screen.getByLabelText(/^password/i, { selector: "input" }), "Secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(loginSpy).toHaveBeenCalledWith("kid@example.com", "Secret123"));
  });

  it("submits a phone number as the same login value", async () => {
    const loginSpy = vi.spyOn(authEndpoints, "login").mockResolvedValue(mustSetPair);
    renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email or phone/i), "+992900000001");
    await user.type(screen.getByLabelText(/^password/i, { selector: "input" }), "Secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(loginSpy).toHaveBeenCalledWith("+992900000001", "Secret123"));
  });

  it("links to the forgot password page", async () => {
    renderLogin();
    await userEvent.setup().click(screen.getByRole("link", { name: "Forgot password?" }));
    expect(await screen.findByText("Forgot Landing")).toBeDefined();
  });
});
