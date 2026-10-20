import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import i18n from "../i18n";
import * as userHooks from "../lib/users/hooks";
import * as userEndpoints from "../lib/users/endpoints";
import * as enrollmentEndpoints from "../lib/enrollments/endpoints";
import * as enrollmentHooks from "../lib/enrollments/hooks";
import type { User } from "../lib/users/types";
import type { EnrollmentResponse } from "../lib/enrollments/types";
import { mockStudentUser, mockProfileResponse, renderStudentProfile, registerStudentProfileHooks } from "./StudentProfileTestSupport";

registerStudentProfileHooks();

describe("StudentProfile Component", () => {
  it("keeps a new deletion pending when an abandoned operation finishes", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    const enrollmentResolvers: ((items: EnrollmentResponse[]) => void)[] = [];
    const fetchSpy = vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockImplementation(
      () => new Promise((resolve) => { enrollmentResolvers.push(resolve); }),
    );
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);
    const deleteMutateAsync = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteMutateAsync,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    renderStudentProfile();
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await user.click(screen.getByTestId("switch-profile"));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Delete Student/i })).toBeNull());
    await user.click(screen.getByTestId("return-profile"));
    await waitFor(() => expect(screen.getByText("Rustam Karimov")).toBeDefined());
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    await act(async () => {
      enrollmentResolvers[0]?.([{ id: 501, student_id: 42, course_id: 101, status: "active" } as unknown as EnrollmentResponse]);
    });
    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    const confirmButton = screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0];
    expect(confirmButton.hasAttribute("disabled")).toBe(true);
    await act(async () => { enrollmentResolvers[1]?.([]); });
    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledTimes(1));
    expect(deleteMutateAsync).toHaveBeenCalledWith(42);
    expect(screen.getByTestId("students-dir")).toBeDefined();
  });

  it("keeps the identity form open after deferred photo save and Cancel discards only the dirty identity", async () => {
    const user = userEvent.setup();
    let resolveUpload: ((student: User) => void) | undefined;
    vi.spyOn(userEndpoints, "uploadAvatar").mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve; }));
    const updateUserMutateAsync = vi.fn();
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({
      mutateAsync: updateUserMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useUpdateUser>);
    const refetch = vi.fn();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
      data: mockProfileResponse,
      isLoading: false,
      isError: false,
      refetch,
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:deferred-profile-photo");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
    renderStudentProfile();
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    const firstName = screen.getByLabelText(/First Name/i);
    await user.clear(firstName);
    await user.type(firstName, "Dirty Name");
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "avatar.jpg", { type: "image/jpeg" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);
    await waitFor(() => expect(resolveUpload).toBeDefined());
    await act(async () => {
      resolveUpload?.({ ...mockStudentUser, photo_path: "/uploads/saved-photo.jpg", thumbnail_path: "/uploads/saved-thumb.jpg" });
    });
    expect(screen.getByRole("dialog")).toBeDefined();
    expect((screen.getByLabelText(/First Name/i) as HTMLInputElement).value).toBe("Dirty Name");
    expect(refetch).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(updateUserMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /Edit Student/i })).toBeNull();
  });

  it("suppresses a deferred identity-save callback after the route owner changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    let resolveUpdate: ((student: User) => void) | undefined;
    const mutateAsync = vi.fn(() => new Promise<User>((resolve) => { resolveUpdate = resolve; }));
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useUpdateUser>);
    renderStudentProfile();
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    const firstName = screen.getByLabelText(/First Name/i);
    await user.clear(firstName);
    await user.type(firstName, "Saved Late");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await user.click(screen.getByTestId("switch-profile"));
    expect(screen.getByText("New Owner Karimov")).toBeDefined();
    await act(async () => resolveUpdate?.({ ...mockStudentUser, first_name: "Saved Late" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Student updated successfully")).toBeNull();
  });

  it.each(["withdrawal", "account"] as const)("reconciles committed withdrawals and reports a partial %s failure", async (failureStage) => {
    const user = userEvent.setup();
    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([
      { id: 501, student_id: 42, course_id: 101, status: "active" },
      { id: 502, student_id: 42, course_id: 102, status: "active" },
    ] as EnrollmentResponse[]);
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);
    if (failureStage === "withdrawal") withdrawSpy.mockResolvedValueOnce({} as never).mockRejectedValueOnce(new Error("withdrawal failed"));
    const deleteMutateAsync = vi.fn().mockRejectedValue(new Error("account deletion failed"));
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({ mutateAsync: deleteMutateAsync } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    renderStudentProfile();
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await screen.findByText(i18n.t("students:form.deleteFailedAfterWithdraw"));
    expect(withdrawSpy).toHaveBeenCalledTimes(2);
    expect(deleteMutateAsync).toHaveBeenCalledTimes(failureStage === "account" ? 1 : 0);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["enrollments"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["users", "students", "profile", 42] });
    expect(screen.queryByTestId("students-dir")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0].hasAttribute("disabled")).toBe(false);
  });

  it("allows a current-owner deletion after StrictMode effect remount", async () => {
    const user = userEvent.setup();
    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([]);
    const deleteMutateAsync = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({ mutateAsync: deleteMutateAsync } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    renderStudentProfile(["/students/42"], true);
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledWith(42));
    expect(screen.getByTestId("students-dir")).toBeDefined();
  });

  it("handles superadmin deletion workflow with enrollment withdrawal and navigation", async () => {
    const user = userEvent.setup();
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);
    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([
      { id: 501, student_id: 42, course_id: 101, status: "active" },
    ] as unknown as EnrollmentResponse[]);
    const deleteMutateAsync = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteMutateAsync,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);

    renderStudentProfile();

    const actionsBtn = screen.getAllByRole("button", { name: /Student actions/i })[0];
    await user.click(actionsBtn);

    const deleteMenuItem = await screen.findByRole("menuitem", { name: /Delete/i });
    await user.click(deleteMenuItem);

    const confirmHeading = screen.getByRole("heading", { name: /Delete Student/i });
    expect(confirmHeading).toBeDefined();

    const deleteBtn = screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0];
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(withdrawSpy).toHaveBeenCalledWith(501);
      expect(deleteMutateAsync).toHaveBeenCalledWith(42);
      expect(screen.getByTestId("students-dir")).toBeDefined();
    });
  });
});
