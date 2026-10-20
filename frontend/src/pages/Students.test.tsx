import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "../store/authStore";
import * as userHooks from "../lib/users/hooks";
import * as enrollmentEndpoints from "../lib/enrollments/endpoints";
import * as enrollmentHooks from "../lib/enrollments/hooks";
import type { StudentProfileResponse, User } from "../lib/users/types";
import type { EnrollmentResponse } from "../lib/enrollments/types";
import { mockPaginatedData, renderStudentsPage } from "./StudentsTestSupport";

beforeEach(() => {
  useAuthStore.setState({ role: "superadmin" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Students page", () => {
  it("renders page header, total, search input, and students list", () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    renderStudentsPage();

    expect(screen.getByRole("heading", { name: "Students" })).toBeDefined();
    expect(screen.getByLabelText("Total students: 2").textContent).toBe("2");
    expect(screen.getByPlaceholderText(/Search by name, email, or phone/i)).toBeDefined();
    expect(screen.getAllByRole("link", { name: /Farrukh Saidov/ }).length).toBeGreaterThan(0);
  });

  it("writes the chosen page size from the footer listbox to the URL and resets to page 1", async () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    const { getLocation, container } = renderStudentsPage(["/students?page=2"]);
    expect(container.querySelector("select")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Rows per page: 20 per page" }));
    await user.click(await screen.findByRole("option", { name: "50 per page" }));

    await waitFor(() => {
      expect(getLocation()?.search).toContain("pageSize=50");
      expect(getLocation()?.search).toContain("page=1");
    });
  });

  it("opens create panel when Add Student button is clicked", async () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    renderStudentsPage();
    const user = userEvent.setup();

    const addStudentButton = screen.getByRole("button", { name: /Add Student/i });
    await user.click(addStudentButton);

    expect(screen.getByRole("heading", { name: "New Student" })).toBeDefined();
  });

  it("navigates to created student profile on successful creation with directory state preserved", async () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    const newStudent: User = {
      id: 99,
      email: "new.student@example.com",
      first_name: "Nodir",
      last_name: "Yusupov",
      role: "student",
      phone: "+992900000099",
      parent_phone: null,
      date_of_birth: null,
      payment_day_of_month: 5,
      parent_telegram_chat_id: null,
      is_deleted: false,
      must_set_password: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
      photo_path: null,
      thumbnail_path: null,
    };

    const mockProfile: StudentProfileResponse = {
      user: newStudent,
      totals: {
        avg_percentage: 92,
        attendance_percentage: 95,
        absences: 0,
        total_lessons: 10,
        active_course_count: 0,
        archived_course_count: 0,
      },
      courses: [],
      avg_score: 92,
      absences: 0,
      total_lessons: 10,
    };

    vi.spyOn(userHooks, "useCreateUser").mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(newStudent),
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useCreateUser>);

    vi.spyOn(userHooks, "useStudentProfile").mockReturnValue({
      data: mockProfile,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>);

    const { getLocation, navigate } = renderStudentsPage(["/students?q=nodir&page=1"]);
    const user = userEvent.setup();

    const addStudentButton = screen.getByRole("button", { name: /Add Student/i });
    await user.click(addStudentButton);

    await user.type(screen.getByLabelText(/First Name/i), "Nodir");
    await user.type(screen.getByLabelText(/Last Name/i), "Yusupov");
    await user.type(screen.getByLabelText(/^Email/i), "new.student@example.com");

    const createSubmit = screen.getByRole("button", { name: "Create" });
    await user.click(createSubmit);

    await waitFor(() => {
      expect(getLocation()?.pathname).toBe("/students/99");
      expect(screen.getByRole("status").textContent).toContain("Student created. Login details (email and temporary password) were sent to their email");
      expect(screen.getByRole("heading", { name: "Nodir Yusupov" })).toBeDefined();
    });
    navigate("/students/11");
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("handles student deletion with enrollment withdrawal and confirmation dialog", async () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    const deleteUserSpy = vi.fn().mockResolvedValue({});
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

    expect(screen.getByText("Delete Student")).toBeDefined();
    expect(screen.getByText(/Farrukh Saidov will withdraw all active enrollments/i)).toBeDefined();

    const confirmDeleteButton = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(withdrawSpy).toHaveBeenCalledWith(501);
      expect(deleteUserSpy).toHaveBeenCalledWith(11);
    });
  });

  it("falls back to the last valid page when page is out of range after deletion", async () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: {
        items: [],
        total: 15,
        page: 2,
        page_size: 20,
        total_pages: 1,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    const { getLocation } = renderStudentsPage(["/students?page=2"]);

    await waitFor(() => {
      expect(getLocation()?.search).toContain("page=1");
    });
  });

  it("reports withdrawal failure truthfully without deleting the user account", async () => {
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

    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([
      { id: 501, status: "active" } as unknown as EnrollmentResponse,
    ]);
    vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockRejectedValue(new Error("Network withdrawal error"));

    renderStudentsPage();
    const user = userEvent.setup();

    const menuButtons = screen.getAllByRole("button", { name: "Student actions: Farrukh Saidov" });
    await user.click(menuButtons[0]);

    const deleteMenuItem = await screen.findByRole("menuitem", { name: "Delete" });
    await user.click(deleteMenuItem);

    const confirmDeleteButton = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(deleteUserSpy).not.toHaveBeenCalled();
      expect(
        screen.getByText("Failed to withdraw student's active enrollments. The student account was not deleted."),
      ).toBeDefined();
    });
  });

  it("reports failure truthfully when enrollments were withdrawn but deleting user account failed", async () => {
    vi.spyOn(userHooks, "useStudents").mockReturnValue({
      data: mockPaginatedData,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudents>);

    const deleteUserSpy = vi.fn().mockRejectedValue(new Error("User deletion error"));
    vi.spyOn(userHooks, "useDeleteUser").mockReturnValue({
      mutateAsync: deleteUserSpy,
      isPending: false,
    } as unknown as ReturnType<typeof userHooks.useDeleteUser>);

    vi.spyOn(enrollmentHooks, "fetchFilteredEnrollments").mockResolvedValue([
      { id: 501, status: "active" } as unknown as EnrollmentResponse,
    ]);
    vi.spyOn(enrollmentEndpoints, "withdrawEnrollment").mockResolvedValue({} as never);

    renderStudentsPage();
    const user = userEvent.setup();

    const menuButtons = screen.getAllByRole("button", { name: "Student actions: Farrukh Saidov" });
    await user.click(menuButtons[0]);

    const deleteMenuItem = await screen.findByRole("menuitem", { name: "Delete" });
    await user.click(deleteMenuItem);

    const confirmDeleteButton = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(deleteUserSpy).toHaveBeenCalled();
      expect(
        screen.getByText("Active enrollments were withdrawn, but deleting the student account failed."),
      ).toBeDefined();
    });
  });
});
