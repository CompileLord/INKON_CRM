import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { StudentFormPanel } from "./StudentFormPanel";
import * as userHooks from "../../lib/users/hooks";
import { AuthApiError } from "../../lib/auth/errors";

beforeEach(async () => {
  globalThis.URL.createObjectURL = () => "blob:mock-url";
  globalThis.URL.revokeObjectURL = () => undefined;
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function submitWith(code: "phone_taken" | "email_taken"): Promise<void> {
  vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
    mutateAsync: vi.fn().mockRejectedValue(new AuthApiError(409, { code })),
    isPending: false,
  } as unknown as ReturnType<typeof userHooks.useCreateUser>);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <I18nextProvider i18n={i18n}>
        <StudentFormPanel open student={undefined} onClose={vi.fn()} onSaved={vi.fn()} onAvatarSaved={vi.fn()} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/First Name/i), "Test");
  await user.type(screen.getByLabelText(/Last Name/i), "User");
  await user.type(screen.getByLabelText(/Email/i), "dup@example.com");
  await user.type(screen.getByLabelText(/^Phone/i), "+992901234567");
  await user.click(screen.getByRole("button", { name: "Create" }));
}

describe("StudentFormPanel duplicate contact codes", () => {
  it("shows a translated error under the phone field for phone_taken", async () => {
    await submitWith("phone_taken");
    await waitFor(() => expect(screen.getByText("This phone number is already in use")).toBeDefined());
    expect(document.activeElement?.id).toBe("student-phone");
  });

  it("shows a translated error under the email field for email_taken", async () => {
    await submitWith("email_taken");
    await waitFor(() => expect(screen.getByText("This email is already in use")).toBeDefined());
    expect(document.activeElement?.id).toBe("student-email");
  });
});
