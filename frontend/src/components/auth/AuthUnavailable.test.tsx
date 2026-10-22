import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "../../i18n";
import { AuthGuard } from "./AuthGuard";
import { useAuthStore } from "../../store/authStore";
import { refreshCoordinator } from "../../lib/auth/httpClient";
import { tokenStorage } from "../../lib/auth/tokenStorage";
import { NetworkError } from "../../lib/auth/errors";
import type { TokenPair } from "../../lib/auth/types";

function accessToken(): string {
  const payload: Record<string, unknown> = { sub: "7", role: "mentor", exp: Math.floor(Date.now() / 1000) + 3600 };
  return `header.${btoa(JSON.stringify(payload))}.unit-fixture`;
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  tokenStorage.setTokens({ accessToken: "old", refreshToken: "stored-refresh" });
  useAuthStore.setState({ status: "unavailable", mustSetPassword: false, role: null, userId: null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("refresh outage screen", () => {
  it("shows a retryable message instead of going to login, and recovers on Retry", async () => {
    vi.spyOn(refreshCoordinator, "refresh").mockImplementation(async (): Promise<TokenPair> => {
      useAuthStore.getState().setAuthenticated(accessToken(), "rotated", false);
      return { access_token: accessToken(), refresh_token: "rotated", token_type: "bearer", must_set_password: false };
    });
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route element={<AuthGuard />}>
            <Route path="/settings" element={<div>Settings page</div>} />
          </Route>
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Can't reach the server")).toBeTruthy();
    expect(screen.queryByText("Login page")).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBe("stored-refresh");
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Settings page")).toBeTruthy());
  });

  it("stays on the message when the retry also fails", async () => {
    vi.spyOn(refreshCoordinator, "refresh").mockRejectedValue(new NetworkError());
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AuthGuard />}>
            <Route path="/" element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(useAuthStore.getState().status).toBe("unavailable"), { timeout: 8000 });
    expect(screen.getByText("Can't reach the server")).toBeTruthy();
  });
});
