import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import { MentorDashboard } from "./MentorDashboard";
import * as courseHooks from "../../lib/courses/hooks";
import * as journalHooks from "../../lib/journals/hooks";
import * as userHooks from "../../lib/users/hooks";
import type { PaginatedCourses } from "../../lib/courses/types";
import type { GradingQueueItemResponse } from "../../lib/journals/types";
import type { MentorProfileResponse } from "../../lib/users/types";
import {
  mentorProfileContractMetadata, mockCourse, mockErrorResult, mockMentorUser, mockPaginatedCourses, mockSuccessResult, renderMentorDashboard, sectionByHeading,
} from "./MentorDashboardTestSupport";

vi.mock("../../lib/courses/hooks");
vi.mock("../../lib/journals/hooks");
vi.mock("../../lib/users/hooks");

describe("MentorDashboard Invariant Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage("en");
    vi.mocked(userHooks.useMentors).mockReturnValue({ data: undefined } as unknown as ReturnType<typeof userHooks.useMentors>);
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

    expect(screen.getByText("My Students")).toBeDefined();
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

    const hrefs: (string | null)[] = screen.getAllByRole("link").map((link: HTMLElement) => link.getAttribute("href"));
    expect(hrefs).toContain("/journals/42?period=109");
    expect(hrefs).toContain("/journals/42");
    expect(screen.getByText("Week 3")).toBeDefined();
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

    const queueSection = sectionByHeading("Needs Grading");
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

    const courseSection = sectionByHeading("My Active Courses");
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

    const queueSection = sectionByHeading("Needs Grading");
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
});
