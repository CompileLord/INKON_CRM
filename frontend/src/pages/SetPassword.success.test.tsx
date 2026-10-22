import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { SetPassword } from "./SetPassword";
import * as authEndpoints from "../lib/auth/endpoints";
import { useAuthStore } from "../store/authStore";

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

function renderSetPassword(initialEntry = "/set-password") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/" element={<div data-testid="dashboard-landing">Dashboard Landing</div>} />
          <Route path="/students/:id" element={<div data-testid="student-landing">Student Landing</div>} />
          <Route path="/mentors/:id" element={<div data-testid="mentor-landing">Mentor Landing</div>} />
          <Route path="/login" element={<div data-testid="login-landing">Login Landing</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  const forcedStudentToken = createMockToken("student", 42, true);
  useAuthStore.getState().setAuthenticated(forcedStudentToken, "refresh-fixture", true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SetPassword success flows", () => {
  it("handles successful password setup for student: clears forced state and navigates to the common home", async () => {
    const user = userEvent.setup();
    const setPasswordSpy = vi.spyOn(authEndpoints, "setPassword").mockResolvedValue({
      access_token: createMockToken("student", 42, false),
      refresh_token: "refreshed-token-42",
      token_type: "bearer",
      must_set_password: false,
    });

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "myNewSafePassword123");
    await user.type(screen.getByLabelText(/^Confirm Password/), "myNewSafePassword123");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => {
      expect(setPasswordSpy).toHaveBeenCalledWith("myNewSafePassword123");
      expect(screen.getByTestId("dashboard-landing")).not.toBeNull();
    });

    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.mustSetPassword).toBe(false);
    expect(state.role).toBe("student");
    expect(state.userId).toBe(42);
  });

  it("handles successful password setup for superadmin: navigates to dashboard", async () => {
    const superadminToken = createMockToken("superadmin", 1, true);
    useAuthStore.getState().setAuthenticated(superadminToken, "refresh-admin", true);

    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "setPassword").mockResolvedValue({
      access_token: createMockToken("superadmin", 1, false),
      refresh_token: "refreshed-token-admin",
      token_type: "bearer",
      must_set_password: false,
    });

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "superAdminPass99");
    await user.type(screen.getByLabelText(/^Confirm Password/), "superAdminPass99");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-landing")).not.toBeNull();
    });

    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.mustSetPassword).toBe(false);
    expect(state.role).toBe("superadmin");
  });

  it("submits on native Enter key in password input", async () => {
    const user = userEvent.setup();
    const setPasswordSpy = vi.spyOn(authEndpoints, "setPassword").mockResolvedValue({
      access_token: createMockToken("student", 42, false),
      refresh_token: "refreshed-token-42",
      token_type: "bearer",
      must_set_password: false,
    });

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "myNewSafePassword123");
    await user.type(screen.getByLabelText(/^Confirm Password/), "myNewSafePassword123{enter}");

    await waitFor(() => {
      expect(setPasswordSpy).toHaveBeenCalledWith("myNewSafePassword123");
      expect(screen.getByTestId("dashboard-landing")).not.toBeNull();
    });
  });

  it("handles successful password setup for mentor: navigates to the common home", async () => {
    const mentorToken = createMockToken("mentor", 12, true);
    useAuthStore.getState().setAuthenticated(mentorToken, "refresh-mentor", true);

    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "setPassword").mockResolvedValue({
      access_token: createMockToken("mentor", 12, false),
      refresh_token: "refreshed-token-mentor",
      token_type: "bearer",
      must_set_password: false,
    });

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "mentorSafePass123");
    await user.type(screen.getByLabelText(/^Confirm Password/), "mentorSafePass123");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-landing")).not.toBeNull();
    });

    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.mustSetPassword).toBe(false);
    expect(state.role).toBe("mentor");
  });

  it("handles successful password setup for accountant: navigates to dashboard", async () => {
    const accountantToken = createMockToken("accountant", 5, true);
    useAuthStore.getState().setAuthenticated(accountantToken, "refresh-acc", true);

    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "setPassword").mockResolvedValue({
      access_token: createMockToken("accountant", 5, false),
      refresh_token: "refreshed-token-acc",
      token_type: "bearer",
      must_set_password: false,
    });

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "accountantSafePass123");
    await user.type(screen.getByLabelText(/^Confirm Password/), "accountantSafePass123");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-landing")).not.toBeNull();
    });

    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.mustSetPassword).toBe(false);
    expect(state.role).toBe("accountant");
  });
});
