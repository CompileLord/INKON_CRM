import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "../store/authStore";
import * as userHooks from "../lib/users/hooks";
import * as userEndpoints from "../lib/users/endpoints";
import { mockProfileResponse, mockStudentUser, renderStudentProfile, registerStudentProfileHooks } from "./StudentProfileTestSupport";

registerStudentProfileHooks();

describe("StudentProfile parent Telegram link", () => {
  it("shows the link state as a badge that opens a popover with the code action for a superadmin", async () => {
    const user = userEvent.setup();
    vi.spyOn(userEndpoints, "generateTelegramLinkCode").mockResolvedValue({ code: "AB12CD", expires_at: "2026-10-26T12:00:00Z" });
    renderStudentProfile();

    const trigger = document.querySelector("[data-entity-header] button[data-parent-link]") as HTMLElement;
    expect(trigger.querySelector("[data-badge-status='notLinked']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Generate code" })).toBeNull();

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Generate code" }));
    expect((await screen.findByLabelText("Parent link code")).textContent).toBe("AB12CD");
    expect(screen.getByRole("button", { name: "Copy code" })).toBeDefined();
  });

  it("offers a new code instead of a first code when a parent is already linked", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, parent_linked: true, parent_link_code_expires_at: "2026-10-26T12:00:00Z" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    const trigger = document.querySelector("[data-entity-header] button[data-parent-link]") as HTMLElement;
    expect(trigger.querySelector("[data-badge-status='linked']")).not.toBeNull();
    await user.click(trigger);
    expect(await screen.findByRole("button", { name: "New code" })).toBeDefined();
  });

  it("keeps the code action superadmin-only: a mentor sees a plain badge without a popover trigger", () => {
    useAuthStore.setState({ role: "mentor", userId: 7 });
    renderStudentProfile();
    const header = document.querySelector("[data-entity-header]") as HTMLElement;
    expect(header.querySelector("[data-parent-link]")?.tagName).toBe("SPAN");
    expect(header.querySelector("[data-badge-status='notLinked']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Generate code|New code/ })).toBeNull();
  });

  it("opens the popover with the one-time code right after student creation", () => {
    renderStudentProfile([{ pathname: "/students/42", state: { createdStudentId: 42, createdParentLinkCode: "ZZ99ZZ" } }]);
    expect(screen.getByLabelText("Parent link code").textContent).toBe("ZZ99ZZ");
  });
});
