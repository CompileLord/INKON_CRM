import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { useAuthStore } from "../store/authStore";
import * as endpoints from "../lib/users/endpoints";
import * as documents from "../lib/documents/endpoints";
import { AuthApiError } from "../lib/auth/errors";
import { mentor, registerMentorProfileHooks, setup } from "./MentorProfileTestSupport";
import type { StudentMentorCardResponse } from "../lib/users/types";
import i18n from "../i18n";
import { isPathAllowed } from "../lib/auth/roleAccess";

const card: StudentMentorCardResponse = { user: { id: 10, first_name: "Alisher", last_name: "Navoiy", photo_path: null, thumbnail_path: null }, active_courses: [{ id: 2, title: "Enrolled Mathematics", photo_path: null }] };
registerMentorProfileHooks();
describe("student mentor card", (): void => {
  it("renders the narrow fixture and links only returned courses without staff requests", async (): Promise<void> => {
    useAuthStore.setState({ role: "student", userId: 42 });
    vi.mocked(endpoints.getMentorProfile).mockResolvedValue(card);
    setup();
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(screen.getByRole("link", { name: "Enrolled Mathematics" }).getAttribute("href")).toBe("/my/courses/2");
    expect(screen.queryByText("Advanced Mathematics")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(endpoints.getMentorAnalytics).not.toHaveBeenCalled();
    expect(documents.fetchDocuments).not.toHaveBeenCalled();
    expect(isPathAllowed("student", "/mentors/10", 42)).toBe(true);
    expect(isPathAllowed("student", "/mentors", 42)).toBe(false);
  });
  it("omits populated private fields even if stale staff data is returned", async (): Promise<void> => {
    useAuthStore.setState({ role: "student", userId: 42 });
    vi.mocked(endpoints.getMentorProfile).mockResolvedValue({ ...card, user: { ...mentor, raw_password: "private-password", parent_phone: "+992999999999" }, active_students_count: 500, active_courses: [{ id: 99, title: "Unrelated private course" }] } as unknown as StudentMentorCardResponse);
    setup();
    await screen.findByText("Couldn't load the profile");
    expect(screen.queryByRole("heading", { name: "Alisher Navoiy" })).toBeNull();
    for (const secret of [mentor.email, mentor.phone!, mentor.date_of_birth!, "+992999999999", "private-password", "500", "Unrelated private course"]) expect(document.body.textContent).not.toContain(secret);
    expect(screen.queryByRole("button", { name: /edit|delete|password/i })).toBeNull();
  });
  it("shows loading then empty enrolled courses", async (): Promise<void> => {
    useAuthStore.setState({ role: "student", userId: 42 });
    vi.mocked(endpoints.getMentorProfile).mockResolvedValue({ ...card, active_courses: [] });
    setup();
    expect(screen.getByRole("status", { name: i18n.t("common:loading") }).getAttribute("aria-label")).toBe(i18n.t("common:loading"));
    await screen.findByText("No shared courses");
  });
  it("denies a non-enrolled student without exposing identity", async (): Promise<void> => {
    useAuthStore.setState({ role: "student", userId: 42 });
    vi.mocked(endpoints.getMentorProfile).mockRejectedValue(new AuthApiError(403, "Not enrolled"));
    setup();
    await screen.findByText("No access to this profile");
    expect(screen.queryByText("Alisher Navoiy")).toBeNull();
  });
  it("retries a failed card request", async (): Promise<void> => {
    useAuthStore.setState({ role: "student", userId: 42 });
    vi.mocked(endpoints.getMentorProfile).mockRejectedValueOnce(new AuthApiError(503, "Unavailable")).mockResolvedValue(card);
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Alisher Navoiy" });
    expect(endpoints.getMentorProfile).toHaveBeenCalledTimes(2);
  });
});
