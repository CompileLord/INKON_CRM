import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { useAuthStore } from "../store/authStore";
import { Students } from "./Students";
import { StudentProfile } from "./StudentProfile";
import * as userHooks from "../lib/users/hooks";
import * as enrollmentEndpoints from "../lib/enrollments/endpoints";
import * as enrollmentHooks from "../lib/enrollments/hooks";
import type { PaginatedUsers, StudentProfileResponse, User } from "../lib/users/types";
import type { EnrollmentResponse } from "../lib/enrollments/types";
import { getSavedStudentsReturnContext, recordStudentsNavigation } from "../lib/users/returnContext";

beforeEach(() => {
  useAuthStore.setState({ role: "superadmin" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mockStudentsList: User[] = [
  {
    id: 11,
    email: "student11@example.com",
    first_name: "Farrukh",
    last_name: "Saidov",
    role: "student",
    phone: "+992900000011",
    parent_phone: "+992900000012",
    date_of_birth: "2006-03-20",
    payment_day_of_month: 10,
    parent_telegram_chat_id: 101,
    is_deleted: false,
    must_set_password: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    photo_path: null,
    thumbnail_path: null,
  },
  {
    id: 12,
    email: "student12@example.com",
    first_name: "Dilnoza",
    last_name: "Karimova",
    role: "student",
    phone: "+992900000022",
    parent_phone: null,
    date_of_birth: null,
    payment_day_of_month: 20,
    parent_telegram_chat_id: null,
    is_deleted: false,
    must_set_password: false,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    photo_path: null,
    thumbnail_path: null,
  },
];

const mockPaginatedData: PaginatedUsers<User> = {
  items: mockStudentsList,
  total: 2,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

function renderStudentsPage(initialEntries = ["/students"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  let capturedLocation: ReturnType<typeof useLocation> | null = null;
  let capturedNavigate: ReturnType<typeof useNavigate> | null = null;

  function LocationObserver() {
    capturedLocation = useLocation();
    capturedNavigate = useNavigate();
    return (
      <button
        type="button"
        data-testid="nav-courses-btn"
        onClick={() => capturedNavigate?.("/courses")}
      >
        Go to courses
      </button>
    );
  }

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={initialEntries}>
          <LocationObserver />
          <Routes>
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentProfile />} />
            <Route path="/courses" element={<div data-testid="courses-page">Courses Page</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return {
    ...renderResult,
    getLocation: () => capturedLocation,
    navigate: (path: string) => capturedNavigate?.(path),
    queryClient,
  };
}

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
    expect(screen.getAllByRole("link", { name: "Farrukh Saidov" }).length).toBeGreaterThan(0);
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
      expect(screen.getByRole("status").textContent).toContain("Student created successfully");
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

    const studentLinks = screen.getAllByRole("link", { name: "Farrukh Saidov" });
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
