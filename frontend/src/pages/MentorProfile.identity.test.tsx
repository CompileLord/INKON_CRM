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
    expect(screen.getByText("Loading results")).toBeDefined();
    expect(screen.queryByText("19")).toBeNull();
    await act(async () => { finish(analytics); });
    await screen.findByText("19");
    expect(screen.queryByText("Loading results")).toBeNull();
  });

  it("failed deletion keeps confirmation and enables a successful retry without duplicate writes", async () => {
    let fail: (error: Error) => void = () => { throw new Error("Request not started"); };
    const deletion = vi.spyOn(endpoints, "deleteUser").mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; })).mockResolvedValue(undefined);
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await userEvent.click(screen.getByRole("button", { name: "Teacher actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete teacher" }));
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
    expect(screen.getByRole("link", { name: /Advanced Mathematics/ }).getAttribute("href")).toBe("/courses/2");
    const summary = document.querySelector("[data-profile-summary]");
    expect(summary?.textContent).toContain("70%");
    expect(summary?.textContent).not.toContain("46.67");
    const selected = screen.getByRole("tab", { selected: true });
    expect(document.getElementById(selected.getAttribute("aria-controls") || "")).not.toBeNull();
  });

  it.each([[null, "—"], [0, "0%"], [123.456, "—"]])("shows the average result %s as %s and never a percentage above 100", async (score, expected) => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValue({ ...profile, avg_score_defined_ratios_mean: score });
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    const tile = screen.getByText("Average result").closest("[data-stat-tile]") as HTMLElement;
    expect(tile.textContent).toContain(expected);
    expect(tile.textContent).not.toContain("123");
  });

  it("shows exactly three tiles in one stat group", async () => {
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    const group = document.querySelector("[data-profile-summary] [data-stat-group]") as HTMLElement;
    expect(Array.from(group.querySelectorAll("dt")).map((node) => node.textContent)).toEqual(["Active courses", "Active students", "Average result"]);
    expect(document.querySelectorAll("[data-entity-header]")).toHaveLength(1);
  });

  it("mentor self returns to Dashboard and never sees admin actions", async () => {
    useAuthStore.setState({ role: "mentor", userId: 10 });
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(screen.getByRole("link", { name: "Back to Dashboard" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Teacher actions" })).toBeNull();
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
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load the results");
    expect(screen.queryByText("19")).toBeNull();
    expect(screen.queryByText("62")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("19");
    expect(screen.getByText("62")).toBeDefined();
    expect(screen.getByText("What a student scores in one period on average.")).toBeDefined();
  });

  it("zero points with recorded summaries remains 0 and without summaries shows a dash", async () => {
    vi.mocked(endpoints.getMentorAnalytics).mockResolvedValueOnce({ ...analytics, average_student_score: 0 }).mockResolvedValue({ ...analytics, average_student_score: 0, average_student_score_summary_count: 0, average_student_score_grading_state: "missing" });
    const queryClient = setup({ profileTab: "performance" });
    await screen.findByText("19");
    const pointsFact = (): HTMLElement => screen.getByText("Points per period").closest("div") as HTMLElement;
    expect(pointsFact().textContent).toContain("0What a student");
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["users", "mentors", "analytics", 10] }); });
    await waitFor(() => expect(pointsFact().textContent).toContain("—"));
  });

  it("explains an empty performance tab in plain language when nothing is graded", async () => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValue({ ...profile, avg_score_defined_ratio_count: 0, avg_score_defined_ratios_mean: null, avg_score_summary_count: 0 });
    vi.mocked(endpoints.getMentorAnalytics).mockResolvedValue({ ...analytics, average_student_score_summary_count: 0 });
    setup({ profileTab: "performance" });
    expect(await screen.findByText("No graded periods yet")).toBeDefined();
    expect(screen.getByText(/Results appear after lessons/)).toBeDefined();
  });

  it("empty active courses explain the supported next state", async () => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValue({ ...profile, active_courses: [] });
    setup();
    await screen.findByText("No active courses");
    expect(screen.getByText(/Courses assigned to this teacher will appear here/)).toBeDefined();
  });

  it("keeps the selected tab in the tab query parameter through a course visit and browser Back", async () => {
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await userEvent.click(screen.getByRole("tab", { name: "Performance" }));
    expect(screen.getByTestId("location").textContent).toBe("/mentors/10?tab=performance");
    await userEvent.click(screen.getByRole("tab", { name: "Courses" }));
    expect(screen.getByTestId("location").textContent).toBe("/mentors/10");
    await userEvent.click(screen.getByRole("link", { name: /Advanced Mathematics/ }));
    await userEvent.click(screen.getByRole("button", { name: "Browser Back" }));
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(screen.getByRole("tab", { name: "Courses" }).getAttribute("aria-selected")).toBe("true");
  });

  it("restores the tab from the URL on direct entry", async () => {
    setup(undefined, "/mentors/10?tab=documents");
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(screen.getByRole("tab", { name: "Documents" }).getAttribute("aria-selected")).toBe("true");
  });

  it("explains performance in short sentences with the points first", async () => {
    setup({ profileTab: "performance" });
    await screen.findByText("19");
    const facts = Array.from(document.querySelectorAll("[role='tabpanel'] dl > div")).map((node) => node.textContent);
    expect(facts[0]).toBe("Points per period62What a student scores in one period on average.");
    expect(facts[1]).toContain("Average result70%");
    expect(facts[2]).toContain("Students19");
    expect(screen.getByText(/^Based on \d+ graded periods?\.$/)).toBeDefined();
  });

  it("does not navigate on abandoned deletion after a person returns", async () => {
    let completeDelete: () => void = () => { throw new Error("Delete request was not started"); };
    vi.spyOn(endpoints, "deleteUser").mockReturnValue(new Promise<void>(resolve => { completeDelete = resolve; }));
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await userEvent.click(screen.getByRole("button", { name: "Teacher actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete teacher" }));
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
