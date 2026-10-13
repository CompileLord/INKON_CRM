import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { createMemoryRouter, MemoryRouter, RouterProvider, useNavigate } from "react-router-dom";
import { MentorFormPanel } from "./MentorFormPanel";
import * as userHooks from "../../lib/users/hooks";
import * as userEndpoints from "../../lib/users/endpoints";
import { AuthApiError } from "../../lib/auth/errors";
import type { User } from "../../lib/users/types";
import { useAuthStore } from "../../store/authStore";
import { useState } from "react";

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

const existingMentor: User = {
  id: 55,
  email: "existing.mentor@example.com",
  first_name: "Farrukh",
  last_name: "Yusupov",
  role: "mentor",
  phone: "+992901234567",
  parent_phone: null,
  date_of_birth: "1985-08-20",
  payment_day_of_month: null,
  parent_telegram_chat_id: 112233,
  is_deleted: false,
  must_set_password: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  photo_path: "/uploads/photo.jpg",
  thumbnail_path: "/uploads/thumb.jpg",
};

function renderPanel(props: Partial<Parameters<typeof MentorFormPanel>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const defaultProps = {
    open: true,
    mentor: undefined,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <MentorFormPanel {...defaultProps} />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    ),
    props: defaultProps,
  };
}

describe("MentorFormPanel", () => {
  it("renders new mentor form and does not render avatar upload in create mode", () => {
    renderPanel();

    expect(screen.getByRole("heading", { name: "New Teacher" })).toBeDefined();
    expect(screen.getByLabelText(/First Name/i)).toBeDefined();
    expect(screen.getByLabelText(/Last Name/i)).toBeDefined();
    expect(screen.getByLabelText(/Email/i)).toBeDefined();
    expect(screen.getByLabelText(/Phone/i).getAttribute("placeholder")).toBe("+992901234567");
    expect(screen.queryByLabelText(/Photo/i)).toBeNull();
    expect(screen.queryByText(/Upload photo/i)).toBeNull();
  });

  it("omits student-only payment and parent fields", () => {
    renderPanel();

    expect(screen.queryByLabelText(/Payment day/i)).toBeNull();
    expect(screen.queryByLabelText(/Parent phone/i)).toBeNull();
  });

  it("renders avatar upload field in edit mode", () => {
    renderPanel({ mentor: existingMentor });

    expect(screen.getByRole("heading", { name: "Edit Teacher" })).toBeDefined();
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
    await user.type(firstNameInput, "Farrukh");

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

    const { props } = renderPanel({ mentor: existingMentor });
    const user = userEvent.setup();

    const submitButton = screen.getByRole("button", { name: "Save" });
    await user.click(submitButton);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("sends only dirty fields in PATCH payload when editing", async () => {
    const updateSpy = vi.fn().mockResolvedValue({ ...existingMentor, phone: "+992909998877" });
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({
      mutateAsync: updateSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useUpdateUser>);

    renderPanel({ mentor: existingMentor });
    const user = userEvent.setup();

    const phoneInput = screen.getByLabelText(/^Phone/i) as HTMLInputElement;
    fireEvent.change(phoneInput, { target: { value: "+992909998877" } });

    const submitButton = screen.getByRole("button", { name: "Save" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        id: 55,
        payload: {
          phone: "+992909998877",
        },
      });
      const payload = updateSpy.mock.calls[0][0].payload;
      expect("parent_telegram_chat_id" in payload).toBe(false);
      expect("parent_phone" in payload).toBe(false);
      expect("payment_day_of_month" in payload).toBe(false);
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
    await user.type(screen.getByLabelText(/Last Name/i), "Mentor");
    await user.type(screen.getByLabelText(/Email/i), "dup@example.com");

    const submitButton = screen.getByRole("button", { name: "Create" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("This email is already in use")).toBeDefined();
    });
  });

  it("focuses first invalid field and renders translated error on 422 server error in non-English locale (ru)", async () => {
    await i18n.changeLanguage("ru");
    try {
      vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
        mutateAsync: vi.fn().mockRejectedValue(
          new AuthApiError(422, [
            { loc: ["body", "first_name"], msg: "field required", type: "value_error.missing" },
          ]),
        ),
        isPending: false,
      } as unknown as ReturnType<typeof userHooks.useCreateUser>);

      renderPanel();
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/Email/i), "valid@example.com");

      const submitButton = screen.getByRole("button", { name: "Создать" });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Введите имя")).toBeDefined();
        expect(screen.queryByText(/field required/i)).toBeNull();
        expect(document.activeElement?.id).toBe("mentor-firstName");
      });
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("renders translated general validation error on 422 for unsupported field in non-English locale (ru)", async () => {
    await i18n.changeLanguage("ru");
    try {
      vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
        mutateAsync: vi.fn().mockRejectedValue(
          new AuthApiError(422, [
            { loc: ["body", "unsupported_field"], msg: "invalid field value", type: "value_error" },
          ]),
        ),
        isPending: false,
      } as unknown as ReturnType<typeof userHooks.useCreateUser>);

      renderPanel();
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/Имя/i), "Test");
      await user.type(screen.getByLabelText(/Фамилия/i), "Mentor");
      await user.type(screen.getByLabelText(/Email/i), "valid@example.com");

      const submitButton = screen.getByRole("button", { name: "Создать" });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Пожалуйста, исправьте ошибки в форме перед сохранением")).toBeDefined();
      });
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("blocks X close, Escape, backdrop click, and Cancel button during submission, ensuring exactly one pending write, and recovers on resolve", async () => {
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
    await user.type(screen.getByLabelText(/Last Name/i), "Mentor");
    await user.type(screen.getByLabelText(/Email/i), "test.deferred@example.com");

    const submitButton = screen.getByRole("button", { name: "Create" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mutateAsyncSpy).toHaveBeenCalledTimes(1);
    });

    await user.click(submitButton);
    expect(mutateAsyncSpy).toHaveBeenCalledTimes(1);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton.hasAttribute("disabled")).toBe(true);
    await user.click(cancelButton);
    expect(props.onClose).not.toHaveBeenCalled();

    const closeButton = screen.getByLabelText("Close");
    expect(closeButton.hasAttribute("disabled")).toBe(true);
    await user.click(closeButton);
    expect(props.onClose).not.toHaveBeenCalled();

    const backdrop = document.querySelector(".bg-scrim");
    expect(backdrop).toBeTruthy();
    await user.click(backdrop!);
    expect(screen.getByLabelText(/Email/i)).toBeDefined();
    expect(props.onClose).not.toHaveBeenCalled();

    await user.click(submitButton);
    expect(mutateAsyncSpy).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(screen.getByLabelText(/Email/i)).toBeDefined();
    expect(props.onClose).not.toHaveBeenCalled();

    resolveCreate({
      ...existingMentor,
      id: 999,
      email: "test.deferred@example.com",
    });

    await waitFor(() => {
      expect(props.onClose).toHaveBeenCalled();
      expect(props.onSaved).toHaveBeenCalledWith("created", expect.objectContaining({ id: 999 }));
    });
  });

  it("recovers on deferred submission rejection, displaying translated error and keeping inputs intact for retry", async () => {
    let rejectCreate: (err: unknown) => void = () => {};
    const createPromise = new Promise<User>((_, reject) => {
      rejectCreate = reject;
    });

    const mutateAsyncSpy = vi.fn().mockReturnValue(createPromise);
    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: mutateAsyncSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);

    renderPanel({ mode: "create" });
    const user = userEvent.setup();

    const firstNameInput = screen.getByLabelText(/First Name/i);
    await user.type(firstNameInput, "RetainedName");
    await user.type(screen.getByLabelText(/Last Name/i), "RetainedLastName");
    await user.type(screen.getByLabelText(/Email/i), "retained@example.com");

    const submitButton = screen.getByRole("button", { name: "Create" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mutateAsyncSpy).toHaveBeenCalledTimes(1);
    });

    rejectCreate(new Error("Network failure"));

    await waitFor(() => {
      expect(screen.getByText("Failed to save teacher details. Please try again.")).toBeDefined();
      expect((firstNameInput as HTMLInputElement).value).toBe("RetainedName");
      expect(submitButton.hasAttribute("disabled")).toBe(false);
    });
  });

  it("suppresses late create callbacks when the authenticated owner changes during the request", async () => {
    let resolveCreate: (user: User) => void = () => {};
    const createPromise = new Promise<User>((resolve) => {
      resolveCreate = resolve;
    });
    const mutateAsyncSpy = vi.fn().mockReturnValue(createPromise);
    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: mutateAsyncSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);
    useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 14 });

    const { props } = renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/First Name/i), "Test");
    await user.type(screen.getByLabelText(/Last Name/i), "Mentor");
    await user.type(screen.getByLabelText(/Email/i), "owner-change@example.com");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mutateAsyncSpy).toHaveBeenCalledTimes(1));

    useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 15 });
    resolveCreate({ ...existingMentor, id: 999, email: "owner-change@example.com" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Create" }).hasAttribute("disabled")).toBe(false));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("blocks routed navigation during pending create and suppresses stale completion after the owner changes", async () => {
    let resolveCreate: (user: User) => void = () => {};
    const createPromise = new Promise<User>((resolve) => {
      resolveCreate = resolve;
    });
    const mutateAsyncSpy = vi.fn().mockReturnValue(createPromise);
    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: mutateAsyncSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);
    useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 20 });
    const onSaved = vi.fn();
    const onClose = vi.fn();

    function FormRoute() {
      return (
        <MentorFormPanel
          open={true}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    }

    const router = createMemoryRouter(
      [
        { path: "/", element: <FormRoute /> },
        { path: "/destination", element: <h1>Destination</h1> },
        { path: "/mentors/:id", element: <h1>Saved mentor</h1> },
      ],
      { initialEntries: ["/"] },
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nextProvider i18n={i18n}>
          <RouterProvider router={router} />
        </I18nextProvider>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/First Name/i), "Test");
    await user.type(screen.getByLabelText(/Last Name/i), "Mentor");
    await user.type(screen.getByLabelText(/Email/i), "route-pending@example.com");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mutateAsyncSpy).toHaveBeenCalledTimes(1));

    await act(async () => {
      await router.navigate("/destination");
    });
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByRole("heading", { name: "Destination" })).toBeNull();
    expect(screen.getByRole("dialog")).toBeDefined();

    useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 21 });
    await act(async () => {
      resolveCreate({ ...existingMentor, id: 1001, email: "route-pending@example.com" });
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Create" }).hasAttribute("disabled")).toBe(false));
    expect(router.state.location.pathname).toBe("/");
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    router.dispose();
  });

  it("allows successful create to navigate from a dirty form to its new profile", async () => {
    let resolveCreate: (user: User) => void = () => {};
    const createPromise = new Promise<User>((resolve) => {
      resolveCreate = resolve;
    });
    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: vi.fn().mockReturnValue(createPromise),
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);

    function FormRoute() {
      const navigate = useNavigate();
      const [open, setOpen] = useState(true);
      return (
        <MentorFormPanel
          open={open}
          onClose={() => setOpen(false)}
          onSaved={(_action, savedUser) => {
            if (savedUser) navigate(`/mentors/${savedUser.id}`);
          }}
        />
      );
    }

    const router = createMemoryRouter(
      [
        { path: "/", element: <FormRoute /> },
        { path: "/mentors/:id", element: <h1>Saved mentor</h1> },
      ],
      { initialEntries: ["/"] },
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nextProvider i18n={i18n}>
          <RouterProvider router={router} />
        </I18nextProvider>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/First Name/i), "Test");
    await user.type(screen.getByLabelText(/Last Name/i), "Mentor");
    await user.type(screen.getByLabelText(/Email/i), "success-route@example.com");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDefined());

    await act(async () => {
      resolveCreate({ ...existingMentor, id: 1002, email: "success-route@example.com" });
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/mentors/1002"));
    expect(screen.getByRole("heading", { name: "Saved mentor" })).toBeDefined();
    router.dispose();
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

    const otherMentor: User = {
      ...existingMentor,
      id: 88,
      first_name: "OtherMentor",
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <MentorFormPanel
              open={true}
              mode="edit"
              mentor={existingMentor}
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
            <MentorFormPanel
              open={true}
              mode="edit"
              mentor={otherMentor}
              onClose={vi.fn()}
              onSaved={onSavedSpy}
            />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    resolveUpload({
      ...existingMentor,
      photo_path: "/uploads/photo-stale.jpg",
    });

    await waitFor(() => {
      expect(onSavedSpy).not.toHaveBeenCalled();
    });
  });

  it("blocks dismissal while avatar upload is pending, and saved photo Cancel retains photo with no identity PATCH", async () => {
    let resolveUpload: (user: User) => void = () => {};
    const uploadPromise = new Promise<User>((resolve) => {
      resolveUpload = resolve;
    });
    const uploadSpy = vi.spyOn(userEndpoints, "uploadAvatar").mockReturnValue(uploadPromise);

    const updateSpy = vi.fn();
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({
      mutateAsync: updateSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useUpdateUser>);

    const { props } = renderPanel({ mode: "edit", mentor: existingMentor });
    const user = userEvent.setup();

    const firstNameInput = screen.getByLabelText(/First Name/i);
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "DirtyFarrukh");

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = new File([new Uint8Array([0xff, 0xd8, 0xff])], "avatar.jpg", {
      type: "image/jpeg",
    });
    uploadSpy.mockClear();
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton.hasAttribute("disabled")).toBe(true);

    const closeButton = screen.getByLabelText("Close");
    expect(closeButton.hasAttribute("disabled")).toBe(true);

    const backdrop = document.querySelector(".bg-scrim");
    expect(backdrop).toBeTruthy();
    await user.click(backdrop!);
    expect(screen.getByLabelText(/Email/i)).toBeDefined();
    expect(props.onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText(/Email/i)).toBeDefined();
    await user.click(cancelButton);
    expect(screen.getByLabelText(/Email/i)).toBeDefined();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(uploadSpy).toHaveBeenCalledTimes(1);

    resolveUpload({
      ...existingMentor,
      photo_path: "/uploads/new-photo.jpg",
    });

    await waitFor(() => {
      expect(props.onSaved).toHaveBeenCalledWith("updated", expect.objectContaining({ photo_path: "/uploads/new-photo.jpg" }));
    });

    expect(cancelButton.hasAttribute("disabled")).toBe(false);
    await user.click(cancelButton);

    expect(
      screen.getByText(/The uploaded photo has already been saved\. Unsaved profile details will be discarded/i),
    ).toBeDefined();

    const discardButton = screen.getByRole("button", { name: "Discard" });
    await user.click(discardButton);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});
