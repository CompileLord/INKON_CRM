import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import { OrganizationSection } from "./OrganizationSection";
import * as settingsApi from "../../lib/settings/endpoints";
import type { OrgSettings } from "../../lib/settings/types";

const organization: OrgSettings = { org_name: "Kitob", address: "Dushanbe, Rudaki 1", phone: "+992901234567", notify_payments: true, notify_debts: true };

function renderSection(): void {
  const client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <OrganizationSection onSaved={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OrganizationSection address and phone", () => {
  it("shows the stored address and phone with the phone format as the placeholder only", async () => {
    vi.spyOn(settingsApi, "fetchOrgSettings").mockResolvedValue(organization);
    renderSection();
    expect(((await screen.findByLabelText("Address")) as HTMLInputElement).value).toBe("Dushanbe, Rudaki 1");
    const phone: HTMLInputElement = screen.getByLabelText("Phone") as HTMLInputElement;
    expect(phone.value).toBe("+992901234567");
    expect(phone.placeholder).toBe("+992901234567");
    expect(screen.queryByText(/international format/)).toBeNull();
  });

  it("sends only the changed address and phone", async () => {
    vi.spyOn(settingsApi, "fetchOrgSettings").mockResolvedValue(organization);
    const update = vi.spyOn(settingsApi, "updateOrgSettings").mockResolvedValue(organization);
    const user = userEvent.setup();
    renderSection();
    const address: HTMLElement = await screen.findByLabelText("Address");
    fireEvent.change(address, { target: { value: "Khujand, Lenin 5" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+992927654321" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toEqual({ address: "Khujand, Lenin 5", phone: "+992927654321" });
  });

  it("sends null when address and phone are cleared", async () => {
    vi.spyOn(settingsApi, "fetchOrgSettings").mockResolvedValue(organization);
    const update = vi.spyOn(settingsApi, "updateOrgSettings").mockResolvedValue({ ...organization, address: null, phone: null });
    const user = userEvent.setup();
    renderSection();
    await user.clear(await screen.findByLabelText("Address"));
    await user.clear(screen.getByLabelText("Phone"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toEqual({ address: null, phone: null });
  });

  it("shows a translated error only for an invalid phone and blocks saving", async () => {
    vi.spyOn(settingsApi, "fetchOrgSettings").mockResolvedValue(organization);
    const update = vi.spyOn(settingsApi, "updateOrgSettings").mockResolvedValue(organization);
    const user = userEvent.setup();
    renderSection();
    const phone: HTMLElement = await screen.findByLabelText("Phone");
    expect(screen.queryByText(/international format/)).toBeNull();
    fireEvent.change(phone, { target: { value: "9929" } });
    expect(screen.getByText("Use the international format, e.g. +992901234567.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(update).not.toHaveBeenCalled();
  });
});
