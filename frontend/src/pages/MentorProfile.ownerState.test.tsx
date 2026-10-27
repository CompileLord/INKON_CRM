import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { useAuthStore } from "../store/authStore";
import * as endpoints from "../lib/users/endpoints";
import { AuthApiError } from "../lib/auth/errors";
import type { User } from "../lib/users/types";
import { mentor, profile, analytics, setup, registerMentorProfileHooks } from "./MentorProfileTestSupport";

registerMentorProfileHooks();

async function openAccess(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Teacher actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Account access" }));
}

describe("Mentor profile authorization and state", () => {
  it("transient refresh keeps dirty edit and permission denial discards it permanently", async () => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValueOnce(profile).mockRejectedValueOnce(new AuthApiError(503, "Unavailable")).mockRejectedValueOnce(new AuthApiError(403, "Denied")).mockResolvedValue(profile);
    const queryClient = setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByLabelText<HTMLInputElement>(/First Name/), " dirty");
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["users", "mentors", "profile", 10] }); });
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>(/First Name/).value).toBe("Alisher dirty");
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["users", "mentors", "profile", 10] }); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("heading", { name: "Alisher Navoiy" })).toBeNull();
    expect(screen.getByRole("heading", { name: i18n.t("mentorProfile:state.forbiddenTitle") })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    [403, "forbidden"],
    [401, "forbidden"],
    [404, "notFound"],
    [422, "notFound"],
  ])("shows a distinct %s state with the return link and no Retry or identity", async (status, kind) => {
    vi.mocked(endpoints.getMentorProfile).mockRejectedValue(new AuthApiError(status, "Denied"));
    setup();
    expect(await screen.findByRole("heading", { name: i18n.t(`mentorProfile:state.${kind}Title`) })).toBeDefined();
    expect(screen.getByText(i18n.t(`mentorProfile:state.${kind}Body`))).toBeDefined();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByText("Alisher Navoiy")).toBeNull();
    expect(screen.getByRole("link", { name: /Back to Teachers/ })).toBeDefined();
  });

  it("shows the not-found state for an invalid identifier and no data request", () => {
    setup(undefined, "/mentors/abc");
    expect(screen.getByRole("heading", { name: i18n.t("mentorProfile:state.notFoundTitle") })).toBeDefined();
    expect(endpoints.getMentorProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows the could-not-load state with Retry and the return link for a 503, and Retry refetches", async () => {
    vi.mocked(endpoints.getMentorProfile).mockRejectedValueOnce(new AuthApiError(503, "Unavailable")).mockResolvedValue(profile);
    setup();
    expect(await screen.findByRole("heading", { name: i18n.t("mentorProfile:state.failedTitle") })).toBeDefined();
    expect(screen.getByRole("link", { name: /Back to Teachers/ })).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(endpoints.getMentorProfile).toHaveBeenCalledTimes(2);
  });

  it("independent photo completion preserves dirty identity through a failed refresh and Cancel sends no identity write", async () => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValueOnce(profile).mockRejectedValue(new AuthApiError(503, "Unavailable"));
    vi.spyOn(endpoints, "uploadAvatar").mockResolvedValue({ ...mentor, photo_path: "/storage/avatar/10/photo.jpg", thumbnail_path: "/storage/avatar/10/thumb.jpg" });
    const update = vi.spyOn(endpoints, "updateUser").mockResolvedValue(mentor);
    vi.stubGlobal("URL", class extends URL { static createObjectURL = () => "blob:fixture-photo"; static revokeObjectURL = () => undefined; });
    try {
      setup();
      await screen.findByRole("heading", { name: "Alisher Navoiy" });
      await userEvent.click(screen.getByRole("button", { name: "Edit" }));
      await userEvent.type(screen.getByLabelText<HTMLInputElement>(/First Name/), " dirty");
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) throw new Error("Existing-account photo picker must exist");
      await userEvent.upload(input, new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", { type: "image/jpeg" }));
      await waitFor(() => expect(endpoints.uploadAvatar).toHaveBeenCalledTimes(1));
      await screen.findByText(/Couldn't refresh the profile/);
      expect(screen.getByRole("dialog", { name: "Edit Teacher" })).toBeDefined();
      expect(screen.getByLabelText<HTMLInputElement>(/First Name/).value).toBe("Alisher dirty");
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await userEvent.click(screen.getByRole("button", { name: "Discard" }));
      expect(update).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog", { name: "Edit Teacher" })).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });

  it("auth owner ABA abandons a pending save and masks credentials again", async () => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValue({ ...profile, user: { ...mentor, raw_password: "fixture-only-secret" } });
    let finish: (user: User) => void = () => { throw new Error("Save was not started"); };
    vi.spyOn(endpoints, "updateUser").mockReturnValue(new Promise<User>(resolve => { finish = resolve; }));
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await openAccess();
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByText("fixture-only-secret")).toBeDefined();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByLabelText<HTMLInputElement>(/First Name/), " dirty");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(endpoints.updateUser).toHaveBeenCalled());
    act(() => {
      useAuthStore.setState({ userId: 2 });
      useAuthStore.setState({ userId: 1 });
    });
    await act(async () => { finish({ ...mentor, first_name: "Updated" }); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("fixture-only-secret")).toBeNull();
    expect(screen.queryByText("Teacher updated successfully")).toBeNull();
  });

  it("admin Back link restores directory query, page and page size and carries the originating row", async () => {
    setup({ fromDirectory: { search: "nav", page: 3, pageSize: 50, mentorId: 10 } });
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(screen.getByRole("link", { name: "Back to Teachers" }).getAttribute("href")).toBe("/mentors?q=nav&page=3&pageSize=50");
    await userEvent.click(screen.getByRole("link", { name: "Back to Teachers" }));
    await screen.findByRole("heading", { name: "Teacher directory" });
    expect(screen.getByTestId("location").textContent).toBe("/mentors?q=nav&page=3&pageSize=50");
  });

  it("masks credentials again when the access dialog closes and reopens", async () => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValue({ ...profile, user: { ...mentor, raw_password: "fixture-only-secret" } });
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(screen.queryByText("fixture-only-secret")).toBeNull();
    await openAccess();
    expect(screen.getByText("••••••••")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByText("fixture-only-secret")).toBeDefined();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("fixture-only-secret")).toBeNull());
    await openAccess();
    expect(screen.getByText("••••••••")).toBeDefined();
    expect(screen.getByRole("button", { name: "Show password" })).toBeDefined();
  });

  it("explains in the access dialog that no password can be shown when none is stored", async () => {
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await openAccess();
    expect(screen.getByText(/isn't stored in readable form/)).toBeDefined();
  });

  it("masks credentials when the profile owner changes to another person", async () => {
    vi.mocked(endpoints.getMentorProfile).mockImplementation(async id => ({ ...profile, user: { ...mentor, id, raw_password: `secret-${id}` } }));
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await openAccess();
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByText("secret-10")).toBeDefined();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Next person" }));
    await waitFor(() => expect(endpoints.getMentorProfile).toHaveBeenCalledWith(11));
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await openAccess();
    expect(screen.getByText("••••••••")).toBeDefined();
    expect(screen.getByRole("button", { name: "Show password" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Hide password" })).toBeNull();
    expect(screen.queryByText("secret-10")).toBeNull();
    expect(screen.queryByText("secret-11")).toBeNull();
  });

  it("moves selection and focus together with arrow, End and Home keys", async () => {
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    screen.getByRole("tab", { name: "Courses" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Performance" }));
    expect(screen.getByRole("tab", { name: "Performance" }).getAttribute("aria-selected")).toBe("true");
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Documents" }));
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Courses" }));
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Documents" }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows analytics points above 100 unchanged and never with a percent unit", async () => {
    vi.mocked(endpoints.getMentorAnalytics).mockResolvedValue({ ...analytics, average_student_score: 123.4 });
    setup({ profileTab: "performance" });
    await screen.findByText("123.4");
    const fact = screen.getByText("Points per period").closest("div");
    expect(fact?.textContent).not.toContain("%");
  });

  it("shows a genuine zero average result as exactly 0% in the header", async () => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValue({ ...profile, active_students_count: 7, avg_score_defined_ratios_mean: 0 });
    setup({ profileTab: "performance" });
    await screen.findByText("62");
    const fact = document.querySelector("[data-profile-summary]");
    expect(fact?.textContent).toContain("0%");
    expect(fact?.textContent).not.toContain("—");
  });
});
