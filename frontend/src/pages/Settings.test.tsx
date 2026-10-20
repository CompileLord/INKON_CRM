import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../i18n";
import { Settings } from "./Settings";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";

const mocks = vi.hoisted(() => ({
  user: { id: 5, first_name: "Aziza", last_name: "Karimova", email: "aziza@example.com", phone: "+992900000001", photo_path: null, thumbnail_path: null } as Record<string, unknown>,
  userQuery: { isLoading: false, isError: false } as { isLoading: boolean; isError: boolean },
  updateProfile: vi.fn(),
  updateOrganization: vi.fn(),
  organization: { org_name: "Kitob Center", notify_payments: true, notify_debts: false } as Record<string, unknown>,
  organizationQuery: { isLoading: false, isError: false } as { isLoading: boolean; isError: boolean },
  organizationEnabledCalls: [] as boolean[],
  testBot: vi.fn(),
  refetchUser: vi.fn(),
}));

vi.mock("../lib/users/hooks", () => ({
  useCurrentUser: () => ({ data: mocks.userQuery.isError ? undefined : mocks.user, ...mocks.userQuery, refetch: mocks.refetchUser }),
  useUpdateOwnProfile: () => ({ mutate: mocks.updateProfile, reset: vi.fn(), isPending: false, isError: false }),
  useUploadAvatar: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../lib/settings/hooks", () => ({
  useOrgSettings: (enabled: boolean = true) => {
    mocks.organizationEnabledCalls.push(enabled);
    return { data: mocks.organizationQuery.isError ? undefined : mocks.organization, ...mocks.organizationQuery, refetch: vi.fn() };
  },
  useUpdateOrgSettings: () => ({ mutate: mocks.updateOrganization, mutateAsync: mocks.updateOrganization, reset: vi.fn(), isPending: false, isError: false }),
  useTestTelegramBot: () => ({ mutate: mocks.testBot, data: undefined, isPending: false, isError: false }),
}));

vi.mock("../lib/system/hooks", () => ({
  useServerBuildInfo: () => ({
    data: { version: "0.1.0", commit_sha: "abcdef1234567890", commit_message: "feat: ship", built_at: "2026-10-17T10:00:00Z" },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

function stubViewport(desktop: boolean): void {
  window.matchMedia = ((query: string) => ({ matches: desktop && query.includes("1024"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
}

function renderSettings(role: "student" | "superadmin", url = "/settings", desktop = true) {
  stubViewport(desktop);
  useAuthStore.setState({ role, userId: 5, status: "authenticated" });
  return render(<MemoryRouter initialEntries={[url]}><Settings /></MemoryRouter>);
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  mocks.userQuery = { isLoading: false, isError: false };
  mocks.organizationQuery = { isLoading: false, isError: false };
  mocks.organizationEnabledCalls = [];
  mocks.updateProfile.mockReset();
  mocks.updateOrganization.mockReset();
  mocks.updateOrganization.mockResolvedValue({});
  localStorage.clear();
});
afterEach(() => cleanup());

describe("Settings navigation", () => {
  it("offers Profile and Appearance to a student as vertical tabs and never the administrator sections", () => {
    renderSettings("student");
    const tabs = screen.getByRole("tablist", { name: "Settings sections" });
    expect(tabs.getAttribute("aria-orientation")).toBe("vertical");
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Profile", "Appearance"]);
  });

  it("adds Organization and Notification rules for the superadmin", () => {
    renderSettings("superadmin");
    const tabs = screen.getByRole("tablist", { name: "Settings sections" });
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Profile", "Appearance", "Organization", "Notification rules"]);
  });

  it("falls back to Profile for an administrator section requested by a nonadmin", () => {
    renderSettings("student", "/settings?tab=organization");
    expect(screen.getByRole("tab", { name: "Profile" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("Organization name")).toBeNull();
    expect(mocks.organizationEnabledCalls).toEqual([]);
  });

  it("keeps the active section in ?tab= and shows only its panel", () => {
    renderSettings("superadmin", "/settings?tab=rules");
    expect(screen.getByRole("tab", { name: "Notification rules" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("settings-tab-rules");
    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(screen.getByRole("tab", { name: "Appearance" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("settings-tab-appearance");
  });

  it("has no subtitle under the page title and no page-level max width", () => {
    renderSettings("student");
    expect(document.querySelector("[data-page-container]")).not.toBeNull();
    expect(screen.queryByText(/Choose how|Manage your/)).toBeNull();
  });
});

describe("Profile section", () => {
  it("shows the save bar only when a value differs and discards back to the saved value", () => {
    renderSettings("student");
    expect(screen.queryByTestId("settings-save-bar")).toBeNull();
    const firstName = screen.getByLabelText("First name") as HTMLInputElement;
    fireEvent.change(firstName, { target: { value: "Zarina" } });
    expect(screen.getByTestId("settings-save-bar")).toBeTruthy();
    fireEvent.change(firstName, { target: { value: "Aziza" } });
    expect(screen.queryByTestId("settings-save-bar")).toBeNull();
    fireEvent.change(firstName, { target: { value: "Zarina" } });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Aziza");
    expect(screen.queryByTestId("settings-save-bar")).toBeNull();
  });

  it("saves only the changed fields and trims them", () => {
    renderSettings("student");
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "  Rahimova " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.updateProfile).toHaveBeenCalledTimes(1);
    expect(mocks.updateProfile.mock.calls[0][0]).toEqual({ last_name: "Rahimova" });
  });

  it("blocks saving an invalid phone number and an empty name", () => {
    renderSettings("student");
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "not-a-phone" } });
    expect(screen.getByText(/international format, e\.g\. \+992901234567\./i, { selector: "[role='alert']" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+992900000001" } });
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("keeps the email read-only", () => {
    renderSettings("student");
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.disabled).toBe(true);
    expect(email.value).toBe("aziza@example.com");
  });

  it("offers a working retry when the profile cannot be loaded", () => {
    mocks.userQuery = { isLoading: false, isError: true };
    renderSettings("student");
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    expect(mocks.refetchUser).toHaveBeenCalledTimes(1);
  });

  it("reserves a loading skeleton while the profile loads", () => {
    mocks.userQuery = { isLoading: true, isError: false };
    renderSettings("student");
    expect(screen.getAllByLabelText("Loading...").length).toBeGreaterThan(0);
  });
});

describe("Appearance section", () => {
  it("applies the theme and language immediately without a save bar", async () => {
    renderSettings("student", "/settings?tab=appearance");
    const theme = screen.getByRole("radiogroup", { name: "Theme" });
    fireEvent.click(within(theme).getByRole("radio", { name: "Dark" }));
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(localStorage.getItem("imkon_theme")).toBe("dark");
    const language = screen.getByRole("radiogroup", { name: "Language" });
    fireEvent.click(within(language).getByRole("radio", { name: "RU" }));
    await waitFor(() => expect(i18n.language).toBe("ru"));
    expect(screen.getByRole("radiogroup", { name: "Тема" })).toBeTruthy();
    expect(screen.queryByText("Тема и язык")).toBeNull();
    expect(screen.queryByTestId("settings-save-bar")).toBeNull();
  });

  it("moves the selection with arrow keys like a radio group", () => {
    renderSettings("student", "/settings?tab=appearance");
    const theme = screen.getByRole("radiogroup", { name: "Theme" });
    const light = within(theme).getByRole("radio", { name: "Light" });
    fireEvent.click(light);
    fireEvent.keyDown(light, { key: "ArrowRight" });
    expect(within(theme).getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(within(theme).getByRole("radio", { name: "Dark" }), { key: "End" });
    expect(within(theme).getByRole("radio", { name: "System" }).getAttribute("aria-checked")).toBe("true");
  });

  it("places the app and server builds in the About group", () => {
    renderSettings("student", "/settings?tab=appearance");
    const about = screen.getByRole("heading", { name: "About" }).closest("section") as HTMLElement;
    expect(within(about).getByText("App")).toBeTruthy();
    expect(within(about).getByText("Server")).toBeTruthy();
    expect(within(about).getAllByText("Version")).toHaveLength(2);
  });
});

describe("Organization section", () => {
  it("edits the name inline and sends only the dirty org_name", async () => {
    renderSettings("superadmin", "/settings?tab=organization");
    expect(screen.queryByTestId("settings-save-bar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.updateOrganization).toHaveBeenCalledWith({ org_name: "New Name" }, expect.anything());
  });

  it("shows currency read-only with an explanation and runs the Telegram test", () => {
    renderSettings("superadmin", "/settings?tab=organization");
    expect(screen.getByText("TJS · Somoni")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Currency" })).toBeTruthy();
    expect(screen.getByTestId("telegram-status").getAttribute("data-state")).toBe("unchecked");
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(mocks.testBot).toHaveBeenCalledTimes(1);
  });
});

describe("Notification rules section", () => {
  it("renders switches reflecting the saved values and autosaves only the toggled rule", async () => {
    renderSettings("superadmin", "/settings?tab=rules");
    const payments = screen.getByRole("switch", { name: "Payment notifications" });
    const debts = screen.getByRole("switch", { name: "Debt reminders" });
    expect(payments.getAttribute("aria-checked")).toBe("true");
    expect(debts.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(debts);
    expect(mocks.updateOrganization).toHaveBeenCalledWith({ notify_debts: true });
    expect(debts.getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(screen.getByText("Saved", { selector: "[role='status']" })).toBeTruthy());
    expect(screen.queryByTestId("settings-save-bar")).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("reverts the switch and reports the failure when the save is rejected", async () => {
    mocks.updateOrganization.mockRejectedValue(new Error("boom"));
    renderSettings("superadmin", "/settings?tab=rules");
    const payments = screen.getByRole("switch", { name: "Payment notifications" });
    fireEvent.click(payments);
    expect(mocks.updateOrganization).toHaveBeenCalledWith({ notify_payments: false });
    await waitFor(() => expect(screen.getByText("Couldn't save. Try again.", { selector: "[role='status']" })).toBeTruthy());
    expect(payments.getAttribute("aria-checked")).toBe("true");
  });
});
