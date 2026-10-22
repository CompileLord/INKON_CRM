import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { Login } from "./Login";
import * as authEndpoints from "../lib/auth/endpoints";
import { AuthApiError, NetworkError } from "../lib/auth/errors";
import { useAuthStore } from "../store/authStore";
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

describe("Login page integration", () => {
  it("renders with AuthFrame composition, localized heading and editorial copy", () => {
    renderLogin();

    expect(screen.getByRole("heading", { level: 1, name: /system sign in/i })).not.toBeNull();

    expect(screen.getByText(/open a new chapter\./i)).not.toBeNull();
    expect(screen.getByText(/your courses, progress, and learning community in one place\./i)).not.toBeNull();

    const emailInput = screen.getByLabelText(/^email or phone/i, { selector: "input" });
    expect(emailInput.getAttribute("type")).toBe("text");
    expect(emailInput.getAttribute("autocomplete")).toBe("username");

    const passwordInput = screen.getByLabelText(/^password/i, { selector: "input" });
    expect(passwordInput.getAttribute("type")).toBe("password");
    expect(passwordInput.getAttribute("autocomplete")).toBe("current-password");

    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    expect(submitBtn.getAttribute("type")).toBe("submit");

    expect(screen.queryByRole("link", { name: /activate account/i })).toBeNull();
    expect(document.querySelector('a[href="/verify-email"]')).toBeNull();
    const hint = screen.getByText("New student? Enter the 6-character code from the SMS.");
    expect(hint.className).toContain("text-muted");
  });

  it("validates empty and invalid fields with accessible error association", async () => {
    const user = userEvent.setup();
    renderLogin();

    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    await user.click(submitBtn);

    const emailInput = screen.getByLabelText(/^email or phone/i, { selector: "input" });
    const passwordInput = screen.getByLabelText(/^password/i, { selector: "input" });

    await waitFor(() => {
      expect(emailInput.getAttribute("aria-invalid")).toBe("true");
      expect(passwordInput.getAttribute("aria-invalid")).toBe("true");
    });

    const emailErrorId = emailInput.getAttribute("aria-describedby");
    const passErrorId = passwordInput.getAttribute("aria-describedby");
    expect(emailErrorId).toBe("login-error");
    expect(passErrorId).toBe("password-error");
    expect(document.getElementById("login-error")).not.toBeNull();
    expect(document.getElementById("password-error")).not.toBeNull();

    await user.type(emailInput, "not-an-email");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(document.getElementById("login-error")?.textContent).toContain("Enter a valid email or phone number");
    });
  });

  it("toggles password visibility without submitting form and maintains stable focus", async () => {
    const user = userEvent.setup();
    const loginSpy = vi.spyOn(authEndpoints, "login");
    renderLogin();

    const passwordInput = screen.getByLabelText(/^password/i, { selector: "input" });
    const toggleButton = screen.getByRole("button", { name: /show password/i });

    expect(toggleButton.getAttribute("type")).toBe("button");
    expect(passwordInput.getAttribute("type")).toBe("password");

    await user.type(passwordInput, "SecretPassword123");
    await user.click(toggleButton);

    expect(passwordInput.getAttribute("type")).toBe("text");
    expect(screen.getByRole("button", { name: /hide password/i })).not.toBeNull();
    expect(loginSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput.getAttribute("type")).toBe("password");
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it("handles 401 invalid credentials and re-translates error dynamically across locales without clearing input", async () => {
    const user = userEvent.setup();
    const error401 = new AuthApiError(401, "Invalid login or password");
    vi.spyOn(authEndpoints, "login").mockRejectedValue(error401);
    renderLogin();

    const emailInput = screen.getByLabelText(/^email or phone/i, { selector: "input" }) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^password/i, { selector: "input" }) as HTMLInputElement;
    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "WrongPassword");

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Invalid login or password");
    expect(emailInput.value).toBe("user@example.com");
    expect(passwordInput.value).toBe("WrongPassword");

    await i18n.changeLanguage("ru");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Неверный логин или пароль");
    });
    const ruEmail = screen.getByLabelText(/почта или телефон/i, { selector: "input" }) as HTMLInputElement;
    const ruPass = screen.getByLabelText(/^пароль/i, { selector: "input" }) as HTMLInputElement;
    expect(ruEmail.value).toBe("user@example.com");
    expect(ruPass.value).toBe("WrongPassword");

    await i18n.changeLanguage("tg");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Логин ё пароли нодуруст аст");
    });
    const tgEmail = screen.getByLabelText(/почта ё телефон/i, { selector: "input" }) as HTMLInputElement;
    const tgPass = screen.getByLabelText(/^парол/i, { selector: "input" }) as HTMLInputElement;
    expect(tgEmail.value).toBe("user@example.com");
    expect(tgPass.value).toBe("WrongPassword");
  });

  it("handles network failure and displays localized offline error while preserving values", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "login").mockRejectedValue(new NetworkError());
    renderLogin();

    const emailInput = screen.getByLabelText(/^email or phone/i, { selector: "input" }) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^password/i, { selector: "input" }) as HTMLInputElement;
    await user.type(emailInput, "network@example.com");
    await user.type(passwordInput, "SomePass123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not connect to server. Check your internet connection");
    expect(emailInput.value).toBe("network@example.com");
    expect(passwordInput.value).toBe("SomePass123");
  });

  it("handles 422 verified email format response and preserves error through language switch", async () => {
    const user = userEvent.setup();
    const technicalEmailMessage = "Email format check failed: user input is invalid syntax";
    const error422 = new AuthApiError(422, [
      {
        loc: ["body", "email"],
        msg: technicalEmailMessage,
        type: "value_error",
        ctx: { reason: "An email address must have an @-sign." },
      },
    ]);
    vi.spyOn(authEndpoints, "login").mockRejectedValue(error422);
    renderLogin();

    const emailInput = screen.getByLabelText(/^email or phone/i, { selector: "input" }) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^password/i, { selector: "input" }) as HTMLInputElement;
    await user.type(emailInput, "bad-format");
    await user.type(passwordInput, "Password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(emailInput.getAttribute("aria-invalid")).toBe("true");
    });
    const emailError = document.getElementById("login-error");
    expect(emailError?.textContent).toContain("Enter a valid email or phone number");
    expect(document.body.textContent).not.toContain(technicalEmailMessage);
    expect(emailInput.value).toBe("bad-format");
    expect(passwordInput.value).toBe("Password123");

    await i18n.changeLanguage("ru");
    await waitFor(() => {
      expect(document.getElementById("login-error")?.textContent).toContain("Введите корректную почту или номер телефона");
    });
    expect(emailInput.value).toBe("bad-format");
    expect(passwordInput.value).toBe("Password123");

    await i18n.changeLanguage("tg");
    await waitFor(() => {
      expect(document.getElementById("login-error")?.textContent).toContain("Почтаи дуруст ё рақами телефонро ворид кунед");
    });
    expect(emailInput.value).toBe("bad-format");
    expect(passwordInput.value).toBe("Password123");
  });

  it("handles 422 arbitrary value_error on email with localized generic field error and preserves through language switch", async () => {
    const user = userEvent.setup();
    const technicalBackendMessage = "Domain not allowed: database check failed for @corp.com";
    const error422 = new AuthApiError(422, [
      { loc: ["body", "email"], msg: technicalBackendMessage, type: "value_error" },
    ]);
    vi.spyOn(authEndpoints, "login").mockRejectedValue(error422);
    renderLogin();

    const emailInput = screen.getByLabelText(/^email or phone/i, { selector: "input" }) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^password/i, { selector: "input" }) as HTMLInputElement;
    await user.type(emailInput, "bad@domain.com");
    await user.type(passwordInput, "Password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(emailInput.getAttribute("aria-invalid")).toBe("true");
    });
    const emailError = document.getElementById("login-error");
    expect(emailError?.textContent).toContain("Something went wrong. Please try again");
    expect(document.body.textContent).not.toContain(technicalBackendMessage);
    expect(emailInput.value).toBe("bad@domain.com");
    expect(passwordInput.value).toBe("Password123");

    await i18n.changeLanguage("ru");
    await waitFor(() => {
      expect(document.getElementById("login-error")?.textContent).toContain("Что-то пошло не так. Попробуйте ещё раз");
    });
    expect(emailInput.value).toBe("bad@domain.com");
    expect(passwordInput.value).toBe("Password123");
    expect(document.body.textContent).not.toContain(technicalBackendMessage);

    await i18n.changeLanguage("tg");
    await waitFor(() => {
      expect(document.getElementById("login-error")?.textContent).toContain("Хатои номаълум рух дод. Лутфан бори дигар кӯшиш кунед");
    });
    expect(emailInput.value).toBe("bad@domain.com");
    expect(passwordInput.value).toBe("Password123");
    expect(document.body.textContent).not.toContain(technicalBackendMessage);
  });

  it("handles 422 arbitrary value_error on filled password with localized generic field error", async () => {
    const user = userEvent.setup();
    const technicalPasswordMessage = "Crypto hash mismatch trace #49284 in argon2 pipeline";
    const error422 = new AuthApiError(422, [
      { loc: ["body", "password"], msg: technicalPasswordMessage, type: "value_error" },
    ]);
    vi.spyOn(authEndpoints, "login").mockRejectedValue(error422);
    renderLogin();

    const emailInput = screen.getByLabelText(/^email or phone/i, { selector: "input" });
    const passwordInput = screen.getByLabelText(/^password/i, { selector: "input" });
    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "Secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(passwordInput.getAttribute("aria-invalid")).toBe("true");
    });
    const passwordError = document.getElementById("password-error");
    expect(passwordError?.textContent).toContain("Something went wrong. Please try again");
    expect(passwordError?.textContent).not.toContain("Required field");
    expect(document.body.textContent).not.toContain(technicalPasswordMessage);

    await i18n.changeLanguage("ru");
    await waitFor(() => {
      expect(document.getElementById("password-error")?.textContent).toContain("Что-то пошло не так. Попробуйте ещё раз");
    });
  });

  it("handles 422 missing fields with localized required field errors", async () => {
    const user = userEvent.setup();
    const error422 = new AuthApiError(422, [
      { loc: ["body", "email"], msg: "Field required", type: "missing" },
      { loc: ["body", "password"], msg: "Field required", type: "missing" },
    ]);
    vi.spyOn(authEndpoints, "login").mockRejectedValue(error422);
    renderLogin();

    const emailInput = screen.getByLabelText(/^email or phone/i, { selector: "input" });
    const passwordInput = screen.getByLabelText(/^password/i, { selector: "input" });
    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "Secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(emailInput.getAttribute("aria-invalid")).toBe("true");
      expect(passwordInput.getAttribute("aria-invalid")).toBe("true");
    });
    expect(document.getElementById("login-error")?.textContent).toContain("Required field");
    expect(document.getElementById("password-error")?.textContent).toContain("Required field");
  });

  it("handles 422 unknown field validation response with localized form-level alert", async () => {
    const user = userEvent.setup();
    const technicalUnknownMessage = "Tenant uuid 991823-bad not in active cluster";
    const error422 = new AuthApiError(422, [
      { loc: ["body", "tenant_id"], msg: technicalUnknownMessage, type: "value_error" },
    ]);
    vi.spyOn(authEndpoints, "login").mockRejectedValue(error422);
    renderLogin();

    await user.type(screen.getByLabelText(/^email or phone/i, { selector: "input" }), "user@example.com");
    await user.type(screen.getByLabelText(/^password/i, { selector: "input" }), "Secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Something went wrong. Please try again");
    expect(document.body.textContent).not.toContain(technicalUnknownMessage);
  });

  it("shows the title without a subtitle that repeats it", () => {
    renderLogin();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.queryByText("Enter your email and password to access your account")).toBeNull();
  });
});
