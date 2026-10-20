import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import i18n from "../../i18n";
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

describe("MentorDashboard panes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage("en");
    vi.mocked(userHooks.useMentors).mockReturnValue({ data: undefined } as unknown as ReturnType<typeof userHooks.useMentors>);
  });

  afterEach(() => {
    cleanup();
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

    const courseSection = sectionByHeading("My Active Courses");
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
    expect(screen.getByText("Панель преподавателя")).toBeDefined();

    cleanup();
    i18n.changeLanguage("tg");
    renderMentorDashboard();
    expect(screen.getByText("Ҳамаи давраҳои ҷорӣ баҳогузорӣ шудаанд")).toBeDefined();
    expect(screen.getByText("Панели муаллим")).toBeDefined();
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

describe("mentor dashboard shared primitives", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("ru");
    vi.mocked(userHooks.useMentors).mockReturnValue({ data: undefined } as unknown as ReturnType<typeof userHooks.useMentors>);
    vi.mocked(courseHooks.useCourses).mockReturnValue(mockSuccessResult<PaginatedCourses>(mockPaginatedCourses([mockCourse(5, "Physics")])));
    vi.mocked(userHooks.useMyMentorProfile).mockReturnValue(mockSuccessResult<MentorProfileResponse>({
      ...mentorProfileContractMetadata(0),
      user: mockMentorUser, active_courses: [], active_students_count: 7, avg_score: 0,
    }));
    vi.mocked(journalHooks.useMentorGradingQueue).mockReturnValue(mockSuccessResult<GradingQueueItemResponse[]>([
      { journal_id: 9, course_id: 5, course_title: "Physics", period_label: "Week 2", period_start: "2026-10-01", period_end: "2026-10-07", state: "partial", cells_filled: 3, cells_expected: 8, is_current: true },
    ]));
  });
  afterEach(cleanup);

  it("renders one stat group, list rows for the queue and translated period names", () => {
    const { container } = renderMentorDashboard();
    expect(container.querySelectorAll("[data-stat-group]").length).toBe(1);
    expect(container.querySelectorAll("[data-stat-tile]").length).toBe(3);
    expect(container.querySelectorAll("[data-list-row]").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Неделя 2")).toBeDefined();
    expect(screen.queryByText("Week 2")).toBeNull();
  });

  it("never nests a section card inside another section card", () => {
    const { container } = renderMentorDashboard();
    expect(container.querySelectorAll("[data-section-card] [data-section-card]:not([data-section-flattened])").length).toBe(0);
  });
});

describe("independent retained-empty pane audit", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    vi.mocked(userHooks.useMentors).mockReturnValue({ data: undefined } as unknown as ReturnType<typeof userHooks.useMentors>);
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
    const section = sectionByHeading(pane === "queue" ? "Needs Grading" : "My Active Courses");
    expect(section?.textContent).toContain(pane === "queue"
      ? "Failed to update grading queue — showing cached data"
      : "Failed to update courses — showing cached data");
    const button = section?.querySelector("button");
    expect(button).not.toBeNull();
    if (button) fireEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
