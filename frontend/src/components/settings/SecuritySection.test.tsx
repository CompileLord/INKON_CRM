import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { SecuritySection } from "./SecuritySection";
import * as authEndpoints from "../../lib/auth/endpoints";
import { AuthApiError, NetworkError } from "../../lib/auth/errors";
import { tokenStorage } from "../../lib/auth/tokenStorage";
import { useAuthStore } from "../../store/authStore";

function mockToken(role: string, id: number): string {
  const payload = { sub: String(id), role, must_set_password: false, exp: Math.floor(Date.now() / 1000) + 3600 };
  return `mock.${btoa(JSON.stringify(payload))}.sig`;
}

async function fillAndSubmit(current: string, next: string, confirm: string = next): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Current password"), current);
  await user.type(screen.getByLabelText("New password"), next);
  await user.type(screen.getByLabelText("Repeat new password"), confirm);
  await user.click(screen.getByRole("button", { name: "Change password" }));
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  tokenStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SecuritySection", () => {
  it("changes the password, stores the returned tokens and keeps the session", async () => {
    const onChanged = vi.fn();
    const newAccess: string = mockToken("student", 9);
    const spy = vi.spyOn(authEndpoints, "changePassword").mockResolvedValue({ access_token: newAccess, refresh_token: "new-refresh", token_type: "bearer", must_set_password: false });
    render(<SecuritySection onChanged={onChanged} />);
    await fillAndSubmit("OldPass123", "NewPass123");
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith("OldPass123", "NewPass123");
    expect(tokenStorage.getAccessToken()).toBe(newAccess);
    expect(tokenStorage.getRefreshToken()).toBe("new-refresh");
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe("");
  });

  it("uppercases a lowercase SMS code typed as the current password", async () => {
    const spy = vi.spyOn(authEndpoints, "changePassword").mockResolvedValue({ access_token: mockToken("student", 9), refresh_token: null, token_type: "bearer", must_set_password: false });
    render(<SecuritySection onChanged={vi.fn()} />);
    await fillAndSubmit("12345a", "NewPass123");
    await waitFor(() => expect(spy).toHaveBeenCalledWith("12345A", "NewPass123"));
  });

  it("does not alter a longer current password", async () => {
    const spy = vi.spyOn(authEndpoints, "changePassword").mockResolvedValue({ access_token: mockToken("mentor", 3), refresh_token: null, token_type: "bearer", must_set_password: false });
    render(<SecuritySection onChanged={vi.fn()} />);
    await fillAndSubmit("secret1x", "NewPass123");
    await waitFor(() => expect(spy).toHaveBeenCalledWith("secret1x", "NewPass123"));
  });

  it("blocks mismatched confirmation without calling the API", async () => {
    const spy = vi.spyOn(authEndpoints, "changePassword");
    render(<SecuritySection onChanged={vi.fn()} />);
    await fillAndSubmit("OldPass123", "NewPass123", "Different123");
    expect(await screen.findByText("Passwords do not match")).toBeDefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("shows a field error on the current password for 401", async () => {
    vi.spyOn(authEndpoints, "changePassword").mockRejectedValue(new AuthApiError(401, "Invalid current password"));
    const onChanged = vi.fn();
    render(<SecuritySection onChanged={onChanged} />);
    await fillAndSubmit("WrongPass1", "NewPass123");
    expect(await screen.findByText("The current password is incorrect.")).toBeDefined();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("shows the current password field error for a 400 invalid_current_password and never logs out", async () => {
    vi.spyOn(authEndpoints, "changePassword").mockRejectedValue(new AuthApiError(400, "invalid_current_password"));
    useAuthStore.getState().setAuthenticated(mockToken("student", 9), "kept-refresh", false);
    render(<SecuritySection onChanged={vi.fn()} />);
    await fillAndSubmit("WrongPass1", "NewPass123");
    expect(await screen.findByText("The current password is incorrect.")).toBeDefined();
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(tokenStorage.getRefreshToken()).toBe("kept-refresh");
  });

  it("shows the password policy on the new password for 400", async () => {
    vi.spyOn(authEndpoints, "changePassword").mockRejectedValue(new AuthApiError(400, "Password must be at least 8 characters, contain a digit, not be all digits and not be a common password."));
    render(<SecuritySection onChanged={vi.fn()} />);
    await fillAndSubmit("OldPass123", "NewPass123");
    expect(await screen.findByText("Password must be at least 8 characters, contain a digit, not be all digits and not be a common password.")).toBeDefined();
  });

  it("shows the minimum length message for a 422 on the new password", async () => {
    vi.spyOn(authEndpoints, "changePassword").mockRejectedValue(new AuthApiError(422, [{ loc: ["body", "new_password"], msg: "short", type: "string_too_short" }]));
    render(<SecuritySection onChanged={vi.fn()} />);
    await fillAndSubmit("OldPass123", "NewPass123");
    expect(await screen.findByText("Password must be at least 8 characters long")).toBeDefined();
  });

  it("shows a form level alert for 429 and for network failure", async () => {
    const spy = vi.spyOn(authEndpoints, "changePassword").mockRejectedValueOnce(new AuthApiError(429, "Too many"));
    render(<SecuritySection onChanged={vi.fn()} />);
    await fillAndSubmit("OldPass123", "NewPass123");
    expect((await screen.findByRole("alert")).textContent).toBe("Too many attempts. Please try again later");
    spy.mockRejectedValueOnce(new NetworkError());
    await userEvent.setup().click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Could not connect to server. Check your internet connection"));
  });
});

describe("SecuritySection role wording", () => {
  it("shows the SMS-code hint only to students", () => {
    useAuthStore.setState({ role: "student" });
    const { unmount } = render(<SecuritySection onChanged={vi.fn()} />);
    expect(screen.getByText("Students can enter the code from the SMS.")).toBeTruthy();
    unmount();
    for (const role of ["mentor", "superadmin", "accountant"] as const) {
      useAuthStore.setState({ role });
      const view = render(<SecuritySection onChanged={vi.fn()} />);
      expect(screen.queryByText("Students can enter the code from the SMS.")).toBeNull();
      view.unmount();
    }
  });
});
