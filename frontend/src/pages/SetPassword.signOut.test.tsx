import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "../i18n";
import { SetPassword } from "./SetPassword";
import * as authEndpoints from "../lib/auth/endpoints";
import { tokenStorage } from "../lib/auth/tokenStorage";
import { useAuthStore } from "../store/authStore";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

function forcedPasswordToken(): string {
  const payload: Record<string, unknown> = { sub: "42", role: "student", must_set_password: true, exp: Math.floor(Date.now() / 1000) + 3600 };
  return `mock.${btoa(JSON.stringify(payload))}.sig`;
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useAuthStore.getState().setAuthenticated(forcedPasswordToken(), "refresh-fixture", true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SetPassword sign out", () => {
  it("offers a Sign out action that revokes the session, clears tokens and opens the login page", async () => {
    const logoutSpy = vi.spyOn(authEndpoints, "logout").mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={["/set-password"]}>
        <Routes>
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/login" element={<div data-testid="login-landing">Login Landing</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByTestId("login-landing")).not.toBeNull();
    expect(logoutSpy).toHaveBeenCalledWith("refresh-fixture");
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});
