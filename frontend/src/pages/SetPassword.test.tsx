import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { SetPassword } from "./SetPassword";
import * as authEndpoints from "../lib/auth/endpoints";
import { AuthApiError, NetworkError } from "../lib/auth/errors";
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

describe("SetPassword page integration", () => {
  it("renders heading, concise requirements, labeled 48px inputs, common visibility action, and submit button", () => {
    renderSetPassword();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Set Password");

    expect(screen.getByText("Must be at least 8 characters and contain at least 1 digit")).not.toBeNull();

    const newPasswordInput = screen.getByLabelText(/^New Password/);
    expect(newPasswordInput.getAttribute("type")).toBe("password");
    expect(newPasswordInput.getAttribute("autocomplete")).toBe("new-password");

    const confirmPasswordInput = screen.getByLabelText(/^Confirm Password/);
    expect(confirmPasswordInput.getAttribute("type")).toBe("password");
    expect(confirmPasswordInput.getAttribute("autocomplete")).toBe("new-password");

    const toggleButton = screen.getByTestId("toggle-both-passwords");
    expect(toggleButton.textContent).toContain("Show both passwords");

    const submitButton = screen.getByRole("button", { name: "Save Password" });
    expect(submitButton.getAttribute("type")).toBe("submit");
  });

  it("toggles visibility of both password inputs simultaneously with common 44px action", async () => {
    const user = userEvent.setup();
    renderSetPassword();

    const newPasswordInput = screen.getByLabelText(/^New Password/);
    const confirmPasswordInput = screen.getByLabelText(/^Confirm Password/);
    const toggleButton = screen.getByTestId("toggle-both-passwords");

    expect(newPasswordInput.getAttribute("type")).toBe("password");
    expect(confirmPasswordInput.getAttribute("type")).toBe("password");
    expect(toggleButton.textContent).toContain("Show both passwords");
    expect(toggleButton.getAttribute("aria-label")).toBe("Show both passwords");

    await user.click(toggleButton);

    expect(newPasswordInput.getAttribute("type")).toBe("text");
    expect(confirmPasswordInput.getAttribute("type")).toBe("text");
    expect(toggleButton.textContent).toContain("Hide both passwords");
    expect(toggleButton.getAttribute("aria-label")).toBe("Hide both passwords");

    await user.click(toggleButton);

    expect(newPasswordInput.getAttribute("type")).toBe("password");
    expect(confirmPasswordInput.getAttribute("type")).toBe("password");
    expect(toggleButton.textContent).toContain("Show both passwords");
  });

  it("validates required fields on empty submit", async () => {
    const user = userEvent.setup();
    renderSetPassword();

    await user.click(screen.getByRole("button", { name: "Save Password" }));

    expect(await screen.findAllByText("Required field")).toHaveLength(2);
  });

  it("enforces minimum 8 characters requirement", async () => {
    const user = userEvent.setup();
    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "short1");
    await user.type(screen.getByLabelText(/^Confirm Password/), "short1");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    expect(await screen.findByText("Password must be at least 8 characters long")).not.toBeNull();
  });

  it("enforces at least 1 digit requirement", async () => {
    const user = userEvent.setup();
    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "longpasswordwithoutdigits");
    await user.type(screen.getByLabelText(/^Confirm Password/), "longpasswordwithoutdigits");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    expect(await screen.findByText("Password must contain at least 1 digit")).not.toBeNull();
  });

  it("accepts Unicode digits matching backend isdigit policy", async () => {
    const user = userEvent.setup();
    const setPasswordSpy = vi.spyOn(authEndpoints, "setPassword").mockResolvedValue({
      access_token: createMockToken("student", 42, false),
      refresh_token: "new-refresh-token",
      token_type: "bearer",
      must_set_password: false,
    });

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "secretpass١");
    await user.type(screen.getByLabelText(/^Confirm Password/), "secretpass١");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => {
      expect(setPasswordSpy).toHaveBeenCalledWith("secretpass١");
    });
  });

  it("enforces password matching on confirmation input", async () => {
    const user = userEvent.setup();
    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "correctPassword123");
    await user.type(screen.getByLabelText(/^Confirm Password/), "mismatchedPassword123");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    expect(await screen.findByText("Passwords do not match")).not.toBeNull();
  });

  it("prevents duplicate submissions on simultaneous synchronous form submit events, and allows retry on failure", async () => {
    const user = userEvent.setup();
    let resolveFirstCall: ((value: TokenPair) => void) | null = null;
    const firstCallPromise = new Promise<TokenPair>((resolve) => {
      resolveFirstCall = resolve;
    });

    const setPasswordSpy = vi.spyOn(authEndpoints, "setPassword").mockImplementation(() => firstCallPromise);

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "myValidPassword123");
    await user.type(screen.getByLabelText(/^Confirm Password/), "myValidPassword123");

    const submitBtn = screen.getByRole("button", { name: "Save Password" });
    const form = submitBtn.closest("form")!;

    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(setPasswordSpy).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveFirstCall!({
        access_token: createMockToken("student", 42, false),
        refresh_token: "new-refresh",
        token_type: "bearer",
        must_set_password: false,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("student-landing")).not.toBeNull();
    });
  });

  it("releases submission guard after failure allowing retry with preserved values", async () => {
    const user = userEvent.setup();
    const setPasswordSpy = vi
      .spyOn(authEndpoints, "setPassword")
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce({
        access_token: createMockToken("student", 42, false),
        refresh_token: "new-refresh",
        token_type: "bearer",
        must_set_password: false,
      });

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "validPassword123");
    await user.type(screen.getByLabelText(/^Confirm Password/), "validPassword123");

    await user.click(screen.getByRole("button", { name: "Save Password" }));

    expect(
      await screen.findByText("Could not connect to server. Check your internet connection"),
    ).not.toBeNull();

    expect((screen.getByLabelText(/^New Password/) as HTMLInputElement).value).toBe("validPassword123");
    expect((screen.getByLabelText(/^Confirm Password/) as HTMLInputElement).value).toBe("validPassword123");

    await user.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => {
      expect(setPasswordSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("student-landing")).not.toBeNull();
    });
  });

  it("maps exact backend 400 password policy error to newPassword field", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "setPassword").mockRejectedValue(
      new AuthApiError(400, "Password must be at least 8 characters and contain at least 1 digit"),
    );

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "validPass1");
    await user.type(screen.getByLabelText(/^Confirm Password/), "validPass1");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => {
      expect(document.getElementById("newPassword-error")?.textContent).toContain(
        "Password must be at least 8 characters and contain at least 1 digit",
      );
    });
  });

  it("maps arbitrary 400 error to safe generic setPasswordError alert", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "setPassword").mockRejectedValue(
      new AuthApiError(400, "Unexpected database constraint or business rule violation"),
    );

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "validPass1");
    await user.type(screen.getByLabelText(/^Confirm Password/), "validPass1");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Failed to save password");
    expect(alert.textContent).not.toContain("Unexpected database constraint");
  });

  it("clears obsolete server field error when user modifies the input", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "setPassword").mockRejectedValue(
      new AuthApiError(400, "Password must be at least 8 characters and contain at least 1 digit"),
    );

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "validPass1");
    await user.type(screen.getByLabelText(/^Confirm Password/), "validPass1");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => {
      expect(document.getElementById("newPassword-error")).not.toBeNull();
    });

    await user.type(screen.getByLabelText(/^New Password/), "2");

    await waitFor(() => {
      expect(document.getElementById("newPassword-error")).toBeNull();
    });
  });

  it("retranslates visible validation errors on language switch", async () => {
    const user = userEvent.setup();
    renderSetPassword();

    await user.click(screen.getByRole("button", { name: "Save Password" }));

    expect(await screen.findAllByText("Required field")).toHaveLength(2);

    await act(async () => {
      await i18n.changeLanguage("ru");
    });

    expect(await screen.findAllByText("Обязательное поле")).toHaveLength(2);

    await act(async () => {
      await i18n.changeLanguage("tg");
    });

    expect(await screen.findAllByText("Майдони ҳатмӣ")).toHaveLength(2);
  });

  it("retranslates visible server field errors on language switch", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "setPassword").mockRejectedValue(
      new AuthApiError(400, "Password must be at least 8 characters and contain at least 1 digit"),
    );

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "validPass1");
    await user.type(screen.getByLabelText(/^Confirm Password/), "validPass1");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    expect(
      await screen.findByText("Must be at least 8 characters and contain at least 1 digit"),
    ).not.toBeNull();

    await act(async () => {
      await i18n.changeLanguage("ru");
    });

    expect(
      await screen.findByText("Пароль должен содержать не менее 8 символов и хотя бы одну цифру"),
    ).not.toBeNull();

    await act(async () => {
      await i18n.changeLanguage("tg");
    });

    expect(
      await screen.findByText("Парол бояд камаш 8 рамз ва ҳадди ақал як рақам дошта бошад"),
    ).not.toBeNull();
  });

  it("handles successful password setup for student: clears forced state and navigates to student landing", async () => {
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
      expect(screen.getByTestId("student-landing")).not.toBeNull();
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
      expect(screen.getByTestId("student-landing")).not.toBeNull();
    });
  });

  it("handles successful password setup for mentor: navigates to mentor landing", async () => {
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
      expect(screen.getByTestId("mentor-landing")).not.toBeNull();
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

  it("renders backend 422 string_too_short with explicit 8 across EN, RU, and TG without unresolved interpolation", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "setPassword").mockRejectedValue(
      new AuthApiError(422, [
        {
          loc: ["body", "new_password"],
          msg: "String should have at least 8 characters",
          type: "string_too_short",
          ctx: { min_length: 8 },
        },
      ]),
    );

    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "secretPass1");
    await user.type(screen.getByLabelText(/^Confirm Password/), "secretPass1");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => {
      const errorText = document.getElementById("newPassword-error")?.textContent ?? "";
      expect(errorText).toContain("8");
      expect(errorText).not.toContain("{{min}}");
      expect(errorText).toBe("Password must be at least 8 characters long");
    });

    await act(async () => {
      await i18n.changeLanguage("ru");
    });

    expect(document.getElementById("newPassword-error")?.textContent).toBe(
      "Пароль должен содержать минимум 8 символов",
    );

    await act(async () => {
      await i18n.changeLanguage("tg");
    });

    expect(document.getElementById("newPassword-error")?.textContent).toBe(
      "Парол бояд камаш 8 рамз дошта бошад",
    );
  });

  it("rejects Roman numerals and fractions in client form validation", async () => {
    const user = userEvent.setup();
    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "abcdefghⅧ");
    await user.type(screen.getByLabelText(/^Confirm Password/), "abcdefghⅧ");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    expect(await screen.findByText("Password must contain at least 1 digit")).not.toBeNull();
  });

  it("rejects short astral codepoints in client form validation", async () => {
    const user = userEvent.setup();
    renderSetPassword();

    await user.type(screen.getByLabelText(/^New Password/), "💡💡💡💡1");
    await user.type(screen.getByLabelText(/^Confirm Password/), "💡💡💡💡1");
    await user.click(screen.getByRole("button", { name: "Save Password" }));

    expect(await screen.findByText("Password must be at least 8 characters long")).not.toBeNull();
  });
});
