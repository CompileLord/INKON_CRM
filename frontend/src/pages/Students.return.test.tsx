import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "../store/authStore";
import * as userHooks from "../lib/users/hooks";
import * as enrollmentEndpoints from "../lib/enrollments/endpoints";
import * as enrollmentHooks from "../lib/enrollments/hooks";
import type { User } from "../lib/users/types";
import type { EnrollmentResponse } from "../lib/enrollments/types";
import { getSavedStudentsReturnContext, recordStudentsNavigation } from "../lib/users/returnContext";
import { mockStudentsList, mockPaginatedData, renderStudentsPage } from "./StudentsTestSupport";

beforeEach(() => {
  useAuthStore.setState({ role: "superadmin" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Students page", () => {
  it("preserves page 2 return context and restores focus on return from profile", async () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: {
        items: mockStudentsList,
        total: 42,
        page: 2,
        page_size: 20,
        total_pages: 3,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    const { getLocation } = renderStudentsPage(["/students?page=2&pageSize=20"]);

    const studentLinks = screen.getAllByRole("link", { name: /Farrukh Saidov/ });
    const user = userEvent.setup();
    await user.click(studentLinks[0]);

    await waitFor(() => {
      expect(getLocation()?.pathname).toBe("/students/11");
      const state = getLocation()?.state as {
        fromDirectory: { page: number; pageSize: number; studentId: number };
      };
      expect(state.fromDirectory.page).toBe(2);
      expect(state.fromDirectory.studentId).toBe(11);
    });
  });

  it("restores page 2 query, page size, and scroll focus when returning from profile", async () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: {
        items: mockStudentsList,
        total: 42,
        page: 2,
        page_size: 50,
        total_pages: 3,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;

    recordStudentsNavigation({
      query: "Farrukh",
      page: 2,
      pageSize: 50,
      scrollY: 240,
      studentId: 11,
      role: "superadmin",
    });

    const saved = getSavedStudentsReturnContext("superadmin");
    expect(saved).not.toBeNull();
    expect(saved?.query).toBe("Farrukh");

    const { getLocation } = renderStudentsPage(["/students"]);

    await waitFor(() => {
      expect(getLocation()?.search).toContain("page=2");
      expect(getLocation()?.search).toContain("pageSize=50");
      expect(getLocation()?.search).toContain("q=Farrukh");
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 240, behavior: "instant" });
    });
  });

  it("aborts deletion and performs zero writes when enrollment fetch fails, keeping target for retry", async () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    const deleteUserSpy = vi.fn();
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteUserSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);

    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockRejectedValue(
      new Error("Network failed"),
    );
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment");

    renderStudentsPage();
    const user = userEvent.setup();

    const menuButtons = screen.getAllByRole("button", { name: "Student actions: Farrukh Saidov" });
    await user.click(menuButtons[0]);

    const deleteMenuItem = await screen.findByRole("menuitem", { name: "Delete" });
    await user.click(deleteMenuItem);

    const confirmDeleteButton = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Failed to withdraw student's active enrollments. The student account was not deleted.",
        ),
      ).toBeDefined();
    });

    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(deleteUserSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/Farrukh Saidov will withdraw all active enrollments/i)).toBeDefined();
  });

  it("shows partial withdrawal error when deleteUser fails after withdrawing active enrollments", async () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    const deleteUserSpy = vi.fn().mockRejectedValue(new Error("Delete failed"));
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteUserSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);

    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([
      { id: 501, status: "active" } as unknown as EnrollmentResponse,
    ]);
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);

    renderStudentsPage();
    const user = userEvent.setup();

    const menuButtons = screen.getAllByRole("button", { name: "Student actions: Farrukh Saidov" });
    await user.click(menuButtons[0]);

    const deleteMenuItem = await screen.findByRole("menuitem", { name: "Delete" });
    await user.click(deleteMenuItem);

    const confirmDeleteButton = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(withdrawSpy).toHaveBeenCalledWith(501);
      expect(deleteUserSpy).toHaveBeenCalledWith(11);
      expect(
        screen.getByText(
          "Active enrollments were withdrawn, but deleting the student account failed.",
        ),
      ).toBeDefined();
    });
  });

  it("shows account delete error without claiming withdrawals when student has no active enrollments", async () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    const deleteUserSpy = vi.fn().mockRejectedValue(new Error("Delete failed"));
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteUserSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);

    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([]);
    const withdrawSpy = vi.spyOn(enrollmentEndpoints, "withdrawEnrollment");

    renderStudentsPage();
    const user = userEvent.setup();

    const menuButtons = screen.getAllByRole("button", { name: "Student actions: Farrukh Saidov" });
    await user.click(menuButtons[0]);

    const deleteMenuItem = await screen.findByRole("menuitem", { name: "Delete" });
    await user.click(deleteMenuItem);

    const confirmDeleteButton = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(deleteUserSpy).toHaveBeenCalledWith(11);
      expect(
        screen.getByText("Failed to delete student account. The student was not deleted."),
      ).toBeDefined();
    });

    expect(withdrawSpy).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        "Active enrollments were withdrawn, but deleting the student account failed.",
      ),
    ).toBeNull();
  });

  it("prevents router hijack when user navigates away while creation is pending", async () => {
    let resolveCreate: (user: User) => void = () => {};
    const createPromise = new Promise<User>((resolve) => {
      resolveCreate = resolve;
    });

    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: vi.fn().mockReturnValue(createPromise),
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);

    const { getLocation } = renderStudentsPage(["/students"]);
    const user = userEvent.setup();

    const addStudentButton = screen.getByRole("button", { name: "Add Student" });
    await user.click(addStudentButton);

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/First Name/i), "Shahrom");
    await user.type(within(dialog).getByLabelText(/Last Name/i), "Nazarov");
    await user.type(within(dialog).getByLabelText(/^Email/i), "shahrom@example.com");

    const createButton = within(dialog).getByRole("button", { name: "Create" });
    await user.click(createButton);

    await user.click(screen.getByTestId("nav-courses-btn"));
    expect(getLocation()?.pathname).toBe("/courses");

    resolveCreate({
      id: 55,
      email: "shahrom@example.com",
      first_name: "Shahrom",
      last_name: "Nazarov",
      role: "student",
      phone: null,
      parent_phone: null,
      date_of_birth: null,
      payment_day_of_month: null,
      parent_telegram_chat_id: null,
      is_deleted: false,
      must_set_password: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
      photo_path: null,
      thumbnail_path: null,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getLocation()?.pathname).toBe("/courses");
  });

  it("prevents router hijack and unmount crash when user navigates away while deletion is pending", async () => {
    let resolveDelete: () => void = () => {};
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });

    const refetchSpy = vi.fn().mockResolvedValue(mockPaginatedData);
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: refetchSpy,
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([]);
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: vi.fn().mockReturnValue(deletePromise),
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);

    const { getLocation } = renderStudentsPage(["/students"]);
    const user = userEvent.setup();

    const menuButtons = screen.getAllByRole("button", { name: "Student actions: Farrukh Saidov" });
    await user.click(menuButtons[0]);

    const deleteMenuItem = (await screen.findAllByRole("menuitem", { name: "Delete" }))[0];
    await user.click(deleteMenuItem);

    const confirmDeleteButton = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmDeleteButton);

    await user.click(screen.getByTestId("nav-courses-btn"));
    expect(getLocation()?.pathname).toBe("/courses");

    resolveDelete();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getLocation()?.pathname).toBe("/courses");
  });
});
