import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "../store/authStore";
import * as userHooks from "../lib/users/hooks";
import * as userEndpoints from "../lib/users/endpoints";
import type { StudentProfileResponse } from "../lib/users/types";
import { mockProfileResponse, renderStudentProfile, registerStudentProfileHooks } from "./StudentProfileTestSupport";

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
    expect(coursePills.map((pill) => pill.textContent)).toEqual(["Withdrawn"]);

    await user.click(screen.getByRole("tab", { name: "Progress" }));
    const rows = await screen.findAllByTestId("course-progress-row");
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.querySelectorAll('[data-testid="course-stage-pill"]').length === 1)).toHaveLength(1);
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

  it("opens the password SMS dialog from the actions menu for staff, with resend and the deliveries list", async () => {
    const user = userEvent.setup();
    const list = vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockResolvedValue([]);
    const resend = vi.spyOn(userEndpoints, "resendPasswordSms").mockResolvedValue({ destination: "student_phone", channel: "student_phone", masked_phone: "***0042" });
    renderStudentProfile();

    await user.click(screen.getByRole("button", { name: "Student actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Send login details" }));

    expect(await screen.findByText(/No SMS sent yet/)).toBeDefined();
    expect(list).toHaveBeenCalledWith(42);
    await user.click(screen.getByRole("radio", { name: /Student phone/ }));
    await user.click(screen.getByRole("button", { name: "Resend password" }));
    expect(await screen.findByText("New code sent by SMS to the student phone ***0042.")).toBeDefined();
    expect(resend).toHaveBeenCalledWith(42, "student_phone");
  });

  it("does not request deliveries until the dialog is opened", () => {
    const list = vi.spyOn(userEndpoints, "listPasswordSmsDeliveries").mockResolvedValue([]);
    renderStudentProfile();
    expect(list).not.toHaveBeenCalled();
  });

  it("hides account access from non-superadmin roles", () => {
    useAuthStore.setState({ role: "mentor", userId: 7 });
    renderStudentProfile();
    expect(screen.queryByRole("button", { name: "Student actions" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Send login details" })).toBeNull();
  });
});
