import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../i18n";
import { Courses } from "./Courses";
import { useAuthStore } from "../store/authStore";
import * as courseHooks from "../lib/courses/hooks";
import * as courseEndpoints from "../lib/courses/endpoints";
import * as userHooks from "../lib/users/hooks";
import type { CourseResponse } from "../lib/courses/types";
import type { Paginated } from "../lib/pagination";
import type { User } from "../lib/users/types";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../lib/courses/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/hooks")>();
  return {
    ...actual,
    useCourses: vi.fn(),
    useDeleteCourse: vi.fn(),
    useCopyCourse: vi.fn(),
  };
});

vi.mock("../lib/courses/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/endpoints")>();
  return {
    ...actual,
    getCourseSchedule: vi.fn(),
  };
});

vi.mock("../lib/users/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/users/hooks")>();
  return {
    ...actual,
    useMentors: vi.fn(),
  };
});

function mockSuccessResult<TData>(data: TData): UseQueryResult<TData, Error> {
  return {
    data,
    dataUpdatedAt: 1,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: "idle",
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: true,
    isEnabled: true,
    refetch: vi.fn(),
    status: "success",
    promise: Promise.resolve(data),
  };
}

const sampleCourses: CourseResponse[] = [
  {
    id: 1,
    title: "Python Fundamentals",
    description: "Introductory course",
    start_date: "2026-02-01",
    end_date: "2026-06-30",
    exam_type: "monthly",
    price: "1200.00",
    mentor_id: 10,
    status: "active",
    photo_path: null,
    is_deleted: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    title: "Web Design",
    description: "UI/UX fundamentals",
    start_date: "2026-03-01",
    end_date: "2026-07-31",
    exam_type: "monthly",
    price: "1500.00",
    mentor_id: 10,
    status: "active",
    photo_path: null,
    is_deleted: false,
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
];

const paginatedCourses: Paginated<CourseResponse> = {
  items: sampleCourses,
  total: 2,
  page: 1,
  page_size: 10,
  total_pages: 1,
};

const mentorUser: User = {
  id: 10,
  email: "mentor@test.com",
  first_name: "Mentor",
  last_name: "One",
  role: "mentor",
  date_of_birth: null,
  phone: null,
  parent_telegram_chat_id: null,
  parent_phone: null,
  photo_path: null,
  thumbnail_path: null,
  payment_day_of_month: null,
  must_set_password: false,
  is_deleted: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const paginatedMentors: Paginated<User> = {
  items: [mentorUser],
  total: 1,
  page: 1,
  page_size: 10,
  total_pages: 1,
};

function renderPage(role: "superadmin" | "mentor" = "superadmin") {
  useAuthStore.setState({
    status: "authenticated",
    role,
    userId: role === "mentor" ? 10 : 999,
    mustSetPassword: false,
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/courses"]}>
          <Courses />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("CourseLifecycle integration suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("768px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.mocked(courseHooks.useCourses).mockReturnValue(mockSuccessResult(paginatedCourses));
    vi.mocked(userHooks.useMentors).mockReturnValue(mockSuccessResult(paginatedMentors));
    vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);
    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 99, title: "Python Fundamentals (copy)" }),
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);
    vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValue([
      { id: 1, course_id: 1, day_of_week: 1, time_start: "09:00", time_end: "10:30" },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("mentor role has no create button, no action overflow triggers, and issues no mentor requests", () => {
    renderPage("mentor");
    expect(screen.queryByRole("button", { name: /Create Course/i })).toBeNull();
    expect(screen.queryByLabelText(/Course actions/i)).toBeNull();
    expect(userHooks.useMentors).toHaveBeenCalledWith({ page_size: 100 }, false);
  });

  it("create drawer restores focus to initiating Create Course button upon dismissal", async () => {
    renderPage("superadmin");
    const createBtn = screen.getByRole("button", { name: /Create Course/i });
    createBtn.focus();
    expect(document.activeElement).toBe(createBtn);

    fireEvent.click(createBtn);
    expect(screen.getByRole("dialog")).toBeTruthy();

    const closeBtn = screen.getByLabelText(/Close/i);
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(createBtn);
  });

  it("edit drawer restores focus to initiating course action trigger upon dismissal", async () => {
    renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    actionsBtn.focus();
    expect(document.activeElement).toBe(actionsBtn);

    fireEvent.click(actionsBtn);
    const editMenuItem = screen.getByRole("menuitem", { name: /Edit/i });
    fireEvent.click(editMenuItem);

    expect(screen.getByRole("dialog")).toBeTruthy();

    const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(actionsBtn);
  });

  it("missing schedule blocks copy mutation write and displays translated recovery", async () => {
    vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce([]);
    const copyMutate = vi.fn();
    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: copyMutate,
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

    renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Web Design");
    fireEvent.click(actionsBtn);

    const dupMenuItem = screen.getByRole("menuitem", { name: /Duplicate/i });
    fireEvent.click(dupMenuItem);

    const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(copyMutate).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "Course has no schedule and cannot be copied",
    );
  });

  it("failed schedule lookup blocks copy mutation write and displays translated recovery", async () => {
    vi.mocked(courseEndpoints.getCourseSchedule).mockRejectedValueOnce(new Error("Network failed"));
    const copyMutate = vi.fn();
    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: copyMutate,
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

    renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    fireEvent.click(actionsBtn);

    const dupMenuItem = screen.getByRole("menuitem", { name: /Duplicate/i });
    fireEvent.click(dupMenuItem);

    const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(confirmBtn).toHaveProperty("disabled", false);
    expect(copyMutate).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("cancellation of duplicate dialog writes nothing and restores focus to action trigger", async () => {
    const copyMutate = vi.fn();
    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: copyMutate,
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

    renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    fireEvent.click(actionsBtn);

    const dupMenuItem = screen.getByRole("menuitem", { name: /Duplicate/i });
    fireEvent.click(dupMenuItem);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(copyMutate).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(actionsBtn));
  });

  it("confirming duplicate on course with schedule dispatches creation and navigates to created course", async () => {
    const copyMutate = vi.fn().mockResolvedValueOnce({ id: 99, title: "Python Fundamentals (copy)" });
    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: copyMutate,
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

    renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    fireEvent.click(actionsBtn);

    const dupMenuItem = screen.getByRole("menuitem", { name: /Duplicate/i });
    fireEvent.click(dupMenuItem);

    const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(copyMutate).toHaveBeenCalledTimes(1);
    });
    expect(mockNavigate).toHaveBeenCalledWith("/courses/99");
  });

  it("delete course deletes item, shows toast, and restores surviving focus", async () => {
    const deleteMutate = vi.fn().mockResolvedValueOnce(undefined);
    vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
      mutateAsync: deleteMutate,
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

    renderPage("superadmin");
    const searchInput = screen.getByPlaceholderText(/Search/i);
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    fireEvent.click(actionsBtn);

    const deleteMenuItem = screen.getByRole("menuitem", { name: /Delete/i });
    fireEvent.click(deleteMenuItem);

    expect(screen.getByRole("dialog")).toBeTruthy();

    const confirmDeleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(deleteMutate).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(searchInput);
  });

  it("aborts copy navigation and state updates if component unmounts while mutation is pending", async () => {
    let resolveMutation!: (value: { id: number; title: string }) => void;
    const pendingPromise = new Promise<{ id: number; title: string }>((resolve) => {
      resolveMutation = resolve;
    });

    const copyMutate = vi.fn().mockReturnValue(pendingPromise);
    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: copyMutate,
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

    const { unmount } = renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    fireEvent.click(actionsBtn);

    const dupMenuItem = screen.getByRole("menuitem", { name: /Duplicate/i });
    fireEvent.click(dupMenuItem);

    const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(copyMutate).toHaveBeenCalledTimes(1);
    });

    unmount();

    resolveMutation({ id: 101, title: "Python Fundamentals (copy)" });
    await new Promise((res) => setTimeout(res, 50));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("aborts delete toast and search focus if component unmounts while delete mutation is pending", async () => {
    let resolveDelete!: () => void;
    const pendingPromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });

    const deleteMutate = vi.fn().mockReturnValue(pendingPromise);
    vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
      mutateAsync: deleteMutate,
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    const { unmount } = renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    fireEvent.click(actionsBtn);

    const deleteMenuItem = screen.getByRole("menuitem", { name: /Delete/i });
    fireEvent.click(deleteMenuItem);

    const confirmDeleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(deleteMutate).toHaveBeenCalledWith(1);
    });

    setTimeoutSpy.mockClear();

    unmount();

    await act(async () => {
      resolveDelete();
      await new Promise((res) => setTimeout(res, 50));
    });

    const toastTimers = setTimeoutSpy.mock.calls.filter((args) => args[1] === 3000);
    expect(toastTimers).toHaveLength(0);
    setTimeoutSpy.mockRestore();
  });

  it("locks duplicate dialog against escape and cancel while copy mutation is pending", async () => {
    let resolveSchedule!: (val: Array<{ id: number; course_id: number; day_of_week: number; time_start: string; time_end: string }>) => void;
    const pendingSchedule = new Promise<Array<{ id: number; course_id: number; day_of_week: number; time_start: string; time_end: string }>>((resolve) => {
      resolveSchedule = resolve;
    });
    vi.mocked(courseEndpoints.getCourseSchedule).mockReturnValue(pendingSchedule);

    renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    fireEvent.click(actionsBtn);

    const dupMenuItem = screen.getByRole("menuitem", { name: /Duplicate/i });
    fireEvent.click(dupMenuItem);

    const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
    fireEvent.click(confirmBtn);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).toHaveProperty("disabled", true);
    expect(confirmBtn).toHaveProperty("disabled", true);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    resolveSchedule([]);
    await waitFor(() => {
      expect(cancelBtn).toHaveProperty("disabled", false);
    });
  });

  it("retains duplicate dialog and allows retry or cancellation after copy failure", async () => {
    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Server error")),
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

    renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    fireEvent.click(actionsBtn);

    const dupMenuItem = screen.getByRole("menuitem", { name: /Duplicate/i });
    fireEvent.click(dupMenuItem);

    const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(confirmBtn).toHaveProperty("disabled", false);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).toHaveProperty("disabled", false);
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(actionsBtn);
    });
  });

  it("retains delete dialog and allows retry or cancellation after delete failure", async () => {
    vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Delete failed")),
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

    renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    fireEvent.click(actionsBtn);

    const deleteMenuItem = screen.getByRole("menuitem", { name: /Delete/i });
    fireEvent.click(deleteMenuItem);

    const confirmDeleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByRole("dialog")).toBeTruthy();

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).toHaveProperty("disabled", false);
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(actionsBtn);
  });

  it("ignores stale resolution from an earlier duplicate operation if cancelled before dispatch", async () => {
    const copyMutate = vi.fn().mockResolvedValue({ id: 55, title: "Duplicated" });
    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: copyMutate,
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

    renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    fireEvent.click(actionsBtn);

    const dupMenuItem = screen.getByRole("menuitem", { name: /Duplicate/i });
    fireEvent.click(dupMenuItem);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(copyMutate).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
