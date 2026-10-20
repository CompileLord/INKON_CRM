import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "../store/authStore";
import * as userHooks from "../lib/users/hooks";
import type { StudentProfileResponse } from "../lib/users/types";
import { mockStudentUser, mockProfileResponse, renderStudentProfile, registerStudentProfileHooks } from "./StudentProfileTestSupport";

registerStudentProfileHooks();

describe("StudentProfile Component", () => {
  it("renders mentor view with assigned course links and non-navigable unassigned courses", () => {
    useAuthStore.setState({ role: "mentor", userId: 7 });
    renderStudentProfile();

    expect(screen.queryByRole("button", { name: /^Edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Student actions/i })).toBeNull();

    const mathLink = screen.getByRole("link", { name: /Advanced Mathematics/ });
    expect(mathLink.getAttribute("href")).toBe("/courses/101");

    expect(screen.queryByRole("link", { name: /English Literature/ })).toBeNull();
    expect(screen.getAllByText("English Literature")).toHaveLength(1);

    const backLink = screen.getByRole("link", { name: /Back to Dashboard/i });
    expect(backLink).toBeDefined();
  });

  it("renders mentor return link to assigned course roster when coming from course", () => {
    useAuthStore.setState({ role: "mentor", userId: 7 });
    renderStudentProfile([
      {
        pathname: "/students/42",
        state: { from: "/courses/101" },
      },
    ]);

    const backLink = screen.getByRole("link", { name: /Back to Course/i });
    expect(backLink).toBeDefined();
    expect(backLink.getAttribute("href")).toBe("/courses/101");
  });

  it("falls back to Dashboard for a journal path whose course ownership cannot be verified", () => {
    useAuthStore.setState({ role: "mentor", userId: 7 });
    renderStudentProfile([{ pathname: "/students/42", state: { from: "/journals/101" } }]);
    expect(screen.getByRole("link", { name: /Back to Dashboard/i }).getAttribute("href")).toBe("/");
  });

  it("shows exactly one status pill per course: the stage, or the enrollment state when it is not active", async () => {
    const user = userEvent.setup();
    const withdrawnProfile: StudentProfileResponse = {
      ...mockProfileResponse,
      courses: [mockProfileResponse.courses[0], { ...mockProfileResponse.courses[1], enrollment_status: "withdrawn" }],
    };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: withdrawnProfile, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();

    expect(screen.queryByText("Enrollment:")).toBeNull();
    const coursePills = screen.getAllByTestId("course-stage-pill");
    expect(coursePills.map((pill) => pill.textContent)).toEqual(["Active", "Withdrawn"]);

    await user.click(screen.getByRole("tab", { name: "Progress" }));
    const rows = await screen.findAllByTestId("course-progress-row");
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.querySelectorAll('[data-testid="course-stage-pill"]')).toHaveLength(1));
  });

  it("renders student self-view with /my/courses links and no management controls", () => {
    useAuthStore.setState({ role: "student", userId: 42 });
    renderStudentProfile([
      {
        pathname: "/students/42",
        state: { from: "/my/courses" },
      },
    ]);

    expect(screen.queryByRole("button", { name: /^Edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Student actions/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Back to Students/i })).toBeNull();

    const backLink = screen.getByRole("link", { name: /Back to My Courses/i });
    expect(backLink).toBeDefined();
    expect(backLink.getAttribute("href")).toBe("/my/courses");

    const mathLink = screen.getByRole("link", { name: /Advanced Mathematics/ });
    expect(mathLink.getAttribute("href")).toBe("/my/courses/101");

    const englishLink = screen.getByRole("link", { name: /English Literature/ });
    expect(englishLink.getAttribute("href")).toBe("/my/courses/102");
  });

  it("falls back to the Courses tab for malformed profileTab history state", () => {
    renderStudentProfile([{ pathname: "/students/42", state: { profileTab: "not-a-profile-tab" } }]);
    expect(screen.getByRole("tab", { name: "Courses" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Courses" }).hidden).toBe(false);
  });

  it("shows truthful unavailable copy in the account access popover when no plaintext credentials exist", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    await user.click(screen.getByRole("button", { name: "Student actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Account access" }));

    expect(await screen.findByText(/The password isn't stored in readable form/i)).toBeDefined();
  });

  it("resets a revealed password to masked when the account access popover is closed and reopened", async () => {
    const user = userEvent.setup();
    const profileWithRawPassword: StudentProfileResponse = {
      ...mockProfileResponse,
      user: { ...mockStudentUser, raw_password: "InitialPassword123!" },
    };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: profileWithRawPassword, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));

    renderStudentProfile();

    const openAccess = async (): Promise<void> => {
      await user.click(screen.getByRole("button", { name: "Student actions" }));
      await user.click(await screen.findByRole("menuitem", { name: "Account access" }));
    };
    await openAccess();
    expect(await screen.findByText("••••••••")).toBeDefined();
    expect(screen.queryByText("InitialPassword123!")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Show password/i }));
    expect(screen.getByText("InitialPassword123!")).toBeDefined();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("InitialPassword123!")).toBeNull());
    await openAccess();
    expect(await screen.findByText("••••••••")).toBeDefined();
    expect(screen.queryByText("InitialPassword123!")).toBeNull();
  });

  it("hides account access from non-superadmin roles", () => {
    useAuthStore.setState({ role: "mentor", userId: 7 });
    renderStudentProfile();
    expect(screen.queryByRole("button", { name: "Student actions" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Account access" })).toBeNull();
  });
});
