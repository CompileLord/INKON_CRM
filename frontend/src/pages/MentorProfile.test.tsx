import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import i18n from "../i18n";
import { MentorProfile } from "./MentorProfile";
import { useAuthStore } from "../store/authStore";
import * as endpoints from "../lib/users/endpoints";
import { AuthApiError } from "../lib/auth/errors";
import type { MentorProfileResponse, MentorAnalyticsResponse, User } from "../lib/users/types";
import { clearSavedMentorsReturnContext } from "../lib/users/returnContext";

const mentor: User = { id: 10, first_name: "Alisher", last_name: "Navoiy", email: "alisher@example.com", role: "mentor", phone: "+992900000010", date_of_birth: "1980-02-09", parent_phone: null, parent_telegram_chat_id: null, photo_path: null, thumbnail_path: null, payment_day_of_month: null, must_set_password: false, is_deleted: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
const profile: MentorProfileResponse = { user: mentor, active_courses: [{ id: 2, title: "Advanced Mathematics", description: "", photo_path: null, start_date: "2026-01-01", end_date: "2026-12-31", exam_type: "monthly", price: "1200.00", mentor_id: 10, status: "active", is_deleted: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }], active_students_count: 5, avg_score: 46.67, active_students_population: "active_enrollments_on_assigned_courses_including_soft_deleted_courses", avg_score_grading_state: "unknown", avg_score_provenance: "unknown", avg_score_basis: "all_summaries_on_courses_currently_assigned_including_soft_deleted_and_archived", avg_score_summary_count: 6, avg_score_defined_ratio_count: 4, avg_score_undefined_ratio_count: 2, avg_score_defined_ratios_mean: 70 };
const analytics: MentorAnalyticsResponse = { active_courses_count: 1, active_courses_population: "active_non_deleted_courses", total_students_count: 19, total_students_population: "non_deleted_enrollments_on_assigned_courses_all_statuses_including_soft_deleted_courses", average_student_score: 62, average_student_score_grading_state: "unknown", average_student_score_provenance: "unknown", average_student_score_basis: "all_summaries_on_non_deleted_courses_including_archived_raw_points", average_student_score_summary_count: 5 };
const clients: QueryClient[] = [];
let navigateRoute: ReturnType<typeof useNavigate> = () => { throw new Error("Router is not mounted"); };

function LocationControls() {
  const location = useLocation();
  const navigate = useNavigate();
  navigateRoute = navigate;
  return <><output data-testid="location">{location.pathname}{location.search}</output><button onClick={() => navigate("/mentors/11")}>Next person</button><button onClick={() => navigate("/mentors/10")}>Return person</button><button onClick={() => navigate(-1)}>Browser Back</button></>;
}

function setup(state?: Record<string, unknown>, path = "/mentors/10") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  clients.push(queryClient);
  render(<QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}><MemoryRouter initialEntries={[{ pathname: path, state }]}><LocationControls /><Routes><Route path="/mentors/:id" element={<MentorProfile />} /><Route path="/mentors" element={<h1>Teacher directory</h1>} /><Route path="/courses/:id" element={<h1>Course destination</h1>} /><Route path="/" element={<h1>Dashboard destination</h1>} /></Routes></MemoryRouter></I18nextProvider></QueryClientProvider>);
  return queryClient;
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 1 });
  clearSavedMentorsReturnContext();
  vi.spyOn(endpoints, "getMentorProfile").mockImplementation(async id => ({ ...profile, user: { ...mentor, id } }));
  vi.spyOn(endpoints, "getMentorAnalytics").mockResolvedValue(analytics);
});
afterEach(async () => {
  cleanup();
  for (const client of clients.splice(0)) { await client.cancelQueries(); client.clear(); }
  vi.restoreAllMocks();
});

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

  it("transient refresh keeps dirty edit and permission denial discards it permanently", async () => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValueOnce(profile).mockRejectedValueOnce(new AuthApiError(503, "Unavailable")).mockRejectedValueOnce(new AuthApiError(403, "Denied")).mockResolvedValue(profile);
    const queryClient = setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    await userEvent.click(screen.getByRole("button", { name: "Edit Teacher" }));
    await userEvent.type(screen.getByLabelText<HTMLInputElement>(/First Name/), " dirty");
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["users", "mentors", "profile", 10] }); });
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>(/First Name/).value).toBe("Alisher dirty");
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["users", "mentors", "profile", 10] }); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("heading", { name: "Alisher Navoiy" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("independent photo completion preserves dirty identity through a failed refresh and Cancel sends no identity write", async () => {
    vi.mocked(endpoints.getMentorProfile).mockResolvedValueOnce(profile).mockRejectedValue(new AuthApiError(503, "Unavailable"));
    vi.spyOn(endpoints, "uploadAvatar").mockResolvedValue({ ...mentor, photo_path: "/storage/avatar/10/photo.jpg", thumbnail_path: "/storage/avatar/10/thumb.jpg" });
    const update = vi.spyOn(endpoints, "updateUser").mockResolvedValue(mentor);
    vi.stubGlobal("URL", class extends URL { static createObjectURL = () => "blob:fixture-photo"; static revokeObjectURL = () => undefined; });
    try {
      setup();
      await screen.findByRole("heading", { name: "Alisher Navoiy" });
      await userEvent.click(screen.getByRole("button", { name: "Edit Teacher" }));
      await userEvent.type(screen.getByLabelText<HTMLInputElement>(/First Name/), " dirty");
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) throw new Error("Existing-account photo picker must exist");
      await userEvent.upload(input, new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", { type: "image/jpeg" }));
      await waitFor(() => expect(endpoints.uploadAvatar).toHaveBeenCalledTimes(1));
      await screen.findByText(/Could not refresh this profile/);
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
    await userEvent.click(screen.getByText("Account access"));
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByText("fixture-only-secret")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Edit Teacher" }));
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
});
