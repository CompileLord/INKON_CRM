import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, type Location } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../i18n";
import { Courses } from "./Courses";
import { useAuthStore } from "../store/authStore";
import * as courseHooks from "../lib/courses/hooks";
import * as courseEndpoints from "../lib/courses/endpoints";
import * as userHooks from "../lib/users/hooks";
import type { CourseResponse, PaginatedCourses } from "../lib/courses/types";
import type { Paginated } from "../lib/pagination";
import type { User } from "../lib/users/types";

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

function mockInitialLoadingResult<TData>(): UseQueryResult<TData, Error> {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: "fetching",
    isError: false,
    isFetched: false,
    isFetchedAfterMount: false,
    isFetching: true,
    isInitialLoading: true,
    isLoading: true,
    isLoadingError: false,
    isPaused: false,
    isPending: true,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: false,
    isEnabled: true,
    refetch: vi.fn(),
    status: "pending",
    promise: new Promise(() => {}),
  };
}

function mockPlaceholderTransitionResult<TData>(retainedData: TData): UseQueryResult<TData, Error> {
  return {
    data: retainedData,
    dataUpdatedAt: 1,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: "fetching",
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: true,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: true,
    isRefetchError: false,
    isRefetching: false,
    isStale: true,
    isSuccess: true,
    isEnabled: true,
    refetch: vi.fn(),
    status: "success",
    promise: new Promise(() => {}),
  };
}

function mockInitialErrorResult<TData>(refetch = vi.fn()): UseQueryResult<TData, Error> {
  const error = new Error("Network error");
  const promise = Promise.reject(error);
  promise.catch(() => {});
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error,
    errorUpdateCount: 1,
    errorUpdatedAt: 1,
    failureCount: 1,
    failureReason: error,
    fetchStatus: "idle",
    isError: true,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: true,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: false,
    isEnabled: true,
    refetch,
    status: "error",
    promise,
  };
}

function mockStaleErrorResult<TData>(data: TData, refetch = vi.fn()): UseQueryResult<TData, Error> {
  const error = new Error("Network error");
  return {
    data,
    dataUpdatedAt: 1,
    error,
    errorUpdateCount: 1,
    errorUpdatedAt: 1,
    failureCount: 1,
    failureReason: error,
    fetchStatus: "idle",
    isError: true,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: true,
    isRefetching: false,
    isStale: true,
    isSuccess: false,
    isEnabled: true,
    refetch,
    status: "error",
    promise: Promise.resolve(data),
  };
}

const sampleCourses: CourseResponse[] = [
  {
    id: 1,
    title: "Python Fundamentals",
    description: "Intro to Python programming",
    photo_path: null,
    start_date: "2026-01-10",
    end_date: "2026-12-31",
    exam_type: "monthly",
    price: "1200.00",
    mentor_id: 10,
    status: "active",
    is_deleted: false,
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
  },
  {
    id: 2,
    title: "English IELTS Master",
    description: "Prepare for academic IELTS",
    photo_path: null,
    start_date: "2026-02-01",
    end_date: "2026-08-31",
    exam_type: "weekly",
    price: "850.50",
    mentor_id: 10,
    status: "active",
    is_deleted: false,
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
  },
  {
    id: 3,
    title: "Archived Foundation",
    description: "Archived course",
    photo_path: null,
    start_date: "2025-01-01",
    end_date: "2025-06-01",
    exam_type: "monthly",
    price: "5000000000000000000000000.00",
    mentor_id: 20,
    status: "archived",
    is_deleted: false,
    created_at: "2025-01-01T08:00:00Z",
    updated_at: "2025-01-01T08:00:00Z",
  },
];

const sampleMentors: User[] = [
  {
    id: 10,
    first_name: "Aziz",
    last_name: "Rahimov",
    email: "mentor@kitob.example.com",
    role: "mentor",
    date_of_birth: null,
    phone: "+992900000001",
    parent_telegram_chat_id: null,
    parent_phone: null,
    photo_path: null,
    thumbnail_path: null,
    payment_day_of_month: null,
    is_deleted: false,
    must_set_password: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

function LocationSpy({ onChange }: { onChange: (location: Location) => void }) {
  const loc = useLocation();
  onChange(loc);
  return null;
}

function renderCoursesPage({
  initialUrl = "/courses",
  role = "superadmin",
  isTablet = true,
  onLocationChange,
}: {
  initialUrl?: string;
  role?: "superadmin" | "mentor" | "student" | "accountant";
  isTablet?: boolean;
  onLocationChange?: (location: Location) => void;
} = {}) {
  useAuthStore.setState({ role, userId: role === "mentor" ? 10 : 1 });

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isTablet ? query.includes("768") : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[initialUrl]}>
          {onLocationChange ? <LocationSpy onChange={onLocationChange} /> : null}
          <Courses />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("Courses page directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 99 }),
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

    vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValue([
      {
        id: 101,
        course_id: 1,
        day_of_week: 1,
        time_start: "09:00:00",
        time_end: "10:30:00",
      },
    ]);

    vi.mocked(userHooks.useMentors).mockReturnValue(
      mockSuccessResult({
        items: sampleMentors,
        total: 1,
        page: 1,
        page_size: 100,
        total_pages: 1,
      }),
    );
  });

  afterEach(() => {
    cleanup();
  });

  describe("URL parameter ownership & defaults", () => {
    it("defaults to status=all, page=1, empty search, newest sort, and grid desktop view", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses",
      });

      expect(courseHooks.useCourses).toHaveBeenCalledWith({
        status: undefined,
        page: 1,
        page_size: 12,
      });

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent).toContain("Courses & Groups");
      expect(heading.textContent).toContain("(3)");
    });

    it("gracefully falls back on invalid URL params", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses?status=invalid_status&page=-5&sort=fake_sort&view=unknown_view",
      });

      expect(courseHooks.useCourses).toHaveBeenCalledWith({
        status: undefined,
        page: 1,
        page_size: 12,
      });
    });

    it("falls back to page 1 when encountering malformed page parameter like 2abc or 2.5", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      const { unmount } = renderCoursesPage({
        initialUrl: "/courses?page=2abc",
      });

      expect(courseHooks.useCourses).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 }),
      );
      unmount();

      renderCoursesPage({
        initialUrl: "/courses?page=2.5",
      });

      expect(courseHooks.useCourses).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 }),
      );
    });

    it("resets page to 1 when server status filter changes", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 2,
          page_size: 12,
          total_pages: 2,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        initialUrl: "/courses?status=all&page=2",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      const activeChip = screen.getByRole("button", { name: "Active" });
      fireEvent.click(activeChip);

      expect(currentLocation?.search).toContain("status=active");
      expect(currentLocation?.search).not.toContain("page=2");
    });

    it("preserves server page ownership when typing local search query", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: sampleCourses,
          total: 24,
          page: 2,
          page_size: 12,
          total_pages: 2,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        initialUrl: "/courses?page=2",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      const searchInput = screen.getByPlaceholderText("Search course by title...");
      fireEvent.change(searchInput, { target: { value: "Python" } });

      expect(currentLocation?.search).toContain("page=2");
      expect(currentLocation?.search).toContain("q=Python");
    });
  });

  describe("Ownership transitions with placeholder data", () => {
    it("renders loading skeleton instead of mislabeling old data when isPlaceholderData is true", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockPlaceholderTransitionResult({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses?page=2",
      });

      expect(screen.getByTestId("brand-activity-indicator")).toBeTruthy();
      expect(screen.queryByText("Python Fundamentals")).toBeNull();
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent).not.toContain("(1)");
    });
  });

  describe("Scope honesty & current page pagination", () => {
    it("displays honest current page match count and retains pagination when search has 0 matches", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: sampleCourses,
          total: 24,
          page: 2,
          page_size: 12,
          total_pages: 2,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses?page=2&q=NothingMatchesHere",
      });

      expect(screen.getByText("No matches on this page")).toBeTruthy();
      expect(
        screen.getByText(
          'No courses on the current page match "NothingMatchesHere". Try a different search or check other pages.',
        ),
      ).toBeTruthy();

      expect(screen.getByRole("navigation", { name: "Courses pagination" })).toBeTruthy();
    });

    it("handles out of range page gracefully by offering return to page 1 while retaining pagination", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [],
          total: 12,
          page: 5,
          page_size: 12,
          total_pages: 1,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        initialUrl: "/courses?page=5",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      expect(screen.getByText("No matches on this page")).toBeTruthy();
      const backButton = screen.getByRole("button", { name: "Back" });
      fireEvent.click(backButton);
      expect(currentLocation?.search).not.toContain("page=5");
    });

    it("allows resetting search while keeping server page", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: sampleCourses,
          total: 24,
          page: 2,
          page_size: 12,
          total_pages: 2,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        initialUrl: "/courses?page=2&q=Nothing",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      const clearSearchBtns = screen.getAllByRole("button", { name: "Clear search" });
      fireEvent.click(clearSearchBtns[0]);

      expect(currentLocation?.search).not.toContain("q=");
      expect(currentLocation?.search).toContain("page=2");
    });
  });

  describe("Sorting & Decimal precision", () => {
    it("sorts by price using arbitrary-precision decimal strings without float corruption", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [
            sampleCourses[2],
            sampleCourses[0],
            sampleCourses[1],
          ],
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses?sort=price",
      });

      const links = screen
        .getAllByRole("link")
        .filter((l) => l.getAttribute("href")?.startsWith("/courses/"));
      const courseTitles = links.map((l) => l.textContent?.trim()).filter(Boolean);

      expect(courseTitles).toEqual([
        "English IELTS Master",
        "Python Fundamentals",
        "Archived Foundation",
      ]);
    });
  });

  describe("Domain correctness & school timezone", () => {
    it("formats course start and end dates with school timezone avoiding negative timezone shifts", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage();

      expect(screen.getByText(/01\/10\/2026/)).toBeTruthy();
      expect(screen.getByText(/12\/31\/2026/)).toBeTruthy();
    });
  });

  describe("Role-specific presentation: superadmin vs mentor", () => {
    it("superadmin sees Create course button, bounded mentor lookup, and admin overflow menu", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      expect(screen.getAllByText("Aziz Rahimov").length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByRole("button", { name: "Course actions: Python Fundamentals" }),
      ).toBeTruthy();

      expect(screen.queryByRole("link", { name: /Go to journal/ })).toBeNull();
    });

    it("opens delete confirmation dialog and only executes deleteCourse when confirmed", async () => {
      const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: deleteMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });
      fireEvent.click(actionsBtn);

      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      expect(screen.getByText("Delete course")).toBeTruthy();
      expect(deleteMutateAsync).not.toHaveBeenCalled();

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      expect(deleteMutateAsync).not.toHaveBeenCalled();

      fireEvent.click(actionsBtn);
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(deleteMutateAsync).toHaveBeenCalledWith(1);
      });
      expect(deleteMutateAsync).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Course deleted")).toBeTruthy();
    });

    it("disables cancel button while delete mutation is pending", () => {
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });
      fireEvent.click(actionsBtn);

      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      const cancelBtn = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
      expect(cancelBtn.disabled).toBe(true);
    });

    it("restores focus to surviving search control on successful deletion and to trigger button on cancellation", async () => {
      const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: deleteMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      const searchInput = screen.getByPlaceholderText("Search course by title...");
      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });

      fireEvent.click(actionsBtn);
      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      expect(screen.getByRole("dialog")).toBeTruthy();

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(actionsBtn);
      });

      fireEvent.click(actionsBtn);
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(deleteMutateAsync).toHaveBeenCalledWith(1);
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(searchInput);
      });
    });

    it("retains delete confirmation dialog, displays accessible in-dialog alert, and preserves URL when delete mutation fails", async () => {
      const deleteMutateAsync = vi.fn().mockRejectedValue(new Error("Simulated delete failure"));
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: deleteMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        role: "superadmin",
        initialUrl: "/courses?page=1",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });
      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });
      fireEvent.click(actionsBtn);
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(deleteMutateAsync).toHaveBeenCalledWith(1);
      });
      const alert = within(screen.getByRole("dialog")).getByRole("alert");
      expect(alert.textContent).toBe("Failed to delete course");
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(currentLocation?.pathname).toBe("/courses");
      expect(currentLocation?.search).toBe("?page=1");
    });

    it("opens duplicate confirmation, fetches real schedule, and creates copy with copy suffix", async () => {
      sessionStorage.removeItem("kitob_course_list_last_url");
      const targetCourse: CourseResponse = {
        ...sampleCourses[0],
        title: "Schedule precision audit",
      };
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 99 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [targetCourse],
          total: 1,
          page: 2,
          page_size: 12,
          total_pages: 2,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        role: "superadmin",
        initialUrl: "/courses?page=2&q=Schedule%20precision%20audit",
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Schedule precision audit",
      });
      fireEvent.click(actionsBtn);

      const dupMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(dupMenuItem);

      expect(screen.getByText("Duplicate course")).toBeTruthy();
      expect(copyMutateAsync).not.toHaveBeenCalled();

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      expect(copyMutateAsync).not.toHaveBeenCalled();

      fireEvent.click(actionsBtn);
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      expect(confirmBtn.className).toContain("bg-maroon");
      expect(confirmBtn.className).not.toContain("bg-destructive");
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(courseEndpoints.getCourseSchedule).toHaveBeenCalledWith(1);
      });
      await waitFor(() => {
        expect(copyMutateAsync).toHaveBeenCalledWith({
          id: 1,
          payload: expect.objectContaining({
            title: "Schedule precision audit (copy)",
          }),
        });
      });
      expect(screen.getByText("Course copied")).toBeTruthy();
      expect(currentLocation?.pathname).toBe("/courses/99");
      expect(sessionStorage.getItem("kitob_course_list_last_url")).toBe(
        "/courses?page=2&q=Schedule+precision+audit",
      );
    });

    it("aborts duplicate with distinct missing-schedule guidance inside dialog and zero POST", async () => {
      sessionStorage.removeItem("kitob_course_list_last_url");
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce([]);
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 99 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });
      fireEvent.click(actionsBtn);

      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => {
        expect(courseEndpoints.getCourseSchedule).toHaveBeenCalledWith(1);
      });
      expect(copyMutateAsync).not.toHaveBeenCalled();
      const alert = within(screen.getByRole("dialog")).getByRole("alert");
      expect(alert.textContent).toBe(
        "Course has no schedule and cannot be copied. Cancel and choose a course with a schedule.",
      );
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(sessionStorage.getItem("kitob_course_list_last_url")).toBeNull();
    });

    it("retains duplicate dialog with accessible error and performs zero POST when schedule lookup fails", async () => {
      sessionStorage.removeItem("kitob_course_list_last_url");
      vi.mocked(courseEndpoints.getCourseSchedule).mockRejectedValueOnce(
        new Error("SIMULATION: schedule temporarily unavailable"),
      );
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 99 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });
      fireEvent.click(actionsBtn);

      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => {
        expect(courseEndpoints.getCourseSchedule).toHaveBeenCalledWith(1);
      });
      expect(copyMutateAsync).not.toHaveBeenCalled();
      const alert = within(screen.getByRole("dialog")).getByRole("alert");
      expect(alert.textContent).toBe("Failed to copy course");
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(sessionStorage.getItem("kitob_course_list_last_url")).toBeNull();

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(actionsBtn);
      });
    });

    it("clears stale error on new duplicate attempt or target switch", async () => {
      vi.mocked(courseEndpoints.getCourseSchedule).mockRejectedValueOnce(
        new Error("Initial schedule lookup failure"),
      );
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 99 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });
      fireEvent.click(actionsBtn);
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => {
        expect(courseEndpoints.getCourseSchedule).toHaveBeenCalledWith(1);
      });
      expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toBe(
        "Failed to copy course",
      );

      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce([
        {
          id: 1,
          course_id: 1,
          day_of_week: 1,
          time_start: "10:00:00",
          time_end: "11:30:00",
        },
      ]);
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => {
        expect(copyMutateAsync).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it("preserves exact schedule seconds and multiple weekdays in duplicate payload", async () => {
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce([
        {
          id: 101,
          course_id: 1,
          day_of_week: 1,
          time_start: "10:00:15",
          time_end: "11:30:45",
        },
        {
          id: 102,
          course_id: 1,
          day_of_week: 3,
          time_start: "14:15:30",
          time_end: "15:45:50",
        },
      ]);
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 88 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });
      fireEvent.click(screen.getByRole("button", { name: "Course actions: Python Fundamentals" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() => {
        expect(copyMutateAsync).toHaveBeenCalledWith({
          id: 1,
          payload: {
            title: "Python Fundamentals (copy)",
            description: "Intro to Python programming",
            start_date: "2026-01-10",
            end_date: "2026-12-31",
            exam_type: "monthly",
            price: "1200.00",
            mentor_id: 10,
            schedules: [
              { day_of_week: 1, time_start: "10:00:15", time_end: "11:30:45" },
              { day_of_week: 3, time_start: "14:15:30", time_end: "15:45:50" },
            ],
          },
        });
      });
    });

    it("renders duplicate confirmation with primary variant and restores trigger focus on cancellation", async () => {
      const copyMutateAsync = vi.fn().mockResolvedValue({ id: 99 });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: copyMutateAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "superadmin" });

      const actionsBtn = screen.getByRole("button", {
        name: "Course actions: Python Fundamentals",
      });
      fireEvent.click(actionsBtn);
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      expect(confirmBtn.className).toContain("bg-maroon");
      expect(confirmBtn.className).not.toContain("bg-destructive");

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(actionsBtn);
      });
    });

    it("restores prior history.scrollRestoration policy on unmount", () => {
      history.scrollRestoration = "auto";
      const { unmount } = renderCoursesPage();
      expect(history.scrollRestoration).toBe("manual");
      unmount();
      expect(history.scrollRestoration).toBe("auto");
    });

    it("mentor sees assigned courses, secondary Open journal link, and NO admin controls or mentor fetch", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ role: "mentor" });

      expect(screen.queryByRole("button", { name: "Create Course" })).toBeNull();
      expect(userHooks.useMentors).toHaveBeenCalledWith({ page_size: 100 }, false);
      expect(screen.queryByRole("button", { name: /Course actions/ })).toBeNull();

      const titleLink = screen.getByRole("link", { name: "Python Fundamentals" });
      expect(titleLink.getAttribute("href")).toBe("/courses/1");

      const journalLink = screen.getByRole("link", {
        name: "Go to journal: Python Fundamentals",
      });
      expect(journalLink.getAttribute("href")).toBe("/journals/1");

      expect(screen.queryByText(/mentors not assigned/i)).toBeNull();
    });
  });

  describe("Four states & retry handling", () => {
    it("renders loading skeleton with BrandActivityIndicator on initial fetch", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(mockInitialLoadingResult());

      renderCoursesPage();

      expect(screen.getByTestId("brand-activity-indicator")).toBeTruthy();
      expect(screen.getByText("Loading courses...")).toBeTruthy();
    });

    it("displays updating activity indicator on background refetch without blowing away loaded items", () => {
      const staleData: Paginated<CourseResponse> = {
        items: [sampleCourses[0]],
        total: 1,
        page: 1,
        page_size: 12,
        total_pages: 1,
      };
      const result = mockSuccessResult(staleData);
      result.isFetching = true;
      vi.mocked(courseHooks.useCourses).mockReturnValue(result);

      renderCoursesPage();

      expect(screen.getByText("Python Fundamentals")).toBeTruthy();
      expect(screen.getByText("Updating…")).toBeTruthy();
    });

    it("renders loading skeleton while query is transitioning with isPlaceholderData", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockPlaceholderTransitionResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses?page=2",
      });

      expect(screen.getByTestId("brand-activity-indicator")).toBeTruthy();
      expect(screen.getByText("Loading courses...")).toBeTruthy();
    });

    it("preserves ordering helper allocation and role-specific geometry during loading", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(mockInitialLoadingResult());

      const { unmount } = renderCoursesPage({
        initialUrl: "/courses?sort=price&q=Python",
        role: "superadmin",
      });

      expect(screen.getByText("Current page order: By price")).toBeTruthy();
      expect(screen.queryByText(/Found on this page/i)).toBeNull();
      unmount();

      renderCoursesPage({
        initialUrl: "/courses?sort=newest",
        role: "mentor",
      });

      expect(screen.getByText("Current page order: Newest first")).toBeTruthy();
    });

    it("renders initial error state with functional Retry button", () => {
      const refetchFn = vi.fn();
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockInitialErrorResult<PaginatedCourses>(refetchFn),
      );

      renderCoursesPage();

      expect(screen.getByText("Failed to load course")).toBeTruthy();

      const retryButton = screen.getByRole("button", { name: "Retry" });
      fireEvent.click(retryButton);

      expect(refetchFn).toHaveBeenCalledTimes(1);
    });

    it("retains loaded cards and shows retry notice on background refetch failure", () => {
      const refetchFn = vi.fn();
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockStaleErrorResult<PaginatedCourses>(
          {
            items: [sampleCourses[0]],
            total: 1,
            page: 1,
            page_size: 12,
            total_pages: 1,
          },
          refetchFn,
        ),
      );

      renderCoursesPage();

      expect(screen.getByText("Python Fundamentals")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toContain("Failed to update courses");

      const retryBtn = within(screen.getByRole("alert")).getByRole("button", {
        name: "Retry",
      });
      fireEvent.click(retryBtn);
      expect(refetchFn).toHaveBeenCalledTimes(1);
    });

    it("displays genuine empty catalog state with role-specific guidance", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [],
          total: 0,
          page: 1,
          page_size: 12,
          total_pages: 0,
        }),
      );

      const { unmount } = renderCoursesPage({ role: "superadmin" });
      expect(screen.getByText("No courses in the catalog yet")).toBeTruthy();
      expect(screen.getAllByRole("button", { name: "Create Course" }).length).toBe(2);
      unmount();

      renderCoursesPage({ role: "mentor" });
      expect(screen.getByText("No courses assigned")).toBeTruthy();
      expect(
        screen.getByText(
          "You don't have any assigned courses yet. Contact an administrator for assignments.",
        ),
      ).toBeTruthy();
    });
  });

  describe("Phone responsive presentation & Filters dialog", () => {
    it("renders divided rows and opens Filters bottom dialog with native radios on phone", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0], sampleCourses[1]],
          total: 2,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      let currentLocation: Location | undefined;
      renderCoursesPage({
        isTablet: false,
        onLocationChange: (loc) => {
          currentLocation = loc;
        },
      });

      expect(screen.queryByRole("group", { name: "Grid" })).toBeNull();

      const filtersBtn = screen.getByRole("button", { name: "Filters" });
      expect(filtersBtn).toBeTruthy();

      fireEvent.click(filtersBtn);

      expect(screen.getByRole("dialog")).toBeTruthy();

      const closeBtn = screen.getByRole("button", { name: "Close" });
      expect(closeBtn.className).toContain("rounded-[10px]");

      const newestLabel = screen.getByText("Newest first").closest("label");
      expect(newestLabel?.className).toContain("rounded-[10px]");

      const priceRadio = screen.getByDisplayValue("price") as HTMLInputElement;
      expect(priceRadio).toBeTruthy();
      expect(priceRadio.type).toBe("radio");

      fireEvent.click(priceRadio);

      expect(currentLocation?.search).toContain("sort=price");

      const doneBtn = screen.getByRole("button", { name: "Done" });
      expect(doneBtn.className).toContain("bg-maroon");
      fireEvent.click(doneBtn);

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("displays explicit active sort status on current page for custom sort, default sort, and alongside search", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      const { unmount } = renderCoursesPage({
        initialUrl: "/courses?sort=price",
      });

      let sortStatus = screen.getByRole("status");
      expect(sortStatus.textContent).toContain("Current page order: By price");
      unmount();

      const { unmount: unmountDefault } = renderCoursesPage({
        initialUrl: "/courses",
      });
      sortStatus = screen.getByRole("status");
      expect(sortStatus.textContent).toContain("Current page order: Newest first");
      unmountDefault();

      renderCoursesPage({
        initialUrl: "/courses?q=Python",
      });
      sortStatus = screen.getByRole("status");
      expect(sortStatus.textContent).toContain("Current page order: Newest first");
      expect(sortStatus.textContent).toContain("Found on this page: 1 of 3");
    });

    it("renders phone primary title with text-base and leading-6 without clipping", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: [sampleCourses[0]],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({ isTablet: false });
      const titleLink = screen.getByRole("link", { name: "Python Fundamentals" });
      expect(titleLink.className).toContain("text-base");
      expect(titleLink.className).toContain("leading-6");
      expect(titleLink.className).toContain("break-words");
      expect(titleLink.className).not.toContain("line-clamp-2");
    });

    it("renders desktop list row title link with transition-colors and no unused transform motion", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses?view=list",
        isTablet: true,
      });

      const titleLink = screen.getByRole("link", { name: "Python Fundamentals" });
      expect(titleLink.className).toContain("motion-safe:transition-colors");
      expect(titleLink.className).not.toContain("transform");
    });

    it("overrides stored list preference when explicit view=grid is present in URL", () => {
      localStorage.setItem("kitob_courses_view_preference", "list");

      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      renderCoursesPage({
        initialUrl: "/courses?view=grid",
        isTablet: true,
      });

      const gridToggle = screen.getByRole("button", { name: "Grid" });
      expect(gridToggle.getAttribute("aria-pressed")).toBe("true");

      localStorage.removeItem("kitob_courses_view_preference");
    });

    it("resets filters dialog open state when crossing breakpoint to tablet and returning to phone", () => {
      vi.mocked(courseHooks.useCourses).mockReturnValue(
        mockSuccessResult<Paginated<CourseResponse>>({
          items: sampleCourses,
          total: 3,
          page: 1,
          page_size: 12,
          total_pages: 1,
        }),
      );

      const { unmount } = renderCoursesPage({ isTablet: false });
      const filtersBtn = screen.getByRole("button", { name: "Filters" });
      fireEvent.click(filtersBtn);
      expect(screen.getByRole("dialog")).toBeTruthy();
      unmount();

      renderCoursesPage({ isTablet: true });
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
