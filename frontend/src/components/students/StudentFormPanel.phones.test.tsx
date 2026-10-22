import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { StudentFormPanel } from "./StudentFormPanel";
import * as userHooks from "../../lib/users/hooks";
import type { User } from "../../lib/users/types";

beforeEach(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => "blob:mock-url";
  } else {
    vi.spyOn(globalThis.URL, "createObjectURL").mockReturnValue("blob:mock-url");
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = () => {};
  } else {
    vi.spyOn(globalThis.URL, "revokeObjectURL").mockReturnValue(undefined);
  }
});

afterEach(cleanup);

const existingStudent: User = {
  id: 42,
  email: "existing@example.com",
  first_name: "Aziz",
  last_name: "Rakhimov",
  role: "student",
  phone: "+992901234567",
  parent_phone: "+992901234568",
  date_of_birth: "2005-04-12",
  payment_day_of_month: 15,
  parent_linked: true,
  is_deleted: false,
  must_set_password: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  photo_path: "/uploads/photo.jpg",
  thumbnail_path: "/uploads/thumb.jpg",
};

function renderPanel(props: Partial<Parameters<typeof StudentFormPanel>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const defaultProps = {
    open: true,
    student: undefined,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    onAvatarSaved: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <StudentFormPanel {...defaultProps} />
        </I18nextProvider>
      </QueryClientProvider>,
    ),
    props: defaultProps,
  };
}

describe("StudentFormPanel phones", () => {
  it("blocks creating a student without a student or parent phone and shows the translated message", async () => {
    const createSpy = vi.fn();
    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: createSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);
    renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/First Name/i), "Rustam");
    await user.type(screen.getByLabelText(/Last Name/i), "Karimov");
    await user.type(screen.getByLabelText(/Email/i), "rustam@example.com");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Enter a student or parent phone.")).toBeDefined();
    expect(createSpy).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("student-phone");
  });

  it("creates a student with only a parent phone", async () => {
    const createSpy = vi.fn().mockResolvedValue({ ...existingStudent, id: 77, password_sms_destination: "parent_phone" });
    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: createSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);
    const { props } = renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/First Name/i), "Rustam");
    await user.type(screen.getByLabelText(/Last Name/i), "Karimov");
    await user.type(screen.getByLabelText(/Email/i), "rustam@example.com");
    await user.type(screen.getByLabelText(/^Parent phone/i), "+992901112233");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy.mock.calls[0][0]).toMatchObject({ phone: null, parent_phone: "+992901112233" });
    expect(props.onSaved).toHaveBeenCalledWith("created", expect.objectContaining({ id: 77, password_sms_destination: "parent_phone" }));
  });

  it("rejects a phone without the leading plus", async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/First Name/i), "Rustam");
    await user.type(screen.getByLabelText(/Last Name/i), "Karimov");
    await user.type(screen.getByLabelText(/Email/i), "rustam@example.com");
    await user.type(screen.getByLabelText(/^Phone/i), "992901112233");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Use the international format, e.g. +992901234567")).toBeDefined();
  });
});
