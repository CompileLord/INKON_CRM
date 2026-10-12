import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type Location } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../i18n";
import { CourseProfile } from "./CourseProfile";
import { useAuthStore } from "../store/authStore";
import * as courseHooks from "../lib/courses/hooks";
import * as courseEndpoints from "../lib/courses/endpoints";
import * as enrollmentHooks from "../lib/enrollments/hooks";
import * as userHooks from "../lib/users/hooks";
import * as returnContext from "../lib/courses/returnContext";
import type { CourseResponse, CourseScheduleResponse, CourseJournalMetricsResponse, JournalPeriod, CourseProgressChartResponse } from "../lib/courses/types";
import type { User, MentorProfileResponse } from "../lib/users/types";
import { AuthApiError } from "../lib/auth/errors";

vi.mock("../lib/courses/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/hooks")>();
  return {
    ...actual,
    useCourse: vi.fn(),
    useCourseSchedule: vi.fn(),
    useCourseJournalMetrics: vi.fn(),
    useCourseMentorHistory: vi.fn(),
    useCourseProgressChart: vi.fn(),
    useCopyCourse: vi.fn(),
    useDeleteCourse: vi.fn(),
    useCourseJournals: vi.fn(),
  };
});

vi.mock("../lib/courses/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/endpoints")>();
  return {
    ...actual,
    getCourseSchedule: vi.fn(),
  };
});

vi.mock("../lib/enrollments/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/enrollments/hooks")>();
  return {
    ...actual,
    useCourseEnrollmentsCount: vi.fn(),
    useCourseRoster: vi.fn(),
  };
});

vi.mock("../lib/users/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/users/hooks")>();
  return {
    ...actual,
    useMentorProfile: vi.fn(),
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

function mockErrorResult<TData>(error: unknown): UseQueryResult<TData, Error> {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error: error as Error,
    errorUpdateCount: 1,
    errorUpdatedAt: 1,
    failureCount: 1,
    failureReason: error as Error,
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
    isStale: true,
    isSuccess: false,
    isEnabled: true,
    refetch: vi.fn(),
    status: "error",
    promise: new Promise(() => {}),
  };
}

const mockCourse: CourseResponse = {
  id: 42,
  title: "Frontend Development Mastery",
  description: "Comprehensive practical curriculum covering TypeScript, React, and CSS architecture.",
  photo_path: "/uploads/frontend-mastery.jpg",
  start_date: "2026-09-01",
  end_date: "2027-05-31",
  exam_type: "monthly",
  price: "1250.00",
  mentor_id: 101,
  status: "active",
  is_deleted: false,
  created_at: "2026-08-15T10:00:00Z",
  updated_at: "2026-08-15T10:00:00Z",
};

const mockSchedules: CourseScheduleResponse[] = [
  {
    id: 1,
    course_id: 42,
    day_of_week: 0,
    time_start: "09:00:00",
    time_end: "10:30:00",
  },
  {
    id: 2,
    course_id: 42,
    day_of_week: 2,
    time_start: "14:00:00",
    time_end: "15:30:00",
  },
];

const mockJournals: JournalPeriod[] = [
  {
    id: 5,
    course_id: 42,
    period_label: "Week 1",
    period_start: "2026-01-01",
    period_end: "2026-01-07",
    period_type: "week",
  },
];

const mockMetrics: CourseJournalMetricsResponse = {
  class_avg_percentage: 84.5,
  attendance_rate: 92.0,
  periods_total: 4,
  periods_complete: 2,
  at_risk_count: 1,
  at_risk_threshold: 60,
};

const mockMentorUser: User = {
  id: 101,
  first_name: "Farrukh",
  last_name: "Rahimov",
  email: "farrukh@kitob.tj",
  role: "mentor",
  date_of_birth: null,
  phone: "+992900000000",
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

const mockMentorProfile: MentorProfileResponse = {
  user: mockMentorUser,
  active_courses: [],
  active_students_count: 24,
  avg_score: 85,
};

function LocationDisplay({ onLocation }: { onLocation: (loc: Location) => void }) {
  const loc = useLocation();
  onLocation(loc);
  return null;
}

function NavigationSpy({ onNavigate }: { onNavigate: (nav: (to: string) => void) => void }) {
  const navigate = useNavigate();
  onNavigate(navigate);
  return null;
}

function renderCourseProfile(
  initialEntries: (string | { pathname: string; state?: unknown })[] = ["/courses/42"],
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  let currentLocation: Location | null = null;
  let currentNavigate: ((to: string) => void) | null = null;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={initialEntries as unknown as string[]}>
          <NavigationSpy onNavigate={(nav) => { currentNavigate = nav; }} />
          <LocationDisplay onLocation={(loc) => { currentLocation = loc; }} />
          <Routes>
            <Route path="/courses/:id" element={<CourseProfile />} />
            <Route path="/courses" element={<div>Mock Course List</div>} />
            <Route path="/journals/:id" element={<div>Mock Journal Page</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return {
    ...result,
    getLocation: () => currentLocation!,
    navigate: (to: string) => {
      act(() => {
        currentNavigate!(to);
      });
    },
  };
}

describe("CourseProfile Component", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    await i18n.changeLanguage("en");

    useAuthStore.setState({
      role: "superadmin",
      userId: 1,
      status: "authenticated",
      mustSetPassword: false,
    });

    vi.mocked(courseHooks.useCourse).mockReturnValue(mockSuccessResult(mockCourse));
    vi.mocked(courseHooks.useCourseSchedule).mockReturnValue(mockSuccessResult(mockSchedules));
    vi.mocked(courseHooks.useCourseJournalMetrics).mockReturnValue(mockSuccessResult(mockMetrics));
    vi.mocked(enrollmentHooks.useCourseEnrollmentsCount).mockReturnValue(mockSuccessResult(15));
    vi.mocked(courseHooks.useCourseMentorHistory).mockReturnValue(mockSuccessResult([]));
    vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(mockSuccessResult({ labels: [], datasets: [] }));
    vi.mocked(enrollmentHooks.useCourseRoster).mockReturnValue({
      rows: [],
      unresolvedCount: 0,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof enrollmentHooks.useCourseRoster>);
    vi.mocked(userHooks.useMentorProfile).mockReturnValue(
      mockSuccessResult(mockMentorProfile),
    );

    vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 99, title: "Frontend Development Mastery (copy)" }),
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

    vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

    vi.mocked(courseHooks.useCourseJournals).mockReturnValue(mockSuccessResult(mockJournals));
  });

  afterEach(() => {
    cleanup();
  });

  describe("Role Privacy and Permissions", () => {
    it("renders mutable action controls for superadmin", () => {
      renderCourseProfile();

      expect(screen.getAllByText("Frontend Development Mastery").length).toBeGreaterThan(0);
      const actionsMenuTriggers = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" });
      expect(actionsMenuTriggers.length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Mentor assignment history" })).toBeDefined();
    });

    it("renders read-only view for assigned mentor with no admin action menu", () => {
      useAuthStore.setState({
        role: "mentor",
        userId: 101,
        status: "authenticated",
        mustSetPassword: false,
      });

      renderCourseProfile();

      expect(screen.getAllByText("Frontend Development Mastery").length).toBeGreaterThan(0);
      const actionsMenuTriggers = screen.queryAllByRole("button", { name: "Course actions: Frontend Development Mastery" });
      expect(actionsMenuTriggers.length).toBe(0);
      expect(screen.queryByRole("button", { name: "Mentor assignment history" })).toBeNull();
      expect(screen.getAllByRole("link", { name: "Go to journal" }).length).toBeGreaterThan(0);
    });

    it("displays translated access denied message on 403 error without leaking course identity", () => {
      vi.mocked(courseHooks.useCourse).mockReturnValue(
        mockErrorResult(new AuthApiError(403, "Access denied")),
      );

      renderCourseProfile();

      expect(screen.queryByText("Frontend Development Mastery")).toBeNull();
      expect(screen.getByText("Access denied")).toBeDefined();
      expect(screen.getByText("You do not have permission to view this course.")).toBeDefined();
      expect(screen.getByRole("link", { name: "Back to courses" })).toBeDefined();
    });

    it("displays translated not found state on 404 error without leaking course identity", () => {
      vi.mocked(courseHooks.useCourse).mockReturnValue(
        mockErrorResult(new AuthApiError(404, "Not found")),
      );

      renderCourseProfile();

      expect(screen.queryByText("Frontend Development Mastery")).toBeNull();
      expect(screen.getByText("Course not found")).toBeDefined();
      expect(screen.getByRole("link", { name: "Back to courses" })).toBeDefined();
    });
  });

  describe("Tabs Accessibility and Query Isolation", () => {
    it("renders accessible tablist and panel structure", () => {
      renderCourseProfile();

      const tablist = screen.getByRole("tablist");
      expect(tablist).toBeDefined();

      const overviewTab = screen.getByRole("tab", { name: "Overview" });
      const studentsTab = screen.getByRole("tab", { name: "Students" });
      const progressTab = screen.getByRole("tab", { name: "Progress" });

      expect(overviewTab.getAttribute("aria-selected")).toBe("true");
      expect(studentsTab.getAttribute("aria-selected")).toBe("false");
      expect(progressTab.getAttribute("aria-selected")).toBe("false");

      const panel = screen.getByRole("tabpanel");
      expect(panel.id).toBe("tabpanel-overview");
      expect(panel.getAttribute("aria-labelledby")).toBe("tab-overview");
    });

    it("isolates inactive panes by not mounting roster or progress chart in overview", () => {
      renderCourseProfile();

      expect(enrollmentHooks.useCourseRoster).not.toHaveBeenCalled();
      expect(courseHooks.useCourseProgressChart).not.toHaveBeenCalled();
    });

    it("mounts students pane when switching tabs", async () => {
      const { getLocation } = renderCourseProfile();

      const studentsTab = screen.getByRole("tab", { name: "Students" });
      fireEvent.click(studentsTab);

      await waitFor(() => {
        expect(getLocation().search).toContain("tab=students");
        expect(enrollmentHooks.useCourseRoster).toHaveBeenCalledWith(42);
      });
    });

    it("supports keyboard navigation across tabs with immediate activation", () => {
      const { getLocation } = renderCourseProfile();

      const overviewTab = screen.getByRole("tab", { name: "Overview" });
      fireEvent.keyDown(overviewTab, { key: "ArrowRight" });

      expect(getLocation().search).toContain("tab=students");
      const studentsTab = screen.getByRole("tab", { name: "Students" });
      expect(studentsTab.getAttribute("aria-selected")).toBe("true");

      fireEvent.keyDown(studentsTab, { key: "End" });
      expect(getLocation().search).toContain("tab=progress");

      const progressTab = screen.getByRole("tab", { name: "Progress" });
      fireEvent.keyDown(progressTab, { key: "Home" });
      expect(getLocation().search).toBe("");
    });

    it("normalizes invalid URL tab param to overview", () => {
      renderCourseProfile(["/courses/42?tab=unknown_tab"]);

      const overviewTab = screen.getByRole("tab", { name: "Overview" });
      expect(overviewTab.getAttribute("aria-selected")).toBe("true");
    });
  });

  describe("Overview Quiet Aggregate Strip", () => {
    it("renders authoritative enrollment count and explains unavailable grades under existing contract", () => {
      renderCourseProfile();

      expect(screen.getByText("15")).toBeDefined();
      expect(screen.getByText("Grading information unavailable")).toBeDefined();
      expect(screen.getByText("Attendance information unavailable")).toBeDefined();
      expect(screen.queryByText(/not recorded yet/i)).toBeNull();
      const dashes = screen.getAllByLabelText("Unavailable");
      expect(dashes.length).toBe(2);
    });

    it("displays unavailable dash when no journal periods or grades exist rather than fake zero", () => {
      vi.mocked(courseHooks.useCourseJournalMetrics).mockReturnValue(
        mockSuccessResult({
          class_avg_percentage: 0.0,
          attendance_rate: 0.0,
          periods_total: 0,
          periods_complete: 0,
          at_risk_count: 0,
          at_risk_threshold: 60,
        }),
      );

      renderCourseProfile();

      const dashes = screen.getAllByLabelText("Unavailable");
      expect(dashes.length).toBe(2);
    });

    it("renders truthful unknown wording in Russian and Tajik without claiming not recorded yet", async () => {
      await i18n.changeLanguage("ru");
      const { unmount: unmountRu } = renderCourseProfile();

      expect(screen.getByText("Информация об оценках недоступна")).toBeDefined();
      expect(screen.getByText("Информация о посещаемости недоступна")).toBeDefined();
      expect(screen.queryByText(/пока не выставлены/i)).toBeNull();
      unmountRu();

      await i18n.changeLanguage("tg");
      const { unmount: unmountTg } = renderCourseProfile();

      expect(screen.getByText("Маълумот оид ба баҳоҳо дастнорас аст")).toBeDefined();
      expect(screen.getByText("Маълумот оид ба иштирок дастнорас аст")).toBeDefined();
      expect(screen.queryByText(/ҳанӯз/i)).toBeNull();
      unmountTg();
    });
  });

  describe("Schedule and History Independent States", () => {
    it("preserves identity card and description when schedule fails with working retry", () => {
      const refetchSchedule = vi.fn();
      vi.mocked(courseHooks.useCourseSchedule).mockReturnValue({
        ...mockErrorResult(new Error("Network error")),
        refetch: refetchSchedule,
      });

      renderCourseProfile();

      expect(screen.getAllByText("Frontend Development Mastery").length).toBeGreaterThan(0);
      expect(screen.getByText("Comprehensive practical curriculum covering TypeScript, React, and CSS architecture.")).toBeDefined();
      expect(screen.getByText("Failed to load schedule")).toBeDefined();

      const retryBtn = screen.getByRole("button", { name: "Retry" });
      fireEvent.click(retryBtn);
      expect(refetchSchedule).toHaveBeenCalled();
    });

    it("lazily fetches mentor history only when disclosure is opened", () => {
      renderCourseProfile();

      expect(courseHooks.useCourseMentorHistory).toHaveBeenCalledWith(42, false);

      const disclosureBtn = screen.getByRole("button", { name: "Mentor assignment history" });
      fireEvent.click(disclosureBtn);

      expect(courseHooks.useCourseMentorHistory).toHaveBeenCalledWith(42, true);
    });
  });

  describe("Admin Reachable Operations (Duplication and Deletion)", () => {
    it("blocks duplication when schedule is empty and shows accessible inline error", async () => {
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce([]);

      renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      expect(screen.getByText("Duplicate course")).toBeDefined();
      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeDefined();
        expect(screen.getByText(i18n.t("courses:courseCopyMissingSchedule"))).toBeDefined();
      });

      expect(courseHooks.useCopyCourse().mutateAsync).not.toHaveBeenCalled();
    });

    it("duplicates course preserving schedule seconds and navigates to new course", async () => {
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce(mockSchedules);
      const mutateCopyAsync = vi.fn().mockResolvedValueOnce({ id: 88, title: "Frontend Development Mastery (copy)" });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: mutateCopyAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      const { getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateCopyAsync).toHaveBeenCalledWith({
          id: 42,
          payload: expect.objectContaining({
            schedules: [
              { day_of_week: 0, time_start: "09:00:00", time_end: "10:30:00" },
              { day_of_week: 2, time_start: "14:00:00", time_end: "15:30:00" },
            ],
          }),
        });
        expect(getLocation().pathname).toBe("/courses/88");
      });
    });

    it("duplicates course with photo source omitting photo_path in exact CourseCreate schema and keeping schedule seconds", async () => {
      const courseWithPhoto: CourseResponse = {
        ...mockCourse,
        photo_path: "storage/courses/42/photo.jpg",
      };
      vi.mocked(courseHooks.useCourse).mockReturnValue(mockSuccessResult(courseWithPhoto));
      const schedulesWithExactSeconds: CourseScheduleResponse[] = [
        { id: 1, course_id: 42, day_of_week: 1, time_start: "10:00:15", time_end: "11:30:45" },
      ];
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce(schedulesWithExactSeconds);
      const mutateCopyAsync = vi.fn().mockResolvedValueOnce({ id: 89, title: "Frontend Development Mastery (copy)" });
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: mutateCopyAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      const { getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateCopyAsync).toHaveBeenCalledTimes(1);
        const callArgs = mutateCopyAsync.mock.calls[0][0];
        expect(callArgs.id).toBe(42);
        const payload = callArgs.payload;
        expect("photo_path" in payload).toBe(false);
        const permittedKeys = [
          "description",
          "end_date",
          "exam_type",
          "mentor_id",
          "price",
          "schedules",
          "start_date",
          "title",
        ];
        expect(Object.keys(payload).sort()).toEqual(permittedKeys);
        expect(payload.schedules).toEqual([
          { day_of_week: 1, time_start: "10:00:15", time_end: "11:30:45" },
        ]);
        expect(getLocation().pathname).toBe("/courses/89");
      });
    });

    it("deletes course and navigates to preserved safe return URL", async () => {
      const mutateDeleteAsync = vi.fn().mockResolvedValueOnce(undefined);
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: mutateDeleteAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      returnContext.recordCourseListNavigation("?status=active&page=3");

      const { getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      expect(screen.getByText("Delete course")).toBeDefined();
      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateDeleteAsync).toHaveBeenCalledWith(42);
        expect(getLocation().pathname).toBe("/courses");
        expect(getLocation().search).toBe("?status=active&page=3");
      });
    });

    it.each(["en", "ru", "tg"] as const)(
      "renders translated courseCopyError on duplicate failure in %s, preserves dialog and retry, and never exposes raw backend sentinel",
      async (locale) => {
        await i18n.changeLanguage(locale);
        vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValue(mockSchedules);
        const mutateCopyAsync = vi.fn().mockRejectedValueOnce(new AuthApiError(500, "Внутренняя ошибка: raw_copy_sentinel"));
        vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
          mutateAsync: mutateCopyAsync,
          isPending: false,
        } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

        renderCourseProfile();

        const actionsTrigger = screen.getByRole("button", {
          name: `${i18n.t("courses:courseActions")}: ${mockCourse.title}`,
        });
        fireEvent.click(actionsTrigger);

        const duplicateMenuItem = screen.getByRole("menuitem", { name: i18n.t("courses:duplicate") });
        fireEvent.click(duplicateMenuItem);

        const confirmBtn = screen.getByRole("button", { name: i18n.t("courses:duplicate") });
        fireEvent.click(confirmBtn);

        await waitFor(() => {
          expect(mutateCopyAsync).toHaveBeenCalledTimes(1);
          expect(screen.getByRole("dialog")).toBeDefined();
          expect(screen.getByText(i18n.t("courses:courseCopyError"))).toBeDefined();
        });

        expect(screen.queryByText(/raw_copy_sentinel/i)).toBeNull();
        expect(screen.queryByText(/Внутренняя ошибка/i)).toBeNull();

        mutateCopyAsync.mockResolvedValueOnce({
          ...mockCourse,
          id: 88,
          title: "Frontend Development Mastery (copy)",
        });
        fireEvent.click(confirmBtn);

        await waitFor(() => {
          expect(mutateCopyAsync).toHaveBeenCalledTimes(2);
        });
      },
    );

    it.each(["en", "ru", "tg"] as const)(
      "renders translated courseDeleteError on delete failure in %s, preserves dialog and retry, and never exposes raw backend sentinel",
      async (locale) => {
        await i18n.changeLanguage(locale);
        const mutateDeleteAsync = vi.fn().mockRejectedValueOnce(new AuthApiError(400, "ConstraintViolation: raw_delete_sentinel"));
        vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
          mutateAsync: mutateDeleteAsync,
          isPending: false,
        } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

        renderCourseProfile();

        const actionsTrigger = screen.getByRole("button", {
          name: `${i18n.t("courses:courseActions")}: ${mockCourse.title}`,
        });
        fireEvent.click(actionsTrigger);

        const deleteMenuItem = screen.getByRole("menuitem", { name: i18n.t("courses:delete") });
        fireEvent.click(deleteMenuItem);

        const confirmBtn = screen.getByRole("button", { name: i18n.t("courses:delete") });
        fireEvent.click(confirmBtn);

        await waitFor(() => {
          expect(mutateDeleteAsync).toHaveBeenCalledTimes(1);
          expect(screen.getByRole("dialog")).toBeDefined();
          expect(screen.getByText(i18n.t("courses:courseDeleteError"))).toBeDefined();
        });

        expect(screen.queryByText(/raw_delete_sentinel/i)).toBeNull();
        expect(screen.queryByText(/ConstraintViolation/i)).toBeNull();

        mutateDeleteAsync.mockResolvedValueOnce(undefined);
        fireEvent.click(confirmBtn);

        await waitFor(() => {
          expect(mutateDeleteAsync).toHaveBeenCalledTimes(2);
        });
      },
    );

    it("safely handles duplicate resolution when user navigates away while write is pending", async () => {
      let resolveCopy: (val: CourseResponse) => void = () => {};
      const pendingPromise = new Promise<CourseResponse>((resolve) => {
        resolveCopy = resolve;
      });
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce(mockSchedules);
      const mutateCopyAsync = vi.fn().mockReturnValue(pendingPromise);
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: mutateCopyAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      const { navigate, getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateCopyAsync).toHaveBeenCalled();
      });

      navigate("/courses");
      expect(getLocation().pathname).toBe("/courses");

      const copiedCourse: CourseResponse = {
        ...mockCourse,
        id: 999,
        title: "Frontend Development Mastery (copy)",
      };

      await act(async () => {
        resolveCopy(copiedCourse);
        await Promise.resolve();
      });

      expect(getLocation().pathname).toBe("/courses");
      expect(screen.getByText("Mock Course List")).toBeDefined();
      expect(screen.queryByText("Frontend Development Mastery (copy)")).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("safely handles duplicate rejection when user navigates away while write is pending", async () => {
      let rejectCopy: (err: unknown) => void = () => {};
      const pendingPromise = new Promise<CourseResponse>((_, reject) => {
        rejectCopy = reject;
      });
      vi.mocked(courseEndpoints.getCourseSchedule).mockResolvedValueOnce(mockSchedules);
      const mutateCopyAsync = vi.fn().mockReturnValue(pendingPromise);
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: mutateCopyAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      const { navigate, getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateCopyAsync).toHaveBeenCalled();
      });

      navigate("/courses");
      expect(getLocation().pathname).toBe("/courses");

      await act(async () => {
        rejectCopy(new Error("Database failure"));
        await Promise.resolve();
      });

      expect(getLocation().pathname).toBe("/courses");
      expect(screen.getByText("Mock Course List")).toBeDefined();
      expect(screen.queryByText("Database failure")).toBeNull();
      expect(screen.queryByText(i18n.t("courses:courseCopyError"))).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("does not dispatch duplicate POST if user departs while schedule prefetch is pending", async () => {
      let resolveSchedule: (val: CourseScheduleResponse[]) => void = () => {};
      const pendingSchedulePromise = new Promise<CourseScheduleResponse[]>((resolve) => {
        resolveSchedule = resolve;
      });
      vi.mocked(courseEndpoints.getCourseSchedule).mockReturnValue(pendingSchedulePromise);
      const mutateCopyAsync = vi.fn();
      vi.mocked(courseHooks.useCopyCourse).mockReturnValue({
        mutateAsync: mutateCopyAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useCopyCourse>);

      const { navigate, getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const duplicateMenuItem = screen.getByRole("menuitem", { name: "Duplicate" });
      fireEvent.click(duplicateMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Duplicate" });
      fireEvent.click(confirmBtn);

      expect(courseEndpoints.getCourseSchedule).toHaveBeenCalledWith(42);

      navigate("/courses");
      expect(getLocation().pathname).toBe("/courses");

      await act(async () => {
        resolveSchedule(mockSchedules);
        await Promise.resolve();
      });

      expect(mutateCopyAsync).not.toHaveBeenCalled();
      expect(getLocation().pathname).toBe("/courses");
      expect(screen.getByText("Mock Course List")).toBeDefined();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("safely handles delete resolution when user navigates away while delete is pending", async () => {
      let resolveDelete: () => void = () => {};
      const pendingPromise = new Promise<void>((resolve) => {
        resolveDelete = resolve;
      });
      const mutateDeleteAsync = vi.fn().mockReturnValue(pendingPromise);
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: mutateDeleteAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      const { navigate, getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateDeleteAsync).toHaveBeenCalledWith(42);
      });

      navigate("/courses/99");
      expect(getLocation().pathname).toBe("/courses/99");

      await act(async () => {
        resolveDelete();
        await Promise.resolve();
      });

      expect(getLocation().pathname).toBe("/courses/99");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("safely handles delete rejection when user navigates away while delete is pending", async () => {
      let rejectDelete: (err: unknown) => void = () => {};
      const pendingPromise = new Promise<void>((_, reject) => {
        rejectDelete = reject;
      });
      const mutateDeleteAsync = vi.fn().mockReturnValue(pendingPromise);
      vi.mocked(courseHooks.useDeleteCourse).mockReturnValue({
        mutateAsync: mutateDeleteAsync,
        isPending: false,
      } as unknown as ReturnType<typeof courseHooks.useDeleteCourse>);

      const { navigate, getLocation } = renderCourseProfile();

      const actionsTrigger = screen.getAllByRole("button", { name: "Course actions: Frontend Development Mastery" })[0];
      fireEvent.click(actionsTrigger);

      const deleteMenuItem = screen.getByRole("menuitem", { name: "Delete" });
      fireEvent.click(deleteMenuItem);

      const confirmBtn = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateDeleteAsync).toHaveBeenCalledWith(42);
      });

      navigate("/courses/99");
      expect(getLocation().pathname).toBe("/courses/99");

      await act(async () => {
        rejectDelete(new Error("Delete constraint error"));
        await Promise.resolve();
      });

      expect(getLocation().pathname).toBe("/courses/99");
      expect(screen.queryByText("Delete constraint error")).toBeNull();
      expect(screen.queryByText(i18n.t("courses:courseDeleteError"))).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("Safe Back and Outbound Journal Context", () => {
    it("uses safe list return URL for Back button", () => {
      returnContext.recordCourseListNavigation("?sort=price&page=2");

      renderCourseProfile();

      const backLink = screen.getByRole("link", { name: "Back to courses" });
      expect(backLink.getAttribute("href")).toBe("/courses?page=2&sort=price");
    });

    it("outbound Open journal link carries course journal path", () => {
      renderCourseProfile();

      const journalLinks = screen.getAllByRole("link", { name: "Go to journal" });
      expect(journalLinks[0].getAttribute("href")).toBe("/journals/42");
    });

    it("records departure return context only on explicit click of journal link", () => {
      renderCourseProfile(["/courses/42?tab=progress&period=5"]);

      expect(returnContext.getSavedCourseDetailContext(42)).toBeNull();

      const journalLink = screen.getByRole("link", { name: "Go to journal" });
      fireEvent.click(journalLink);

      const saved = returnContext.getSavedCourseDetailContext(42);
      expect(saved).not.toBeNull();
      expect(saved?.tab).toBe("progress");
      expect(saved?.periodId).toBe(5);
    });

    it("retains progress search when toggling between tabs", () => {
      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(
        mockSuccessResult({
          labels: ["Period 1", "Total"],
          datasets: [
            {
              student_id: 1,
              name: "Alice Wonderland",
              color_hex: "#10b981",
              scores: [85, 85],
              percentages: [85, 85],
            },
          ],
        }),
      );

      renderCourseProfile(["/courses/42?tab=progress"]);

      const searchInput = screen.getByRole("textbox");
      fireEvent.change(searchInput, { target: { value: "Alice" } });
      expect(searchInput.getAttribute("value")).toBe("Alice");

      const overviewTab = screen.getByRole("tab", { name: "Overview" });
      fireEvent.click(overviewTab);

      const progressTab = screen.getByRole("tab", { name: "Progress" });
      fireEvent.click(progressTab);

      const restoredInput = screen.getByRole("textbox");
      expect(restoredInput.getAttribute("value")).toBe("Alice");
    });

    it("renders working Retry button when metrics fail", () => {
      const refetchMetrics = vi.fn();
      vi.mocked(courseHooks.useCourseJournalMetrics).mockReturnValue({
        ...mockErrorResult(new Error("500")),
        refetch: refetchMetrics,
      });

      renderCourseProfile();

      const retryButtons = screen.getAllByRole("button", { name: "Retry" });
      expect(retryButtons.length).toBeGreaterThan(0);
      fireEvent.click(retryButtons[0]);
      expect(refetchMetrics).toHaveBeenCalled();
    });

    it("hides cached course when refetch returns 403 Access Denied", () => {
      vi.mocked(courseHooks.useCourse).mockReturnValue({
        data: mockCourse,
        isLoading: false,
        isError: true,
        error: new AuthApiError(403, "Access denied"),
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourse>);

      renderCourseProfile();

      expect(screen.queryByText("Frontend Development Mastery")).toBeNull();
      expect(screen.getByText("Access denied")).toBeDefined();
      expect(screen.getByText("You do not have permission to view this course.")).toBeDefined();
    });

    it("retains cached course and renders inline error banner with retry on ordinary network error", () => {
      const refetchCourse = vi.fn();
      vi.mocked(courseHooks.useCourse).mockReturnValue({
        data: mockCourse,
        isLoading: false,
        isError: true,
        error: new Error("Network timeout"),
        refetch: refetchCourse,
      } as unknown as ReturnType<typeof courseHooks.useCourse>);

      renderCourseProfile();

      expect(screen.getByText("Frontend Development Mastery")).toBeDefined();
      const retryButtons = screen.getAllByRole("button", { name: "Retry" });
      expect(retryButtons.length).toBeGreaterThan(0);
      fireEvent.click(retryButtons[0]);
      expect(refetchCourse).toHaveBeenCalled();
    });

    it("restores validated return context on explicit internal return signal and ignores it on direct entry", async () => {
      returnContext.recordCourseDetailNavigation(42, {
        tab: "progress",
        periodId: 5,
        search: "Zalina",
        sort: "name_asc",
        view: "table",
        scrollY: 200,
      });

      const { getLocation: getDirectLocation } = renderCourseProfile(["/courses/42"]);
      expect(getDirectLocation().pathname).toBe("/courses/42");
      expect(getDirectLocation().search).toBe("");
      expect(screen.queryByDisplayValue("Zalina")).toBeNull();

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(
        mockSuccessResult({
          labels: ["Period 5", "Total"],
          datasets: [
            {
              student_id: 1,
              name: "Zalina Student",
              color_hex: "#10b981",
              scores: [90, 90],
              percentages: [90, 90],
            },
          ],
        }),
      );

      const { getLocation: getReturnLocation } = renderCourseProfile([
        { pathname: "/courses/42", state: { fromInternalReturn: true } },
      ]);

      await waitFor(() => {
        expect(getReturnLocation().search).toContain("tab=progress");
        expect(getReturnLocation().search).toContain("period=5");
        expect(screen.getByDisplayValue("Zalina")).toBeDefined();
      });
    });

    it("restores saved nonzero scroll position after course data is loaded", async () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      returnContext.recordCourseDetailNavigation(42, {
        tab: "overview",
        scrollY: 450,
      });

      renderCourseProfile([
        { pathname: "/courses/42", state: { fromInternalReturn: true } },
      ]);

      await waitFor(() => {
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 450, behavior: "instant" });
      });
    });

    it("cleans up invalid period query param when journals list is empty", async () => {
      vi.mocked(courseHooks.useCourseJournals).mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseJournals>);

      const { getLocation } = renderCourseProfile(["/courses/42?tab=progress&period=999"]);

      await waitFor(() => {
        expect(getLocation().search).toBe("?tab=progress");
      });
    });

    it("cleans up negative or non-integer period query param", async () => {
      vi.mocked(courseHooks.useCourseJournals).mockReturnValue({
        data: mockJournals,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseJournals>);

      const { getLocation } = renderCourseProfile(["/courses/42?tab=progress&period=-12"]);

      await waitFor(() => {
        expect(getLocation().search).toBe("?tab=progress");
      });
    });

    it("retains valid period param on journals query failure and does not strip it as if empty", async () => {
      vi.mocked(courseHooks.useCourseJournals).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("500 internal server error"),
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseJournals>);

      const { getLocation } = renderCourseProfile(["/courses/42?tab=progress&period=5"]);

      await waitFor(() => {
        expect(getLocation().search).toBe("?tab=progress&period=5");
      });
    });

    it("displays local translated 44px retry on journals query failure while preserving identity, loaded progress, and selected period", async () => {
      const mockRefetchJournals = vi.fn().mockResolvedValue({});
      vi.mocked(courseHooks.useCourseJournals).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("500 internal server error"),
        refetch: mockRefetchJournals,
      } as unknown as ReturnType<typeof courseHooks.useCourseJournals>);

      const mockChartData: CourseProgressChartResponse = {
        labels: ["Week 1", "Week 2", "Average"],
        datasets: [
          {
            student_id: 1,
            name: "Alice Smith",
            color_hex: "#6366f1",
            scores: [85, 90, 88],
            percentages: [85, 90, 88],
          },
        ],
      };
      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(mockSuccessResult(mockChartData));

      const { getLocation } = renderCourseProfile(["/courses/42?tab=progress&period=5"]);

      await waitFor(() => {
        expect(getLocation().search).toBe("?tab=progress&period=5");
      });

      expect(screen.getAllByText("Frontend Development Mastery").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Alice Smith").length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText(i18n.t("courses:searchStudent"))).toBeDefined();

      expect(screen.getByText(i18n.t("courses:journalsLoadError"))).toBeDefined();

      const retryButtons = screen.getAllByRole("button", { name: i18n.t("common:retry") });
      const metadataRetryBtn = retryButtons[0];
      expect(metadataRetryBtn.className).toContain("min-h-[44px]");
      expect(metadataRetryBtn.className).toContain("min-w-[44px]");

      fireEvent.click(metadataRetryBtn);
      expect(mockRefetchJournals).toHaveBeenCalledTimes(1);
    });

    it("cancels pending scroll restoration on user wheel interaction", async () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      returnContext.recordCourseDetailNavigation(42, {
        tab: "progress",
        scrollY: 450,
      });

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseProgressChart>);

      renderCourseProfile([
        { pathname: "/courses/42", state: { fromInternalReturn: true } },
      ]);

      window.dispatchEvent(new Event("wheel"));

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(
        mockSuccessResult({ labels: ["Week 1"], datasets: [] }),
      );

      await waitFor(() => {
        expect(scrollToSpy).not.toHaveBeenCalled();
      });
    });

    it("cancels pending scroll restoration on user keyboard interaction", async () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      returnContext.recordCourseDetailNavigation(42, {
        tab: "progress",
        scrollY: 450,
      });

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof courseHooks.useCourseProgressChart>);

      renderCourseProfile([
        { pathname: "/courses/42", state: { fromInternalReturn: true } },
      ]);

      window.dispatchEvent(new Event("keydown"));

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(
        mockSuccessResult({ labels: ["Week 1"], datasets: [] }),
      );

      await waitFor(() => {
        expect(scrollToSpy).not.toHaveBeenCalled();
      });
    });

    it("preserves pending scroll target across StrictMode remount and restores once target pane is ready", async () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      returnContext.recordCourseDetailNavigation(42, {
        tab: "progress",
        scrollY: 280,
      });

      vi.mocked(courseHooks.useCourseProgressChart).mockReturnValue(
        mockSuccessResult({ labels: ["Week 1"], datasets: [] }),
      );

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
        },
      });

      render(
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            <I18nextProvider i18n={i18n}>
              <MemoryRouter initialEntries={[{ pathname: "/courses/42", state: { fromInternalReturn: true } }] as unknown as string[]}>
                <Routes>
                  <Route path="/courses/:id" element={<CourseProfile />} />
                </Routes>
              </MemoryRouter>
            </I18nextProvider>
          </QueryClientProvider>
        </StrictMode>,
      );

      await waitFor(() => {
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 280, behavior: "instant" });
      });
    });
  });
});
