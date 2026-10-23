import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "../i18n";
import { Login } from "./Login";
import * as authEndpoints from "../lib/auth/endpoints";
import { useAuthStore } from "../store/authStore";
import { SetPasswordRoute } from "../components/auth/SetPasswordRoute";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

function forcedToken(): string {
  const payload: Record<string, unknown> = { sub: "55", role: "student", must_set_password: true, exp: Math.floor(Date.now() / 1000) + 3600 };
  return `mock.${btoa(JSON.stringify(payload))}.sig`;
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useAuthStore.getState().setUnauthenticated();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.getState().setUnauthenticated();
});

describe("SMS code login", () => {
  it("normalizes the code, then goes straight to /set-password without showing the app", async () => {
    const loginSpy = vi.spyOn(authEndpoints, "login").mockResolvedValue({
      access_token: forcedToken(),
      refresh_token: "sms-refresh",
      token_type: "bearer",
      must_set_password: true,
    });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div data-testid="app-home">App home</div>} />
          <Route path="/students/:id" element={<div data-testid="app-home">App profile</div>} />
          <Route path="/set-password" element={<SetPasswordRoute><div data-testid="set-password-screen">Set password</div></SetPasswordRoute>} />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email or phone/i, { selector: "input" }), "+992931000005");
    await user.type(screen.getByLabelText(/^password/i, { selector: "input" }), "48x920 ");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByTestId("set-password-screen")).not.toBeNull());
    expect(loginSpy).toHaveBeenCalledWith("+992931000005", "48X920");
    expect(screen.queryByTestId("app-home")).toBeNull();
    expect(useAuthStore.getState().mustSetPassword).toBe(true);
  });
});
