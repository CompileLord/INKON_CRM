import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { ForgotPassword } from "./ForgotPassword";
import * as authEndpoints from "../lib/auth/endpoints";
import { AuthApiError } from "../lib/auth/errors";
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

function renderForgot() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/login" element={<div>Login Landing</div>} />
          <Route path="/set-password" element={<div>Set Password Landing</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

const neutral = { message: "If the account exists, a reset message has been sent." } as const;
const mockAccessToken: string = `mock.${btoa(JSON.stringify({ sub: "9", role: "student", must_set_password: true, exp: Math.floor(Date.now() / 1000) + 3600 }))}.sig`;
const pair: TokenPair = { access_token: mockAccessToken, refresh_token: "r", token_type: "bearer", must_set_password: true };

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useAuthStore.getState().setUnauthenticated();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.getState().setUnauthenticated();
});

describe("ForgotPassword default path", () => {
  it("sends only the identifier and keeps the email code entry reachable without naming the account", async () => {
    const request = vi.spyOn(authEndpoints, "passwordResetRequest").mockResolvedValue(neutral);
    renderForgot();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email or phone/i), "kid@example.com");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("If you received a code by email, enter it here.")).toBeDefined();
    expect(request).toHaveBeenCalledWith("kid@example.com", undefined);
    expect((screen.getByLabelText(/^Email\b/) as HTMLInputElement).value).toBe("kid@example.com");
    expect(screen.getByLabelText(/^Code from the email/)).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe("/login");
  });

  it("verifies the code, sets the new password and authenticates", async () => {
    vi.spyOn(authEndpoints, "passwordResetRequest").mockResolvedValue(neutral);
    const verify = vi.spyOn(authEndpoints, "passwordResetVerify").mockResolvedValue({ reset_token: "grant-1" });
    const confirm = vi.spyOn(authEndpoints, "passwordResetConfirm").mockResolvedValue(pair);
    renderForgot();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email or phone/i), "kid@example.com");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(await screen.findByLabelText(/^Code from the email/), "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(verify).toHaveBeenCalledWith("kid@example.com", "123456"));
    await user.type(await screen.findByLabelText(/^New Password/), "Newpass123");
    await user.type(screen.getByLabelText(/^Confirm Password/), "Newpass123");
    await user.click(screen.getByRole("button", { name: "Save and sign in" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("grant-1", "Newpass123"));
    expect(await screen.findByText("Set Password Landing")).toBeDefined();
  });

  it("shows a translated error for an invalid code", async () => {
    vi.spyOn(authEndpoints, "passwordResetRequest").mockResolvedValue(neutral);
    vi.spyOn(authEndpoints, "passwordResetVerify").mockRejectedValue(new AuthApiError(400, "Invalid reset code"));
    renderForgot();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email or phone/i), "kid@example.com");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(await screen.findByLabelText(/^Code from the email/), "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toContain("The code is invalid or expired. Request a new one.");
  });

  it("rejects an identifier that is neither an email nor a phone before calling the API", async () => {
    const request = vi.spyOn(authEndpoints, "passwordResetRequest").mockResolvedValue(neutral);
    renderForgot();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email or phone/i), "nonsense");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Enter a valid email or phone number")).toBeDefined();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("ForgotPassword without access to email", () => {
  it("submits the chosen SMS channel and ends on the neutral SMS confirmation", async () => {
    const request = vi.spyOn(authEndpoints, "passwordResetRequest").mockResolvedValue(neutral);
    renderForgot();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email or phone/i), "+992900000001");
    await user.click(screen.getByRole("button", { name: "I don't have access to my email" }));
    await user.click(screen.getByRole("radio", { name: "My parent's phone" }));
    await user.click(screen.getByRole("button", { name: "Send SMS" }));
    expect(await screen.findByText("If the account exists, a new password was sent by SMS. Sign in with it.")).toBeDefined();
    expect(request).toHaveBeenCalledWith("+992900000001", "parent_phone");
    expect(screen.queryByLabelText(/^Code from the email/)).toBeNull();
  });

  it("defaults to the student's own phone", async () => {
    const request = vi.spyOn(authEndpoints, "passwordResetRequest").mockResolvedValue(neutral);
    renderForgot();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email or phone/i), "kid@example.com");
    await user.click(screen.getByRole("button", { name: "I don't have access to my email" }));
    expect((screen.getByRole("radio", { name: "My phone" }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Send SMS" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("kid@example.com", "student_phone"));
  });

  it("returns to the default path keeping the typed identifier", async () => {
    renderForgot();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email or phone/i), "kid@example.com");
    await user.click(screen.getByRole("button", { name: "I don't have access to my email" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByLabelText(/^email or phone/i) as HTMLInputElement).value).toBe("kid@example.com");
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("shows a translated rate-limit error instead of the neutral message", async () => {
    vi.spyOn(authEndpoints, "passwordResetRequest").mockRejectedValue(new AuthApiError(429, "Too many"));
    renderForgot();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^email or phone/i), "kid@example.com");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Too many attempts");
  });
});

describe("ForgotPassword copy", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });
  afterEach(() => cleanup());

  it("explains only the email path in the description and leaves the SMS path to the no-access link", () => {
    renderForgot();
    expect(screen.getByText("Enter your email or phone. We will send a code to your email.")).toBeTruthy();
    expect(screen.queryByText(/by SMS/i)).toBeNull();
    expect(screen.getByRole("button", { name: "I don't have access to my email" })).toBeTruthy();
  });

  it("uses the same animated emblem composition as the login page", () => {
    renderForgot();
    expect(document.querySelector("aside")).not.toBeNull();
    expect(document.querySelector("aside [data-testid=\"brand-animated-logo\"]")).not.toBeNull();
  });
});
