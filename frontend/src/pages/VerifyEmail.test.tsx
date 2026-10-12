import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { VerifyEmail } from "./VerifyEmail";
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

function renderVerifyEmail(initialEntry = "/verify-email") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/login" element={<div data-testid="login-landing">Login Landing</div>} />
          <Route path="/set-password" element={<div data-testid="set-password-landing">Set Password Landing</div>} />
          <Route path="/" element={<div data-testid="dashboard-landing">Dashboard Landing</div>} />
          <Route path="/students/:id" element={<div data-testid="student-landing">Student Landing</div>} />
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

describe("VerifyEmail page integration", () => {
  it("renders with AuthFrame composition, localized heading, 16/24 explanation, 6-digit code input and semantic link", () => {
    renderVerifyEmail();

    expect(screen.getByRole("heading", { level: 1, name: /email verification/i })).not.toBeNull();
    const subtitle = screen.getByText(/enter your email and the code from the email to activate your account/i);
    expect(subtitle).not.toBeNull();
    expect(subtitle.className).toContain("text-base");
    expect(subtitle.className).toContain("leading-6");

    expect(screen.getByText(/activate your account\./i)).not.toBeNull();
    expect(screen.getByText(/confirm your email to complete registration and start learning\./i)).not.toBeNull();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" });
    expect(emailInput.getAttribute("type")).toBe("email");
    expect(emailInput.getAttribute("autocomplete")).toBe("username");

    const codeInput = screen.getByLabelText(/code from the email/i, { selector: "input" });
    expect(codeInput.getAttribute("type")).toBe("text");
    expect(codeInput.getAttribute("inputmode")).toBe("numeric");
    expect(codeInput.getAttribute("autocomplete")).toBe("one-time-code");
    expect(codeInput.getAttribute("maxlength")).toBe("6");

    const submitBtn = screen.getByRole("button", { name: /confirm/i });
    expect(submitBtn.getAttribute("type")).toBe("submit");

    const resendBtn = screen.getByRole("button", { name: /resend code/i });
    expect(resendBtn.getAttribute("type")).toBe("button");

    const backLink = screen.getByRole("link", { name: /back to sign in/i });
    expect(backLink.getAttribute("href")).toBe("/login");
    expect(backLink.className).toContain("min-h-[44px]");
    expect(backLink.className).toContain("text-maroon");
  });

  it("validates empty, invalid email, non-digit, and partial code with accessible error association", async () => {
    const user = userEvent.setup();
    renderVerifyEmail();

    const submitBtn = screen.getByRole("button", { name: /confirm/i });
    await user.click(submitBtn);

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" });
    const codeInput = screen.getByLabelText(/code from the email/i, { selector: "input" });

    await waitFor(() => {
      expect(emailInput.getAttribute("aria-invalid")).toBe("true");
      expect(codeInput.getAttribute("aria-invalid")).toBe("true");
    });

    expect(emailInput.getAttribute("aria-describedby")).toBe("email-error");
    expect(codeInput.getAttribute("aria-describedby")).toBe("code-error");
    expect(document.getElementById("email-error")?.textContent).toContain("Required field");
    expect(document.getElementById("code-error")?.textContent).toContain("Required field");

    await user.type(emailInput, "invalid-email");
    await user.type(codeInput, "12345a");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(document.getElementById("email-error")?.textContent).toContain("Invalid email address");
      expect(document.getElementById("code-error")?.textContent).toContain("Invalid code");
    });

    await user.clear(codeInput);
    await user.type(codeInput, "12345");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(document.getElementById("code-error")?.textContent).toContain("Invalid code");
    });
  });

  it("accepts full 6-digit paste without validation errors", async () => {
    const user = userEvent.setup();
    renderVerifyEmail();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" });
    const codeInput = screen.getByLabelText(/code from the email/i, { selector: "input" });

    await user.type(emailInput, "operator@example.com");
    await user.click(codeInput);
    await user.paste("654321");

    expect((codeInput as HTMLInputElement).value).toBe("654321");

    const submitBtn = screen.getByRole("button", { name: /confirm/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(codeInput.getAttribute("aria-invalid")).toBeNull();
    });
  });

  it("validates email prior to resend and requires valid format", async () => {
    const user = userEvent.setup();
    const resendSpy = vi.spyOn(authEndpoints, "resendCode");
    renderVerifyEmail();

    const resendBtn = screen.getByRole("button", { name: /resend code/i });
    await user.click(resendBtn);

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" });
    await waitFor(() => {
      expect(emailInput.getAttribute("aria-invalid")).toBe("true");
      expect(document.getElementById("email-error")?.textContent).toContain("Required field");
    });
    expect(resendSpy).not.toHaveBeenCalled();

    await user.type(emailInput, "bad-format");
    await user.click(resendBtn);

    await waitFor(() => {
      expect(document.getElementById("email-error")?.textContent).toContain("Invalid email address");
    });
    expect(resendSpy).not.toHaveBeenCalled();
  });

  it("handles resend success with localized status, local cooldown, and email ownership isolation", async () => {
    const user = userEvent.setup();
    const resendSpy = vi.spyOn(authEndpoints, "resendCode").mockResolvedValue(undefined);
    renderVerifyEmail();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" });
    await user.type(emailInput, "operator@example.com");

    const resendBtn = screen.getByRole("button", { name: /resend code/i });
    await user.click(resendBtn);

    expect(resendSpy).toHaveBeenCalledWith("operator@example.com");

    const statusMsg = await screen.findByRole("status");
    expect(statusMsg.textContent).toContain("A new verification code has been sent to your email");

    await waitFor(() => {
      expect(resendBtn.textContent).toMatch(/resend code \(60s\)/i);
      expect((resendBtn as HTMLButtonElement).disabled).toBe(true);
    });

    await user.clear(emailInput);
    await user.type(emailInput, "other@example.com");

    await waitFor(() => {
      expect((resendBtn as HTMLButtonElement).disabled).toBe(false);
      expect(resendBtn.textContent).toMatch(/resend code/i);
    });

    await user.clear(emailInput);
    await user.type(emailInput, "operator@example.com");

    await waitFor(() => {
      expect((resendBtn as HTMLButtonElement).disabled).toBe(true);
      expect(resendBtn.textContent).toMatch(/resend code \(\d+s\)/i);
    });
  });

  it("handles resend failure without initiating cooldown or claiming success", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "resendCode").mockRejectedValue(new AuthApiError(404, "User not found"));
    renderVerifyEmail();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" });
    await user.type(emailInput, "unknown@example.com");

    const resendBtn = screen.getByRole("button", { name: /resend code/i });
    await user.click(resendBtn);

    await waitFor(() => {
      expect(document.getElementById("email-error")?.textContent).toContain("User with this email was not found");
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect((resendBtn as HTMLButtonElement).disabled).toBe(false);
    expect(resendBtn.textContent).toMatch(/resend code/i);
  });

  it("handles expired code 400 rejection and preserves input values across language switches", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "verifyCode").mockRejectedValue(
      new AuthApiError(400, "Verification code expired or not requested"),
    );
    renderVerifyEmail();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" }) as HTMLInputElement;
    const codeInput = screen.getByLabelText(/code from the email/i, { selector: "input" }) as HTMLInputElement;

    await user.type(emailInput, "operator@example.com");
    await user.type(codeInput, "111111");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Verification code has expired. Please request a new one");
    expect(emailInput.value).toBe("operator@example.com");
    expect(codeInput.value).toBe("111111");

    await i18n.changeLanguage("ru");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Срок действия кода истёк. Запросите новый код");
    });
    expect(emailInput.value).toBe("operator@example.com");
    expect(codeInput.value).toBe("111111");

    await i18n.changeLanguage("tg");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Мӯҳлати коди тасдиқ гузашт. Лутфан коди навро дархост кунед");
    });
    expect(emailInput.value).toBe("operator@example.com");
    expect(codeInput.value).toBe("111111");
  });

  it("handles 5 attempts invalidated 400 rejection and re-translates error dynamically", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "verifyCode").mockRejectedValue(
      new AuthApiError(400, "Too many incorrect attempts. Code invalidated."),
    );
    renderVerifyEmail();

    await user.type(screen.getByLabelText(/^email/i, { selector: "input" }), "operator@example.com");
    await user.type(screen.getByLabelText(/code from the email/i, { selector: "input" }), "222222");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many incorrect attempts. Code invalidated. Please request a new code");

    await i18n.changeLanguage("ru");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Слишком много неверных попыток. Код аннулирован. Запросите новый");
    });
  });

  it("handles invalid verification code 400 rejection and binds error to code field", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "verifyCode").mockRejectedValue(
      new AuthApiError(400, "Invalid verification code"),
    );
    renderVerifyEmail();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" }) as HTMLInputElement;
    const codeInput = screen.getByLabelText(/code from the email/i, { selector: "input" }) as HTMLInputElement;

    await user.type(emailInput, "operator@example.com");
    await user.type(codeInput, "333333");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(codeInput.getAttribute("aria-invalid")).toBe("true");
      expect(document.getElementById("code-error")?.textContent).toContain("Invalid code");
    });
    expect(emailInput.value).toBe("operator@example.com");
    expect(codeInput.value).toBe("333333");

    await i18n.changeLanguage("ru");
    await waitFor(() => {
      expect(document.getElementById("code-error")?.textContent).toContain("Неверный код");
    });
    expect(emailInput.value).toBe("operator@example.com");
    expect(codeInput.value).toBe("333333");
  });

  it("handles 404 user not found rejection and binds error to email field", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "verifyCode").mockRejectedValue(
      new AuthApiError(404, "User not found"),
    );
    renderVerifyEmail();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" });
    const codeInput = screen.getByLabelText(/code from the email/i, { selector: "input" });

    await user.type(emailInput, "missing@example.com");
    await user.type(codeInput, "444444");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(emailInput.getAttribute("aria-invalid")).toBe("true");
      expect(document.getElementById("email-error")?.textContent).toContain("User with this email was not found");
    });
  });

  it("handles 429 rate limit rejection with localized form alert", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "verifyCode").mockRejectedValue(
      new AuthApiError(429, "Too many attempts. Please try again later."),
    );
    renderVerifyEmail();

    await user.type(screen.getByLabelText(/^email/i, { selector: "input" }), "operator@example.com");
    await user.type(screen.getByLabelText(/code from the email/i, { selector: "input" }), "555555");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many attempts. Please try again later");
  });

  it("handles network failure and displays localized offline error with entered values preserved", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "verifyCode").mockRejectedValue(new NetworkError());
    renderVerifyEmail();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" }) as HTMLInputElement;
    const codeInput = screen.getByLabelText(/code from the email/i, { selector: "input" }) as HTMLInputElement;

    await user.type(emailInput, "offline@example.com");
    await user.type(codeInput, "777777");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not connect to server. Check your internet connection");
    expect(emailInput.value).toBe("offline@example.com");
    expect(codeInput.value).toBe("777777");
  });

  it("prevents duplicate submissions on simultaneous synchronous form submit events before React commits pending state, and allows retry on failure", async () => {
    const user = userEvent.setup();
    let rejectVerify: (reason: unknown) => void = () => {};

    const pendingPromise = new Promise<TokenPair>((_, reject) => {
      rejectVerify = reject;
    });

    const verifySpy = vi.spyOn(authEndpoints, "verifyCode").mockImplementationOnce(() => pendingPromise);

    renderVerifyEmail();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" }) as HTMLInputElement;
    const codeInput = screen.getByLabelText(/code from the email/i, { selector: "input" }) as HTMLInputElement;
    await user.type(emailInput, "operator@example.com");
    await user.type(codeInput, "123456");

    const submitBtn = screen.getByRole("button", { name: /confirm/i }) as HTMLButtonElement;
    const form = submitBtn.closest("form")!;

    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalledTimes(1);
    });
    expect(submitBtn.getAttribute("aria-busy")).toBe("true");

    rejectVerify(new AuthApiError(400, "Invalid verification code"));

    await waitFor(() => {
      expect(document.getElementById("code-error")).not.toBeNull();
    });
    expect(emailInput.value).toBe("operator@example.com");
    expect(codeInput.value).toBe("123456");
    expect(submitBtn.disabled).toBe(false);

    const retryPromise = Promise.resolve({
      access_token: createMockToken("student", 10, true),
      refresh_token: null,
      token_type: "bearer",
      must_set_password: true,
    });
    verifySpy.mockImplementationOnce(() => retryPromise);

    await user.click(submitBtn);
    expect(verifySpy).toHaveBeenCalledTimes(2);

    await waitFor(() => {
      expect(screen.getByTestId("set-password-landing")).not.toBeNull();
    });
  });

  it("prevents duplicate resend requests on simultaneous synchronous clicks before React commits pending state", async () => {
    const user = userEvent.setup();
    let resolveResend: () => void = () => {};

    const pendingPromise = new Promise<void>((resolve) => {
      resolveResend = resolve;
    });

    const resendSpy = vi.spyOn(authEndpoints, "resendCode").mockImplementationOnce(() => pendingPromise);

    renderVerifyEmail();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" });
    await user.type(emailInput, "operator@example.com");

    const resendBtn = screen.getByRole("button", { name: /resend code/i }) as HTMLButtonElement;

    act(() => {
      fireEvent.click(resendBtn);
      fireEvent.click(resendBtn);
    });

    await waitFor(() => {
      expect(resendSpy).toHaveBeenCalledTimes(1);
    });

    resolveResend();

    await waitFor(() => {
      expect(screen.getByRole("status")).not.toBeNull();
    });
  });

  it("blocks resend while verify submission is in-flight", async () => {
    const user = userEvent.setup();
    let resolveVerify: (token: TokenPair) => void = () => {};

    const pendingPromise = new Promise<TokenPair>((resolve) => {
      resolveVerify = resolve;
    });

    const verifySpy = vi.spyOn(authEndpoints, "verifyCode").mockImplementationOnce(() => pendingPromise);
    const resendSpy = vi.spyOn(authEndpoints, "resendCode");

    renderVerifyEmail();

    await user.type(screen.getByLabelText(/^email/i, { selector: "input" }), "operator@example.com");
    await user.type(screen.getByLabelText(/code from the email/i, { selector: "input" }), "123456");

    const submitBtn = screen.getByRole("button", { name: /confirm/i });
    const resendBtn = screen.getByRole("button", { name: /resend code/i });

    await user.click(submitBtn);

    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalledTimes(1);
    });

    await user.click(resendBtn);
    expect(resendSpy).not.toHaveBeenCalled();

    resolveVerify({
      access_token: createMockToken("student", 10, true),
      refresh_token: null,
      token_type: "bearer",
      must_set_password: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("set-password-landing")).not.toBeNull();
    });
  });

  it("prevents duplicate submissions on native keyboard Enter while pending", async () => {
    const user = userEvent.setup();
    let resolveVerify: (value: TokenPair) => void = () => {};

    const pendingPromise = new Promise<TokenPair>((resolve) => {
      resolveVerify = resolve;
    });

    const verifySpy = vi.spyOn(authEndpoints, "verifyCode").mockImplementationOnce(() => pendingPromise);

    renderVerifyEmail();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" });
    const codeInput = screen.getByLabelText(/code from the email/i, { selector: "input" });
    await user.type(emailInput, "operator@example.com");
    await user.type(codeInput, "123456");

    const submitBtn = screen.getByRole("button", { name: /confirm/i }) as HTMLButtonElement;

    await user.keyboard("{Enter}");
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(submitBtn.getAttribute("aria-busy")).toBe("true");
    expect(submitBtn.disabled).toBe(true);

    await user.keyboard("{Enter}");
    expect(verifySpy).toHaveBeenCalledTimes(1);

    resolveVerify({
      access_token: createMockToken("student", 10, true),
      refresh_token: null,
      token_type: "bearer",
      must_set_password: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("set-password-landing")).not.toBeNull();
    });
  });

  it("authenticates forced-password session without refresh token and redirects to /set-password", async () => {
    const user = userEvent.setup();
    const token = createMockToken("student", 15, true);
    vi.spyOn(authEndpoints, "verifyCode").mockResolvedValue({
      access_token: token,
      refresh_token: null,
      token_type: "bearer",
      must_set_password: true,
    });

    renderVerifyEmail();

    await user.type(screen.getByLabelText(/^email/i, { selector: "input" }), "invited@example.com");
    await user.type(screen.getByLabelText(/code from the email/i, { selector: "input" }), "123456");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByTestId("set-password-landing")).not.toBeNull();
    });

    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.userId).toBe(15);
    expect(state.role).toBe("student");
    expect(state.mustSetPassword).toBe(true);
  });

  it("authenticates non-forced session and redirects to canonical role landing", async () => {
    const user = userEvent.setup();
    const token = createMockToken("student", 25, false);
    vi.spyOn(authEndpoints, "verifyCode").mockResolvedValue({
      access_token: token,
      refresh_token: "ref-tok",
      token_type: "bearer",
      must_set_password: false,
    });

    renderVerifyEmail();

    await user.type(screen.getByLabelText(/^email/i, { selector: "input" }), "active.student@example.com");
    await user.type(screen.getByLabelText(/code from the email/i, { selector: "input" }), "123456");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByTestId("student-landing")).not.toBeNull();
    });

    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.userId).toBe(25);
    expect(state.role).toBe("student");
    expect(state.mustSetPassword).toBe(false);
  });

  it("navigates back to login via semantic link", async () => {
    const user = userEvent.setup();
    renderVerifyEmail();

    const backLink = screen.getByRole("link", { name: /back to sign in/i });
    await user.click(backLink);

    await waitFor(() => {
      expect(screen.getByTestId("login-landing")).not.toBeNull();
    });
  });

  it("retranslates manual resend email validation errors on language switch without validating code", async () => {
    const user = userEvent.setup();
    renderVerifyEmail();

    const resendBtn = screen.getByRole("button", { name: /resend code/i });
    await user.click(resendBtn);

    expect(await screen.findByText("Required field")).not.toBeNull();
    expect(screen.queryByText(/enter a 6-digit verification code/i)).toBeNull();

    act(() => {
      i18n.changeLanguage("ru");
    });
    expect(await screen.findByText("Обязательное поле")).not.toBeNull();
    expect(screen.queryByText(/неверный код/i)).toBeNull();

    act(() => {
      i18n.changeLanguage("tg");
    });
    expect(await screen.findByText("Майдони ҳатмӣ")).not.toBeNull();
    expect(screen.queryByText(/рамзи нодуруст/i)).toBeNull();
  });

  it("clears obsolete email errors on resend and hides success message when email changes away from requested address", async () => {
    const user = userEvent.setup();
    vi.spyOn(authEndpoints, "verifyCode").mockRejectedValue(
      new AuthApiError(404, "User not found"),
    );
    const resendSpy = vi.spyOn(authEndpoints, "resendCode").mockResolvedValue(undefined);

    renderVerifyEmail();

    const emailInput = screen.getByLabelText(/^email/i, { selector: "input" });
    const codeInput = screen.getByLabelText(/code from the email/i, { selector: "input" });
    await user.type(emailInput, "old@example.com");
    await user.type(codeInput, "123456");

    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(await screen.findByText("User with this email was not found")).not.toBeNull();

    await user.clear(emailInput);
    await user.type(emailInput, "valid@example.com");
    expect(screen.queryByText("User with this email was not found")).toBeNull();

    const resendBtn = screen.getByRole("button", { name: /resend code/i });
    await user.click(resendBtn);
    expect(resendSpy).toHaveBeenCalledWith("valid@example.com");

    const statusMsg = await screen.findByRole("status");
    expect(statusMsg.textContent).toBe("A new verification code has been sent to your email");

    await user.type(emailInput, "different@example.com");
    expect(screen.queryByRole("status")).toBeNull();

    await user.clear(emailInput);
    await user.type(emailInput, "valid@example.com");
    expect(await screen.findByRole("status")).not.toBeNull();
  });
});
