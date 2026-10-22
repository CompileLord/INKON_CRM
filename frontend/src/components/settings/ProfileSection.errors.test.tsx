import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import { ProfileSection } from "./ProfileSection";
import * as usersApi from "../../lib/users/endpoints";
import { AuthApiError, NetworkError } from "../../lib/auth/errors";
import { ProfileSaveErrorMapper } from "../../lib/users/profileSaveError";
import type { User } from "../../lib/users/types";

const currentUser: User = {
  id: 7,
  email: "mentor@mail.com",
  first_name: "Ann",
  last_name: "Lee",
  phone: "+992900000001",
  role: "mentor",
  date_of_birth: null,
  parent_phone: null,
  photo_path: null,
  thumbnail_path: null,
  payment_day_of_month: null,
  must_set_password: false,
  is_deleted: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderSection(): void {
  const client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProfileSection role="mentor" onSaved={vi.fn()} />
    </QueryClientProvider>,
  );
}

async function editPhoneAndSave(): Promise<void> {
  const user = userEvent.setup();
  const phone: HTMLElement = await screen.findByLabelText("Phone");
  await user.clear(phone);
  await user.type(phone, "+992900000002");
  await user.click(screen.getByRole("button", { name: "Save" }));
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.spyOn(usersApi, "getCurrentUser").mockResolvedValue(currentUser);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("profile save errors", () => {
  it("maps a duplicate phone 409 onto the phone field", async () => {
    vi.spyOn(usersApi, "updateOwnProfile").mockRejectedValue(new AuthApiError(409, "User with this phone already exists"));
    renderSection();
    await editPhoneAndSave();
    expect(await screen.findByText("This phone number is already in use.")).toBeTruthy();
    expect(screen.queryByText("Couldn't save. Try again.")).toBeNull();
  });

  it("maps a 422 on first_name onto the name field", async () => {
    vi.spyOn(usersApi, "updateOwnProfile").mockRejectedValue(new AuthApiError(422, [{ loc: ["body", "first_name"], msg: "bad", type: "value_error" }]));
    renderSection();
    await editPhoneAndSave();
    expect(await screen.findByText("Enter a name.")).toBeTruthy();
  });

  it("shows the translated server-unreachable message on a network failure", async () => {
    vi.spyOn(usersApi, "updateOwnProfile").mockRejectedValue(new NetworkError());
    renderSection();
    await editPhoneAndSave();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Can't reach the server. Try again."));
  });
});

describe("ProfileSaveErrorMapper", () => {
  it("falls back to the generic save message", () => {
    expect(ProfileSaveErrorMapper.map(new AuthApiError(500, "boom")).formKey).toBe("saveBar.failed");
  });
});
