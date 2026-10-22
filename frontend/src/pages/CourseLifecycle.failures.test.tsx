import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../i18n";
import { Courses } from "./Courses";
import { useAuthStore } from "../store/authStore";
import * as courseHooks from "../lib/courses/hooks";
import * as courseEndpoints from "../lib/courses/endpoints";
import * as userHooks from "../lib/users/hooks";
import type { CourseListItemResponse } from "../lib/courses/types";
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

const sampleCourses: CourseListItemResponse[] = [
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
    schedules: [],
    active_student_count: 0,
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
    schedules: [],
    active_student_count: 0,
  },
];

const paginatedCourses: Paginated<CourseListItemResponse> = {
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

describe("CourseLifecycle integration suite failures", () => {
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

  it("retains duplicate dialog and allows retry or cancellation after copy failure", async () => {
    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Server error")),
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

    renderPage("superadmin");
    const actionsBtn = screen.getByLabelText("Course actions: Python Fundamentals");
    actionsBtn.focus();
    fireEvent.click(actionsBtn);

    const dupMenuItem = screen.getByRole("menuitem", { name: /Duplicate/i });
    fireEvent.click(dupMenuItem);
    await waitFor(() => expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true));

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
    actionsBtn.focus();
    fireEvent.click(actionsBtn);

    const deleteMenuItem = screen.getByRole("menuitem", { name: /Delete/i });
    fireEvent.click(deleteMenuItem);
    await waitFor(() => expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true));

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
    await waitFor(() => expect(document.activeElement).toBe(actionsBtn));
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
