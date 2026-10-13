import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../../i18n";
import { MentorDashboard } from "./MentorDashboard";
import * as courseHooks from "../../lib/courses/hooks";
import * as journalHooks from "../../lib/journals/hooks";
import * as userHooks from "../../lib/users/hooks";
import type { CourseResponse, PaginatedCourses } from "../../lib/courses/types";
import type { GradingQueueItemResponse } from "../../lib/journals/types";
import type { MentorProfileResponse, User } from "../../lib/users/types";

vi.mock("../../lib/courses/hooks");
vi.mock("../../lib/journals/hooks");
vi.mock("../../lib/users/hooks");

const mockMentorUser: User = {
  id: 10,
  first_name: "Mentor",
  last_name: "Fixture",
  email: "mentor@kitob.example.com",
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

function mentorProfileContractMetadata(avgScore: number): Pick<
  MentorProfileResponse,
  | "active_students_population"
  | "avg_score_grading_state"
  | "avg_score_provenance"
  | "avg_score_basis"
  | "avg_score_summary_count"
  | "avg_score_defined_ratio_count"
  | "avg_score_undefined_ratio_count"
  | "avg_score_defined_ratios_mean"
> {
  return {
    active_students_population: "active_enrollments_on_assigned_courses_including_soft_deleted_courses",
    avg_score_grading_state: "unknown",
    avg_score_provenance: "unknown",
    avg_score_basis: "all_summaries_on_courses_currently_assigned_including_soft_deleted_and_archived",
    avg_score_summary_count: 1,
    avg_score_defined_ratio_count: 1,
    avg_score_undefined_ratio_count: 0,
    avg_score_defined_ratios_mean: avgScore,
  };
}function mockCourse(id: number, title: string, exam_type: "weekly" | "monthly" = "monthly"): CourseResponse {
  return {
    id,
    title,
    description: "",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    exam_type,
    price: "100.00",
    mentor_id: 10,
    status: "active",
    photo_path: null,
    is_deleted: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function mockPaginatedCourses(items: CourseResponse[]): PaginatedCourses {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 50,
    total_pages: 1,
  };
}

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

function mockInitialErrorResult<TData>(refetch = vi.fn()): UseQueryResult<TData, Error> {
  const error = new Error("Failed to load");
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
  const error = new Error("Refetch failed");
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

function mockErrorResult<TData>(data?: TData, refetch = vi.fn()): UseQueryResult<TData, Error> {
  if (data !== undefined) {
    return mockStaleErrorResult(data, refetch);
  }
  return mockInitialErrorResult(refetch);
}

function renderMentorDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <MentorDashboard />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

describe("MentorDashboard Invariant Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage("en");
  });

  afterEach(() => {
    cleanup();
  });

  it("preserves real zeros in summary cards without displaying dashes or concealing zero", () => {
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([]))
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockSuccessResult<GradingQueueItemResponse[]>([])
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(0),
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 0,
        avg_score: 0,
      })
    );

    renderMentorDashboard();

    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("—")).toBeNull();
  });

  it("handles unavailable student count with metadata line and retry without fabricating a peer dash card", () => {
    const refetchProfile = vi.fn();
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([mockCourse(1, "Physics")]))
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockSuccessResult<GradingQueueItemResponse[]>([])
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockErrorResult<MentorProfileResponse>(undefined, refetchProfile)
    );

    renderMentorDashboard();

    expect(screen.queryByText("My Students")).toBeNull();
    const alertMessage = screen.getByText("Student count currently unavailable");
    expect(alertMessage).toBeDefined();

    const retryButton = screen.getByRole("button", { name: /retry my students/i });
    expect(retryButton).toBeDefined();
    fireEvent.click(retryButton);
    expect(refetchProfile).toHaveBeenCalledTimes(1);
  });

  it("renders calm check and text for empty grading queue without congratulations banner", () => {
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([]))
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockSuccessResult<GradingQueueItemResponse[]>([])
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(85),
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 5,
        avg_score: 85,
      })
    );

    renderMentorDashboard();

    expect(screen.getByText("All current periods are graded")).toBeDefined();
    expect(screen.queryByText(/congratulations|отлично|tabrik/i)).toBeNull();
  });

  it("navigates with distinct course_id and journal_id in queue links and avoids whole card action", () => {
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([mockCourse(42, "Advanced Algorithms", "weekly")]))
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockSuccessResult<GradingQueueItemResponse[]>([
        {
          journal_id: 109,
          course_id: 42,
          course_title: "Advanced Algorithms",
          period_label: "Week 3",
          period_start: "2026-10-01",
          period_end: "2026-10-07",
          state: "partial",
          cells_filled: 4,
          cells_expected: 10,
          is_current: true,
        },
      ])
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(91),
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 12,
        avg_score: 91,
      })
    );

    renderMentorDashboard();

    const queueLink = screen.getByRole("link", {
      name: /open gradebook: Advanced Algorithms - Week 3/i,
    });
    expect(queueLink.getAttribute("href")).toBe("/journals/42?period=109");

    const courseLink = screen.getByRole("link", {
      name: /^open gradebook: Advanced Algorithms$/i,
    });
    expect(courseLink.getAttribute("href")).toBe("/journals/42");
  });

  it("renders correct status badge for valid empty status and falls back to unavailable for unknown status", () => {
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([]))
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockSuccessResult<GradingQueueItemResponse[]>([
        {
          journal_id: 201,
          course_id: 10,
          course_title: "Algebra I",
          period_label: "Month 1",
          period_start: "2026-10-01",
          period_end: "2026-10-31",
          state: "empty",
          cells_filled: 0,
          cells_expected: 15,
          is_current: true,
        },
        {
          journal_id: 202,
          course_id: 10,
          course_title: "Algebra I",
          period_label: "Month 2",
          period_start: "2026-11-01",
          period_end: "2026-11-30",
          state: "unknown_future_status",
          cells_filled: 0,
          cells_expected: 15,
          is_current: false,
        },
      ])
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(90),
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 10,
        avg_score: 90,
      })
    );

    renderMentorDashboard();

    expect(screen.getByText("Not started")).toBeDefined();
    expect(screen.getByText("Unavailable")).toBeDefined();
  });

  it("retains loaded queue and displays stale notice with local retry upon refetch failure", () => {
    const refetchQueue = vi.fn();
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([]))
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockErrorResult<GradingQueueItemResponse[]>(
        [
          {
            journal_id: 101,
            course_id: 25,
            course_title: "Biology 101",
            period_label: "Week 1",
            period_start: "2026-09-01",
            period_end: "2026-09-07",
            state: "empty",
            cells_filled: 0,
            cells_expected: 8,
            is_current: false,
          },
        ],
        refetchQueue
      )
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(75),
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 8,
        avg_score: 75,
      })
    );

    renderMentorDashboard();

    expect(screen.getByText("Biology 101")).toBeDefined();
    expect(screen.getByText("Failed to update grading queue — showing cached data")).toBeDefined();

    const queueSection = document.querySelector('section[aria-labelledby="grading-queue-heading"]');
    const queueRetry = queueSection?.querySelector("button");
    expect(queueRetry).not.toBeNull();
    if (queueRetry) fireEvent.click(queueRetry);
    expect(refetchQueue).toHaveBeenCalledTimes(1);
  });

  it("handles initial courses failure with retry and actual recovery rerender", () => {
    const refetchCourses = vi.fn();
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockErrorResult<PaginatedCourses>(undefined, refetchCourses)
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockSuccessResult<GradingQueueItemResponse[]>([])
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(80),
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 5,
        avg_score: 80,
      })
    );

    const { rerender } = renderMentorDashboard();

    expect(screen.getByText("Active courses count unavailable")).toBeDefined();
    expect(screen.getByText("Failed to load course")).toBeDefined();

    const courseSection = document.querySelector('section[aria-labelledby="active-courses-heading"]');
    const retryBtn = courseSection?.querySelector("button");
    expect(retryBtn).not.toBeNull();
    if (retryBtn) fireEvent.click(retryBtn);
    expect(refetchCourses).toHaveBeenCalledTimes(1);

    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([mockCourse(77, "Modern Physics")]))
    );

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <MentorDashboard />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText("Modern Physics")).toBeDefined();
    expect(screen.queryByText("Failed to load course")).toBeNull();
  });

  it("handles initial grading queue failure with retry and actual recovery rerender", () => {
    const refetchQueue = vi.fn();
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([]))
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockErrorResult<GradingQueueItemResponse[]>(undefined, refetchQueue)
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(80),
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 5,
        avg_score: 80,
      })
    );

    const { rerender } = renderMentorDashboard();

    expect(screen.getByText("Failed to load journal data")).toBeDefined();

    const queueSection = document.querySelector('section[aria-labelledby="grading-queue-heading"]');
    const retryBtn = queueSection?.querySelector("button");
    expect(retryBtn).not.toBeNull();
    if (retryBtn) fireEvent.click(retryBtn);
    expect(refetchQueue).toHaveBeenCalledTimes(1);

    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockSuccessResult<GradingQueueItemResponse[]>([
        {
          journal_id: 301,
          course_id: 77,
          course_title: "Modern Physics",
          period_label: "Quantum Week",
          period_start: "2026-10-01",
          period_end: "2026-10-07",
          state: "empty",
          cells_filled: 0,
          cells_expected: 12,
          is_current: true,
        },
      ])
    );

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <MentorDashboard />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText("Modern Physics")).toBeDefined();
    expect(screen.getByText("Quantum Week")).toBeDefined();
    expect(screen.queryByText("Failed to load journal data")).toBeNull();
  });

  it("retains courses data and shows stale notice upon refetch failure", () => {
    const refetchCourses = vi.fn();
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockErrorResult<PaginatedCourses>(
        mockPaginatedCourses([mockCourse(99, "Chemistry Laboratory")]),
        refetchCourses
      )
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockSuccessResult<GradingQueueItemResponse[]>([])
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(80),
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 5,
        avg_score: 80,
      })
    );

    renderMentorDashboard();

    expect(screen.getByText("Chemistry Laboratory")).toBeDefined();
    expect(screen.getByText("Failed to update courses — showing cached data")).toBeDefined();

    const courseSection = document.querySelector('section[aria-labelledby="active-courses-heading"]');
    const courseRetry = courseSection?.querySelector("button");
    expect(courseRetry).not.toBeNull();
    if (courseRetry) fireEvent.click(courseRetry);
    expect(refetchCourses).toHaveBeenCalledTimes(1);
  });

  it("renders explained empty state when mentor has no active courses", () => {
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([]))
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockSuccessResult<GradingQueueItemResponse[]>([])
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(0),
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 0,
        avg_score: 0,
      })
    );

    renderMentorDashboard();

    expect(screen.getByText("No active assigned groups")).toBeDefined();
    expect(screen.getByText("Assigned active groups will appear here once assigned to you.")).toBeDefined();
  });

  it("renders localized copy correctly in Russian and Tajik without fallback errors", () => {
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([]))
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockSuccessResult<GradingQueueItemResponse[]>([])
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(0),
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 0,
        avg_score: 0,
      })
    );

    i18n.changeLanguage("ru");
    renderMentorDashboard();
    expect(screen.getByText("Все текущие периоды оценены")).toBeDefined();
    expect(screen.getByText("Панель Преподавателя")).toBeDefined();

    cleanup();
    i18n.changeLanguage("tg");
    renderMentorDashboard();
    expect(screen.getByText("Ҳамаи давраҳои ҷорӣ баҳогузорӣ шудаанд")).toBeDefined();
    expect(screen.getByText("Панели Муаллим")).toBeDefined();
  });

  it("scopes mentor profile and requests using current identity hook without administrative parameters", () => {
    vi.mocked(courseHooks.useCourses).mockReturnValue(
      mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([]))
    );
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(
      mockSuccessResult<GradingQueueItemResponse[]>([])
    );
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(88),
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 3,
        avg_score: 88,
      })
    );

    renderMentorDashboard();

    expect(userHooks.useMyMentorProfile).toHaveBeenCalledTimes(1);
    expect(userHooks.useMyMentorProfile).toHaveBeenCalledWith();
  });
});

describe("independent retained-empty pane audit", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(mockSuccessResult<MentorProfileResponse>({
        ...mentorProfileContractMetadata(0),
      user: mockMentorUser, active_courses: [], active_students_count: 0, avg_score: 0,
    }));
  });
  afterEach(cleanup);

  it.each(["queue", "courses"] as const)("retains explained empty %s with a local update-failed notice and retry", (pane) => {
    const retry = vi.fn();
    vi.mocked(courseHooks.useCourses).mockReturnValue(pane === "courses"
      ? mockErrorResult<PaginatedCourses>(mockPaginatedCourses([]), retry)
      : mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([])));
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(pane === "queue"
      ? mockErrorResult<GradingQueueItemResponse[]>([], retry)
      : mockSuccessResult<GradingQueueItemResponse[]>([]));
    renderMentorDashboard();
    expect(screen.getByText(pane === "queue" ? "All current periods are graded" : "No active assigned groups")).toBeDefined();
    const section = document.querySelector(`section[aria-labelledby="${pane === "queue" ? "grading-queue" : "active-courses"}-heading"]`);
    expect(section?.textContent).toContain(pane === "queue"
      ? "Failed to update grading queue — showing cached data"
      : "Failed to update courses — showing cached data");
    const button = section?.querySelector("button");
    expect(button).not.toBeNull();
    if (button) fireEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
