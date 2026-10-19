import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/authStore";
import * as endpoints from "../lib/users/endpoints";
import { AuthApiError } from "../lib/auth/errors";
import type { MentorAnalyticsResponse } from "../lib/users/types";
import { profile, analytics, navigateRoute, setup, registerMentorProfileHooks } from "./MentorProfileTestSupport";

registerMentorProfileHooks();

describe("Mentor profile authorization and state", () => {
  it("initial loading exposes no identity and initial failure recovers through Retry", async () => {
    let fail: (error: Error) => void = () => { throw new Error("Request not started"); };
    vi.mocked(endpoints.getMentorProfile).mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; })).mockResolvedValue(profile);
    setup();
    expect(document.querySelector("[data-loading-avatar]")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Alisher Navoiy" })).toBeNull();
    await act(async () => { fail(new AuthApiError(503, "Unavailable")); });
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(document.querySelector("[data-loading-avatar]")).toBeNull();
  });

  it("analytics loading keeps the loaded profile and never shows substitute totals", async () => {
    let finish: (value: MentorAnalyticsResponse) => void = () => { throw new Error("Request not started"); };
    vi.mocked(endpoints.getMentorAnalytics).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    setup({ profileTab: "performance" });
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(screen.getByText("Loading course and student totals…")).toBeDefined();
    expect(screen.queryByText("19")).toBeNull();
    await act(async () => { finish(analytics); });
    await screen.findByText("19");
    expect(screen.queryByText("Loading course and student totals…")).toBeNull();
  });

  it("failed deletion keeps confirmation and enables a successful retry without duplicate writes", async () => {
    let fail: (error: Error) => void = () => { throw new Error("Request not started"); };
    const deletion = vi.spyOn(endpoints, "deleteUser").mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; })).mockResolvedValue(undefined);
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await userEvent.click(screen.getByRole("button", { name: "Teacher actions: Alisher Navoiy" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.dblClick(within(dialog).getByRole("button", { name: "Delete" }));
    expect(deletion).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeDefined();
    await act(async () => { fail(new AuthApiError(503, "Unavailable")); });
    await screen.findByText("Failed to delete teacher account. The teacher was not deleted.");
    expect(screen.getByTestId("location").textContent).toBe("/mentors/10");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await screen.findByRole("heading", { name: "Teacher directory" });
    expect(deletion).toHaveBeenCalledTimes(2);
  });

  it("renders one defined-ratio summary, scoped active courses and three associated tabs", async () => {
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.queryByRole("tab", { name: "Analytics" })).toBeNull();
    expect(screen.getByRole("link", { name: "Advanced Mathematics" }).getAttribute("href")).toBe("/courses/2");
    const summary = document.querySelector("[data-profile-summary]");
    expect(summary?.textContent).toContain("70");
    expect(summary?.textContent).not.toContain("46.67");
    for (const tab of screen.getAllByRole("tab")) expect(document.getElementById(tab.getAttribute("aria-controls") || "")).not.toBeNull();
  });

  it.each([null, 0, 123.456])("keeps missing and raw score %s distinct without clamping", async score => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValue({ ...profile, avg_score_defined_ratios_mean: score });
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    const summary = document.querySelector("[data-profile-summary]");
    expect(summary?.textContent).toContain(score === null ? "—Score unavailable" : score === 0 ? "0" : "123.5");
    if (score !== null) expect(summary?.textContent).not.toContain("Score unavailable");
  });

  it("mentor self returns to Dashboard and never sees admin actions", async () => {
    useAuthStore.setState({ role: "mentor", userId: 10 });
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(screen.getByRole("link", { name: "Back to Dashboard" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button", { name: "Edit Teacher" })).toBeNull();
    expect(screen.queryByText("Account access")).toBeNull();
    expect(endpoints.getMentorProfile).toHaveBeenCalledWith(10);
  });

  it.each(["student", "accountant", "mentor"] as const)("does not query the workspace for unauthorized %s", role => {
    useAuthStore.setState({ role, userId: 99 });
    setup();
    expect(endpoints.getMentorProfile).not.toHaveBeenCalled();
    expect(endpoints.getMentorAnalytics).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Alisher Navoiy" })).toBeNull();
  });

  it.each(["0", "1e3", "invalid", "9007199254740992"])("invalid identity %s never becomes a request", id => {
    setup(undefined, `/mentors/${id}`);
    expect(endpoints.getMentorProfile).not.toHaveBeenCalled();
    expect(endpoints.getMentorAnalytics).not.toHaveBeenCalled();
  });

  it("analytics failure retains identity and provides independent Retry without substitute values", async () => {
    vi.mocked(endpoints.getMentorAnalytics).mockRejectedValueOnce(new AuthApiError(503, "Unavailable")).mockResolvedValue(analytics);
    setup({ profileTab: "performance" });
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect((await screen.findByRole("alert")).textContent).toContain("These totals are unavailable");
    expect(screen.queryByText("19")).toBeNull();
    expect(screen.queryByText("62")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("19");
    expect(screen.getByText("62")).toBeDefined();
    expect(screen.getByText(/this is not a percentage/)).toBeDefined();
  });

  it("zero raw points with recorded summaries remains zero and empty summaries are explained", async () => {
    vi.mocked(endpoints.getMentorAnalytics).mockResolvedValueOnce({ ...analytics, average_student_score: 0 }).mockResolvedValue({ ...analytics, average_student_score: 0, average_student_score_summary_count: 0, average_student_score_grading_state: "missing" });
    const queryClient = setup({ profileTab: "performance" });
    await screen.findByText("19");
    expect(screen.getByText("0")).toBeDefined();
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["users", "mentors", "analytics", 10] }); });
    await screen.findByText("No period summaries have been recorded.");
    expect(screen.queryByText("0")).toBeNull();
  });

  it("empty active courses explain the supported next state", async () => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValue({ ...profile, active_courses: [] });
    setup();
    await screen.findByText("No active courses");
    expect(screen.getByText(/Archived courses remain in the course directory/)).toBeDefined();
  });

  it("preserves Performance through an authorized course visit and browser Back", async () => {
    setup({ profileTab: "performance" });
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await userEvent.click(screen.getByRole("link", { name: "Advanced Mathematics" }));
    await userEvent.click(screen.getByRole("button", { name: "Browser Back" }));
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(screen.getByRole("tab", { name: "Performance" }).getAttribute("aria-selected")).toBe("true");
  });

  it("does not navigate on abandoned deletion after a person returns", async () => {
    let completeDelete: () => void = () => { throw new Error("Delete request was not started"); };
    vi.spyOn(endpoints, "deleteUser").mockReturnValue(new Promise<void>(resolve => { completeDelete = resolve; }));
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await userEvent.click(screen.getByRole("button", { name: "Teacher actions: Alisher Navoiy" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(endpoints.deleteUser).toHaveBeenCalledWith(10));
    act(() => navigateRoute("/mentors/11"));
    expect(screen.getByTestId("location").textContent).toBe("/mentors/11");
    act(() => navigateRoute("/mentors/10"));
    await act(async () => { completeDelete(); });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/mentors/10"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
