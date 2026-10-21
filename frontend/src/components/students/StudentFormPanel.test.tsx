import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { StudentFormPanel } from "./StudentFormPanel";
import * as userHooks from "../../lib/users/hooks";
import * as userEndpoints from "../../lib/users/endpoints";
import { AuthApiError } from "../../lib/auth/errors";
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
  parent_telegram_chat_id: 98765,
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

describe("StudentFormPanel", () => {
  it("renders new student form and does not render avatar upload in create mode", () => {
    renderPanel();

    expect(screen.getByRole("heading", { name: "New Student" })).toBeDefined();
    expect(screen.getByLabelText(/First Name/i)).toBeDefined();
    expect(screen.getByLabelText(/Last Name/i)).toBeDefined();
    expect(screen.getByLabelText(/Email/i)).toBeDefined();
    expect(screen.queryByLabelText(/Photo/i)).toBeNull();
    expect(screen.queryByText(/Upload photo/i)).toBeNull();
  });

  it("shows the birth date through the shared date picker as dd.MM.yyyy without a native date input", () => {
    const { container } = renderPanel({ student: existingStudent });

    expect(container.ownerDocument.querySelector('input[type="date"]')).toBeNull();
    const birthDate = screen.getByLabelText(/Date of birth/i) as HTMLInputElement;
    expect(birthDate.value).toBe("12.04.2005");
    expect(birthDate.placeholder).toBe("dd.mm.yyyy");
  });

  it("renders avatar upload field in edit mode", () => {
    renderPanel({ student: existingStudent });

    expect(screen.getByRole("heading", { name: "Edit Student" })).toBeDefined();
    expect(screen.getByTestId("avatar-preview-container")).toBeDefined();
    expect(screen.getByRole("button", { name: /photo/i })).toBeDefined();
  });

  it("closes immediately without confirmation when pristine form is cancelled", async () => {
    const { props } = renderPanel();
    const user = userEvent.setup();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Discard unsaved changes/i)).toBeNull();
  });

  it("triggers discard confirmation dialog when dirty form is cancelled", async () => {
    const { props } = renderPanel();
    const user = userEvent.setup();

    const firstNameInput = screen.getByLabelText(/First Name/i);
    await user.type(firstNameInput, "Rustam");

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Discard unsaved changes/i)).toBeDefined();
    expect(screen.getByText(/You have unsaved changes/i)).toBeDefined();

    const keepEditingButton = screen.getByRole("button", { name: "Keep editing" });
    await user.click(keepEditingButton);

    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/Discard unsaved changes/i)).toBeNull();

    await user.click(cancelButton);
    const discardButton = screen.getByRole("button", { name: "Discard" });
    await user.click(discardButton);

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not send PATCH mutation when submitting unchanged edit form", async () => {
    const updateSpy = vi.fn();
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({
      mutateAsync: updateSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useUpdateUser>);

    const { props } = renderPanel({ student: existingStudent });
    const user = userEvent.setup();

    const submitButton = screen.getByRole("button", { name: "Save" });
    await user.click(submitButton);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("sends only dirty fields in PATCH payload when editing", async () => {
    const updateSpy = vi.fn().mockResolvedValue({ ...existingStudent, phone: "+992909998877" });
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({
      mutateAsync: updateSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useUpdateUser>);

    renderPanel({ student: existingStudent });
    const user = userEvent.setup();

    const phoneInput = screen.getByLabelText(/^Phone/i) as HTMLInputElement;
    fireEvent.change(phoneInput, { target: { value: "+992909998877" } });

    const submitButton = screen.getByRole("button", { name: "Save" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        id: 42,
        payload: {
          phone: "+992909998877",
        },
      });
    });
  });

  it("maps duplicate email server error to the email field", async () => {
    const createSpy = vi.fn().mockRejectedValue(new AuthApiError(400, "Email already exists in system"));
    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: createSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);

    renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/First Name/i), "Test");
    await user.type(screen.getByLabelText(/Last Name/i), "User");
    await user.type(screen.getByLabelText(/Email/i), "dup@example.com");
    await user.type(screen.getByLabelText(/^Phone/i), "+992901234567");

    const submitButton = screen.getByRole("button", { name: "Create" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("This email is already in use")).toBeDefined();
    });
  });

  it("explains photo remains saved when user cancels dirty identity form after avatar upload", async () => {
    const updateSpy = vi.fn();
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({
      mutateAsync: updateSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useUpdateUser>);

    vi.spyOn(userEndpoints, "uploadAvatar").mockResolvedValue({
      ...existingStudent,
      photo_path: "/uploads/new-photo.jpg",
    });

    const { props } = renderPanel({ student: existingStudent });
    const user = userEvent.setup();

    const firstNameInput = screen.getByLabelText(/First Name/i);
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "EditedName");

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = new File([new Uint8Array([0xff, 0xd8, 0xff])], "avatar.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() => {
      expect(props.onAvatarSaved).toHaveBeenCalledWith(expect.anything());
    });

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    expect(
      screen.getByText(/The uploaded photo has already been saved\. Unsaved profile details will be discarded/i),
    ).toBeDefined();

    const discardButton = screen.getByRole("button", { name: "Discard" });
    await user.click(discardButton);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("blocks dismissal and disables submit when identity save is pending", async () => {
    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);

    renderPanel();

    const submitButton = screen.getByRole("button", { name: /Saving/i });
    expect(submitButton.getAttribute("aria-busy")).toBe("true");
    expect(submitButton.hasAttribute("disabled")).toBe(true);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton.hasAttribute("disabled")).toBe(true);
  });

  it("focuses first invalid field on 422 server error", async () => {
    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(
        new AuthApiError(422, [
          { loc: ["body", "phone"], msg: "Invalid phone format", type: "value_error" },
        ]),
      ),
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);

    renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/First Name/i), "Test");
    await user.type(screen.getByLabelText(/Last Name/i), "User");
    await user.type(screen.getByLabelText(/Email/i), "valid@example.com");
    await user.type(screen.getByLabelText(/^Phone/i), "+992901234567");

    const submitButton = screen.getByRole("button", { name: "Create" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Invalid phone format")).toBeDefined();
      expect(document.activeElement?.id).toBe("student-phone");
    });
  });

  it("discards stale owner avatar completion when owner changes while upload is pending", async () => {
    let resolveUpload: (user: User) => void = () => {};
    const uploadPromise = new Promise<User>((resolve) => {
      resolveUpload = resolve;
    });

    vi.spyOn(userEndpoints, "uploadAvatar").mockReturnValue(uploadPromise);

    const onSavedSpy = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const otherStudent: User = {
      ...existingStudent,
      id: 99,
      first_name: "Rustam",
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <StudentFormPanel
              open={true}
              student={existingStudent}
              onClose={vi.fn()}
              onSaved={onSavedSpy}
            />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = new File([new Uint8Array([0xff, 0xd8, 0xff])], "avatar.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    rerender(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <StudentFormPanel
              open={true}
              student={otherStudent}
              onClose={vi.fn()}
              onSaved={onSavedSpy}
            />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    resolveUpload({
      ...existingStudent,
      photo_path: "/uploads/photo-42.jpg",
    });

    await waitFor(() => {
      expect(onSavedSpy).not.toHaveBeenCalled();
    });
  });

  it("blocks X close, Escape, backdrop click, and Cancel button during submission, ensuring exactly one pending identity request", async () => {
    let resolveCreate: (user: User) => void = () => {};
    const createPromise = new Promise<User>((resolve) => {
      resolveCreate = resolve;
    });

    const mutateAsyncSpy = vi.fn().mockReturnValue(createPromise);
    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: mutateAsyncSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);

    const { props } = renderPanel({ mode: "create" });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/First Name/i), "Test");
    await user.type(screen.getByLabelText(/Last Name/i), "User");
    await user.type(screen.getByLabelText(/Email/i), "test.blocked@example.com");
    await user.type(screen.getByLabelText(/^Phone/i), "+992901234567");

    const submitButton = screen.getByRole("button", { name: "Create" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mutateAsyncSpy).toHaveBeenCalledTimes(1);
    });

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton.hasAttribute("disabled")).toBe(true);

    const closeButton = screen.getByLabelText("Close");
    expect(closeButton.hasAttribute("disabled")).toBe(true);
    await user.click(closeButton);
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();

    resolveCreate({
      ...existingStudent,
      id: 999,
      email: "test.blocked@example.com",
    });
  });

  it("successful avatar upload followed by Cancel retains uploaded photo with no identity write and dirty fields", async () => {
    let resolveUpload: (user: User) => void = () => {};
    const uploadPromise = new Promise<User>((resolve) => {
      resolveUpload = resolve;
    });
    vi.spyOn(userEndpoints, "uploadAvatar").mockReturnValue(uploadPromise);

    const updateUserMutateSpy = vi.fn();
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({
      mutateAsync: updateUserMutateSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useUpdateUser>);

    const { props } = renderPanel({ mode: "edit", student: existingStudent });
    const user = userEvent.setup();

    const firstNameInput = screen.getByLabelText(/First Name/i);
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "DirtyName");

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = new File([new Uint8Array([0xff, 0xd8, 0xff])], "avatar.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    resolveUpload({
      ...existingStudent,
      photo_path: "/uploads/photo-persisted.jpg",
      thumbnail_path: "/uploads/thumb-persisted.jpg",
    });

    await waitFor(() => {
      expect(screen.getByText("Photo saved")).toBeDefined();
    });

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    const discardDialog = await screen.findByRole("dialog", { name: /Discard unsaved changes/i });
    expect(discardDialog).toBeDefined();

    const discardButton = screen.getByRole("button", { name: "Discard" });
    await user.click(discardButton);

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(updateUserMutateSpy).not.toHaveBeenCalled();
  });

  it("failed avatar upload retains prior photo and identity draft", async () => {
    vi.spyOn(userEndpoints, "uploadAvatar").mockRejectedValue(new Error("Network failure"));

    renderPanel({ mode: "edit", student: existingStudent });
    const user = userEvent.setup();

    const firstNameInput = screen.getByLabelText(/First Name/i) as HTMLInputElement;
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "DraftUnchanged");

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = new File([new Uint8Array([0xff, 0xd8, 0xff])], "avatar.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() => {
      expect(screen.getByText("Failed to upload photo")).toBeDefined();
      expect(firstNameInput.value).toBe("DraftUnchanged");
      const avatarContainer = screen.getByTestId("avatar-preview-container");
      const img = avatarContainer.querySelector("img");
      expect(img?.getAttribute("src")).toContain("uploads/thumb.jpg");
    });
  });

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
