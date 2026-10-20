import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../store/authStore";
import * as userHooks from "../lib/users/hooks";
import * as enrollmentEndpoints from "../lib/enrollments/endpoints";
import * as enrollmentHooks from "../lib/enrollments/hooks";
import type { EnrollmentResponse } from "../lib/enrollments/types";
import { mockStudentUser, mockProfileResponse, renderStudentProfile, registerStudentProfileHooks } from "./StudentProfileTestSupport";

registerStudentProfileHooks();

describe("StudentProfile Component", () => {
  it("clears owner-bound edit state and resets the selected tab when the profile route changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({ data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42 } }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    expect(screen.getByRole("dialog")).toBeDefined();
    await user.click(screen.getByTestId("switch-profile"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("tab", { name: "Courses" }).getAttribute("aria-selected")).toBe("true");
  });

  it("stops a deferred delete chain after the profile owner changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    let resolveEnrollments: ((items: EnrollmentResponse[]) => void) | undefined;
    const fetchSpy = vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockImplementation(
      () => new Promise((resolve) => { resolveEnrollments = resolve; }),
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
    await act(async () => {
      resolveEnrollments?.([{ id: 501, student_id: 42, course_id: 101, status: "active" } as unknown as EnrollmentResponse]);
    });
    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("New Owner Karimov")).toBeDefined();
  });

  it("does not revive an abandoned delete after leaving and returning to the same profile", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    let resolveEnrollments: ((items: EnrollmentResponse[]) => void) | undefined;
    const fetchSpy = vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockImplementation(
      () => new Promise((resolve) => { resolveEnrollments = resolve; }),
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
    await act(async () => {
      resolveEnrollments?.([{ id: 501, student_id: 42, course_id: 101, status: "active" } as unknown as EnrollmentResponse]);
    });
    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Rustam Karimov")).toBeDefined();
  });

  it("does not replay navigation after an abandoned successful delete", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([]);
    let resolveDeletion: ((value: boolean) => void) | undefined;
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);
    const deleteMutateAsync = vi.fn(() => new Promise<boolean>((resolve) => { resolveDeletion = resolve; }));
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteMutateAsync,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    renderStudentProfile();
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledWith(42));
    await user.click(screen.getByTestId("switch-profile"));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Delete Student/i })).toBeNull());
    await user.click(screen.getByTestId("return-profile"));
    await waitFor(() => expect(screen.getByText("Rustam Karimov")).toBeDefined());
    await act(async () => {
      resolveDeletion?.(true);
    });
    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(deleteMutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("students-dir")).toBeNull();
    expect(screen.getByText("Rustam Karimov")).toBeDefined();
  });

  it("stops after a committed withdrawal when its operation owner was abandoned", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([
      { id: 501, student_id: 42, course_id: 101, status: "active" },
      { id: 502, student_id: 42, course_id: 102, status: "active" },
    ] as EnrollmentResponse[]);
    let resolveWithdrawal: ((item: EnrollmentResponse) => void) | undefined;
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockImplementation(
      () => new Promise((resolve) => { resolveWithdrawal = resolve; }),
    );
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const deleteMutateAsync = vi.fn().mockResolvedValue(true);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteMutateAsync,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);
    renderStudentProfile();
    await user.click(screen.getAllByRole("button", { name: /Student actions/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Delete/i }));
    await user.click(screen.getAllByRole("button", { name: /^Delete$/i }).slice(-1)[0]);
    await waitFor(() => expect(withdrawSpy).toHaveBeenCalledWith(501));
    await user.click(screen.getByTestId("switch-profile"));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Delete Student/i })).toBeNull());
    await user.click(screen.getByTestId("return-profile"));
    await waitFor(() => expect(screen.getByText("Rustam Karimov")).toBeDefined());
    await act(async () => {
      resolveWithdrawal?.({ id: 501, student_id: 42, course_id: 101, status: "withdrawn" } as EnrollmentResponse);
    });
    expect(withdrawSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["enrollments"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["users", "students", "profile", 42] });
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Rustam Karimov")).toBeDefined();
  });

  it("does not revive an abandoned delete after an auth owner ABA transition", async () => {
    const user = userEvent.setup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation((id) => ({
      data: { ...mockProfileResponse, user: { ...mockStudentUser, id: id ?? 42, first_name: id === 43 ? "New Owner" : "Rustam" } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    let resolveEnrollments: ((items: EnrollmentResponse[]) => void) | undefined;
    const fetchSpy = vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockImplementation(
      () => new Promise((resolve) => { resolveEnrollments = resolve; }),
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
    act(() => {
      useAuthStore.setState({ userId: 2 });
      useAuthStore.setState({ userId: 1 });
    });
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Delete Student/i })).toBeNull());
    await waitFor(() => expect(screen.getByText("Rustam Karimov")).toBeDefined());
    await act(async () => {
      resolveEnrollments?.([{ id: 501, student_id: 42, course_id: 101, status: "active" } as unknown as EnrollmentResponse]);
    });
    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Rustam Karimov")).toBeDefined();
  });
});
