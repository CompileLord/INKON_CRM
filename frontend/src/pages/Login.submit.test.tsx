import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { Login } from "./Login";
import * as authEndpoints from "../lib/auth/endpoints";
import { AuthApiError } from "../lib/auth/errors";
import { useAuthStore } from "../store/authStore";
import type { TokenPair } from "../lib/auth/types";
import { httpClient } from "../lib/auth/httpClient";
import { tokenStorage } from "../lib/auth/tokenStorage";
import { SetPasswordRoute } from "../components/auth/SetPasswordRoute";

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

function createMockToken(role: string, id: number, mustSetPassword = false): string {
  const payload = {
    sub: String(id),
    role,
    must_set_password: mustSetPassword,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `mock.${btoa(JSON.stringify(payload))}.sig`;
}

function renderLogin(initialEntry = "/login") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div data-testid="dashboard-landing">Dashboard Landing</div>} />
          <Route path="/courses" element={<div data-testid="courses-landing">Courses Landing</div>} />
          <Route path="/set-password" element={<SetPasswordRoute><div data-testid="set-password-landing">Set Password Landing</div></SetPasswordRoute>} />
          <Route path="/students/:id" element={<div data-testid="student-landing">Student Landing</div>} />
          <Route path="/mentors/:id" element={<div data-testid="mentor-landing">Mentor Landing</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
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

describe("Login page submission", () => {
  it("prevents duplicate submissions on native keyboard Enter while pending", async () => {
    const user = userEvent.setup();
    let resolveLogin: (value: TokenPair) => void = () => {};

    const pendingPromise = new Promise<TokenPair>((resolve) => {
      resolveLogin = resolve;
    });

    const loginSpy = vi.spyOn(authEndpoints, "login").mockImplementationOnce(() => pendingPromise);

    renderLogin();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" }) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^password/i, { selector: "input" }) as HTMLInputElement;
    await user.type(emailInput, "admin@example.com");
    await user.type(passwordInput, "Password123");

    const submitBtn = screen.getByRole("button", { name: /sign in/i }) as HTMLButtonElement;

    await user.keyboard("{Enter}");
    expect(loginSpy).toHaveBeenCalledTimes(1);
    expect(submitBtn.getAttribute("aria-busy")).toBe("true");
    expect(submitBtn.disabled).toBe(true);

    await user.keyboard("{Enter}");
    expect(loginSpy).toHaveBeenCalledTimes(1);

    resolveLogin({
      access_token: createMockToken("superadmin", 1),
      refresh_token: "ref",
      token_type: "bearer",
      must_set_password: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-landing")).not.toBeNull();
    });
  });

  it("prevents duplicate submissions on simultaneous synchronous form submit events before React commits pending state, and allows retry on failure", async () => {
    const user = userEvent.setup();
    let rejectLogin: (reason: unknown) => void = () => {};

    const pendingPromise = new Promise<TokenPair>((_, reject) => {
      rejectLogin = reject;
    });

    const loginSpy = vi.spyOn(authEndpoints, "login").mockImplementationOnce(() => pendingPromise);

    renderLogin();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" }) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^password/i, { selector: "input" }) as HTMLInputElement;
    await user.type(emailInput, "admin@example.com");
    await user.type(passwordInput, "Password123");

    const submitBtn = screen.getByRole("button", { name: /sign in/i }) as HTMLButtonElement;
    const form = submitBtn.closest("form")!;

    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledTimes(1);
    });
    expect(submitBtn.getAttribute("aria-busy")).toBe("true");

    rejectLogin(new AuthApiError(401, "Invalid email or password"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).not.toBeNull();
    });
    expect(emailInput.value).toBe("admin@example.com");
    expect(passwordInput.value).toBe("Password123");
    expect(submitBtn.disabled).toBe(false);

    const retryPromise = Promise.resolve({
      access_token: createMockToken("superadmin", 1),
      refresh_token: "ref",
      token_type: "bearer",
      must_set_password: false,
    });
    loginSpy.mockImplementationOnce(() => retryPromise);

    await user.click(submitBtn);
    expect(loginSpy).toHaveBeenCalledTimes(2);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-landing")).not.toBeNull();
    });
  });

  it("routes forced-password user directly to /set-password", async () => {
    const user = userEvent.setup();
    const token = createMockToken("student", 42, true);
    vi.spyOn(authEndpoints, "login").mockResolvedValue({
      access_token: token,
      refresh_token: "refresh-tok",
      token_type: "bearer",
      must_set_password: true,
    });

    renderLogin();

    await user.type(screen.getByLabelText(/^email/i, { selector: "input" }), "forced@example.com");
    await user.type(screen.getByLabelText(/^password/i, { selector: "input" }), "InitialPass123");
    const getSpy = vi.spyOn(httpClient, "get");
    const postSpy = vi.spyOn(httpClient, "post");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByTestId("set-password-landing")).not.toBeNull();
    });
    expect(useAuthStore.getState().mustSetPassword).toBe(true);
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(tokenStorage.getAccessToken()).toBe(token);
    expect(tokenStorage.getRefreshToken()).toBe("refresh-tok");
    expect(screen.queryByTestId("dashboard-landing")).toBeNull();
    expect(getSpy).not.toHaveBeenCalled();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it.each([
    { role: "superadmin", id: 1, expectedLanding: "dashboard-landing" },
    { role: "accountant", id: 2, expectedLanding: "dashboard-landing" },
    { role: "student", id: 10, expectedLanding: "student-landing" },
    { role: "mentor", id: 20, expectedLanding: "mentor-landing" },
  ])("authenticates $role and redirects to canonical role landing", async ({ role, id, expectedLanding }) => {
    const user = userEvent.setup();
    const token = createMockToken(role, id);
    vi.spyOn(authEndpoints, "login").mockResolvedValue({
      access_token: token,
      refresh_token: "refresh-tok",
      token_type: "bearer",
      must_set_password: false,
    });

    renderLogin();

    await user.type(screen.getByLabelText(/^email/i, { selector: "input" }), `${role}@example.com`);
    await user.type(screen.getByLabelText(/^password/i, { selector: "input" }), "ValidPass123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByTestId(expectedLanding)).not.toBeNull();
    });
  });

  it.each([
    { param: "//evil.com", expectedLanding: "dashboard-landing" },
    { param: "/\\evil.com", expectedLanding: "dashboard-landing" },
    { param: "https://evil.com", expectedLanding: "dashboard-landing" },
    { param: "/courses", expectedLanding: "courses-landing" },
  ])("protects against open redirects with param $param", async ({ param, expectedLanding }) => {
    const user = userEvent.setup();
    const token = createMockToken("superadmin", 1);
    vi.spyOn(authEndpoints, "login").mockResolvedValue({
      access_token: token,
      refresh_token: "refresh-tok",
      token_type: "bearer",
      must_set_password: false,
    });

    renderLogin(`/login?redirect=${encodeURIComponent(param)}`);

    await user.type(screen.getByLabelText(/^email/i, { selector: "input" }), "admin@example.com");
    await user.type(screen.getByLabelText(/^password/i, { selector: "input" }), "ValidPass123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByTestId(expectedLanding)).not.toBeNull();
    });
  });
});
