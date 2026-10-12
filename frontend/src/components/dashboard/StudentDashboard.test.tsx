import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import i18n from "../../i18n";
import { StudentDashboard } from "./StudentDashboard";
import { StudentResultCard } from "../student/StudentResultCard";
import type { ReactElement } from "react";
import * as userHooks from "../../lib/users/hooks";
import * as journalHooks from "../../lib/journals/hooks";
import type { JournalDetailResponse } from "../../lib/journals/types";
import type {
  StudentProfileResponse,
  StudentJournalPeriod,
  MentorProfileResponse,
  User,
  StudentCourseProfile,
} from "../../lib/users/types";

vi.mock("../../lib/users/hooks");
vi.mock("../../lib/journals/hooks");

const mockStudentUser: User = {
  id: 1,
  first_name: "Faridun",
  last_name: "Nazarov",
  email: "student@kitob.example.com",
  role: "student",
  date_of_birth: "2008-01-01",
  phone: "+992900000001",
  parent_telegram_chat_id: null,
  parent_phone: null,
  photo_path: null,
  thumbnail_path: null,
  payment_day_of_month: 1,
  must_set_password: false,
  is_deleted: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockMentorUser: User = {
  id: 10,
  first_name: "Davron",
  last_name: "Karimov",
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

function createCourseEntry(
  id: number,
  title: string,
  nextLessonAt: string | null = null,
  periodsGraded = 1,
  bucket: "active" | "archive" = "active"
): StudentCourseProfile {
  return {
    course: {
      id,
      title,
      description: "Description",
      photo_path: null,
      start_date: "2026-06-01",
      end_date: "2026-08-31",
      exam_type: "weekly",
      price: "100.00",
      mentor_id: 10,
      status: "active",
      is_deleted: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    enrollment_status: "active",
    bucket,
    my_avg_percentage: 95.5,
    attendance_percentage: 90.0,
    absences: 1,
    periods_total: 4,
    periods_graded: periodsGraded,
    my_rank: 1,
    class_size: 10,
    class_avg_percentage: 80.0,
    next_lesson_at: nextLessonAt,
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
  return mockInitialErrorResult<TData>(refetch);
}

function renderComponent(element: ReactElement = <StudentDashboard />) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          {element}
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

const recordedPeriod: StudentJournalPeriod = { journal_id: 7, course_id: 1, course_title: "Recorded course", period_label: "Recorded period", period_start: "2026-01-01", period_end: "2026-01-31", sum_score: 0, max_period_score: 0, percentage: 0, attendance_count: 0, total_lessons: 0, state: "in_progress" };

function recordedDetail(sumScore: number, maxScore: number, bonusScore: number): JournalDetailResponse {
  return { journal_id: 7, course_id: 1, period_label: "Recorded period", period_start: "2026-01-01", period_end: "2026-01-31", period_type: "month", exam_max_score: 10, lesson_dates: [], students: [{ student_id: 1, first_name: "Own", last_name: "Student", email: "own@example.com", color_hex: "", entries: [], summary: { id: 1, homework_score: 0, attendance_score: 0, exam_score: sumScore - bonusScore, bonus_score: bonusScore, sum_score: sumScore, max_period_score: maxScore, percentage: maxScore ? sumScore / maxScore * 100 : 0, attendance_count: 0, total_lessons: 0, version: 1 } }] };
}

describe("StudentDashboard", () => {
  beforeEach(() => {
    vi.mocked(journalHooks.useJournal).mockReturnValue(mockSuccessResult<JournalDetailResponse>({ journal_id: 1, course_id: 1, period_label: "Period", period_start: "2026-01-01", period_end: "2026-01-31", period_type: "month", exam_max_score: 10, lesson_dates: [], students: [] }));
    vi.mocked(userHooks.useMentorProfile).mockReturnValue(
      mockSuccessResult<MentorProfileResponse>({
        user: mockMentorUser,
        active_courses: [],
        active_students_count: 5,
        avg_score: 90.0,
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders compact name heading H1 and does not render active-student hero pill", () => {
    const profile: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 92.5,
        attendance_percentage: 95.0,
        absences: 2,
        total_lessons: 20,
        active_course_count: 2,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "Python 101", "2026-06-15T04:00:00Z")],
      avg_score: 92.5,
      absences: 2,
      total_lessons: 20,
    };

    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profile));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([]));

    renderComponent();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Faridun Nazarov");
    expect(screen.queryByText(/активный студент/i)).toBeNull();
    expect(screen.queryByText(/active student/i)).toBeNull();
  });

  it("selects earliest upcoming lesson among active courses and links to course", () => {
    const profile: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 88.0,
        attendance_percentage: 92.0,
        absences: 1,
        total_lessons: 12,
        active_course_count: 2,
        archived_course_count: 1,
      },
      courses: [
        createCourseEntry(1, "Python Advanced", "2026-06-20T09:00:00Z"),
        createCourseEntry(2, "English B2", "2026-06-12T05:00:00Z"),
        createCourseEntry(3, "Archived Course", "2026-06-10T05:00:00Z", 0, "archive"),
      ],
      avg_score: 88.0,
      absences: 1,
      total_lessons: 12,
    };

    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profile));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([]));

    renderComponent();

    const lessonSection = screen.getByRole("region", { name: /следующее занятие|next lesson/i });
    expect(lessonSection.textContent).toContain("English B2");
    expect(lessonSection.textContent).not.toContain("Python Advanced");

    const viewCourseBtn = screen.getByRole("link", { name: /перейти к курсу|view course/i });
    expect(viewCourseBtn.getAttribute("href")).toBe("/my/courses/2");
  });

  it("renders explained empty card when no active course has upcoming lessons", () => {
    const profile: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 0.0,
        attendance_percentage: 0.0,
        absences: 0,
        total_lessons: 0,
        active_course_count: 1,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "Course Without Schedule", null)],
      avg_score: 0.0,
      absences: 0,
      total_lessons: 0,
    };

    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profile));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([]));

    renderComponent();

    const lessonSection = screen.getByRole("region", { name: /следующее занятие|next lesson/i });
    expect(lessonSection.textContent).toMatch(/нет запланированных занятий|no upcoming lessons/i);
    expect(within(lessonSection).getByRole("link", { name: /все →|all →/i }).getAttribute("href")).toBe("/my/courses");
  });

  it("survives mentor profile lookup failure without hiding valid lesson card", () => {
    const profile: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 90.0,
        attendance_percentage: 100.0,
        absences: 0,
        total_lessons: 10,
        active_course_count: 1,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "Resilient Course", "2026-06-15T04:00:00Z")],
      avg_score: 90.0,
      absences: 0,
      total_lessons: 10,
    };

    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profile));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([]));
    vi.mocked(userHooks.useMentorProfile).mockReturnValue(mockErrorResult<MentorProfileResponse>());

    renderComponent();

    const lessonSection = screen.getByRole("region", { name: /следующее занятие|next lesson/i });
    expect(lessonSection.textContent).toContain("Resilient Course");
    expect(lessonSection.textContent).toMatch(/информация о преподавателе недоступна|mentor information unavailable/i);
    expect(screen.getByRole("link", { name: /перейти к курсу|view course/i }).getAttribute("href")).toBe("/my/courses/1");
  });

  it("distinguishes valid zero score from unavailable metrics without periods_graded inference", () => {
    const profileNoLessons: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 0.0,
        attendance_percentage: 0.0,
        absences: 0,
        total_lessons: 0,
        active_course_count: 1,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "New Course", null, 0)],
      avg_score: 0.0,
      absences: 0,
      total_lessons: 0,
    };

    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profileNoLessons));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([]));

    const { unmount } = renderComponent();

    const metricsSection = screen.getByRole("region", { name: /средний балл|average/i });
    expect(metricsSection.textContent).toContain("—");

    unmount();

    const profileWithLessons: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 85.0,
        attendance_percentage: 100.0,
        absences: 0,
        total_lessons: 5,
        active_course_count: 1,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "Graded Course", null, 1)],
      avg_score: 85.0,
      absences: 0,
      total_lessons: 5,
    };

    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profileWithLessons));
    renderComponent();

    const updatedMetrics = screen.getByRole("region", { name: /средний балл|average/i });
    expect(updatedMetrics.textContent).not.toContain("85.0%");
    expect(updatedMetrics.textContent).toContain("—");
    expect(updatedMetrics.textContent).toContain("100.0%");
  });

  it("handles separate journals lifecycle error with retry and does not claim no grades", () => {
    const profile: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 85.0,
        attendance_percentage: 90.0,
        absences: 1,
        total_lessons: 10,
        active_course_count: 1,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "Active Course", "2026-06-15T04:00:00Z")],
      avg_score: 85.0,
      absences: 1,
      total_lessons: 10,
    };

    const refetchJournals = vi.fn();
    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profile));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockErrorResult<StudentJournalPeriod[]>(undefined, refetchJournals));

    renderComponent();

    expect(screen.queryByText(/оценок пока нет|no grades yet/i)).toBeNull();

    const resultSection = screen.getByRole("region", { name: /последний доступный период|latest available period/i });
    const retryBtn = screen.getByRole("button", { name: /повторить|retry/i });
    expect(resultSection.contains(retryBtn)).toBe(true);

    fireEvent.click(retryBtn);
    expect(refetchJournals).toHaveBeenCalledTimes(1);
  });

  it("keeps unsupported grading and summary availability explicit despite positive max and bonus", () => {
    const profile: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 102.5,
        attendance_percentage: 100.0,
        absences: 0,
        total_lessons: 8,
        active_course_count: 1,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "Math Course", "2026-06-15T04:00:00Z")],
      avg_score: 102.5,
      absences: 0,
      total_lessons: 8,
    };

    const mockPeriod: StudentJournalPeriod = {
      journal_id: 42,
      course_id: 1,
      course_title: "Math Course",
      period_label: "Module 1",
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      homework_score: 40,
      attendance_score: 8,
      exam_score: 55,
      bonus_score: 10,
      sum_score: 113,
      max_period_score: 110,
      percentage: 102.7,
      attendance_count: 8,
      total_lessons: 8,
      state: "graded",
    };

    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profile));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([mockPeriod]));

    renderComponent();

    const resultSection = screen.getByRole("region", { name: /последний доступный период|latest available period/i });
    expect(resultSection.textContent).not.toContain("113");
    expect(resultSection.textContent).not.toContain("/ 110");
    expect(resultSection.textContent).not.toContain("102.7%");
    expect(resultSection.textContent).not.toContain("40");
    expect(resultSection.textContent).not.toContain("8");
    expect(resultSection.textContent).not.toContain("55");
    expect(Array.from(resultSection.querySelectorAll("dd")).map(element => element.textContent)).toEqual(["—", "—", "—", "—"]);

    const disclosureSummary = screen.getByText(/как рассчитывается|how is this result calculated/i);
    expect(disclosureSummary).toBeDefined();

    const detailLink = screen.getByRole("link", { name: /подробнее|details/i });
    expect(detailLink.getAttribute("href")).toBe("/my/journal/42");
  });

  it("handles nonpositive nominal max gracefully with grade unavailable fallback", () => {
    const profile: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 0.0,
        attendance_percentage: 100.0,
        absences: 0,
        total_lessons: 5,
        active_course_count: 1,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "Unfinished Course", null)],
      avg_score: 0.0,
      absences: 0,
      total_lessons: 5,
    };

    const periodWithoutMax: StudentJournalPeriod = {
      journal_id: 43,
      course_id: 1,
      course_title: "Unfinished Course",
      period_label: "Draft Period",
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      homework_score: 0,
      attendance_score: 0,
      exam_score: 0,
      bonus_score: 0,
      sum_score: 0,
      max_period_score: 0,
      percentage: 0,
      attendance_count: 0,
      total_lessons: 5,
      state: "in_progress",
    };

    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profile));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([periodWithoutMax]));

    renderComponent();

    const resultSection = screen.getByRole("region", { name: /последний доступный период|latest available period/i });
    expect(resultSection.textContent).toContain(i18n.t("student:gradingStateUnavailable"));
    expect(resultSection.textContent).not.toContain("/ 0");
  });

  it("selects latest available period by descending date and not by positive max prioritization", () => {
    const profile: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 75.0,
        attendance_percentage: 80.0,
        absences: 2,
        total_lessons: 10,
        active_course_count: 1,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "Timeline Course", null)],
      avg_score: 75.0,
      absences: 2,
      total_lessons: 10,
    };

    const olderGradedPeriod: StudentJournalPeriod = {
      journal_id: 101,
      course_id: 1,
      course_title: "Timeline Course",
      period_label: "Week 1",
      period_start: "2026-05-01",
      period_end: "2026-05-07",
      homework_score: 15,
      attendance_score: 3,
      exam_score: 50,
      bonus_score: 0,
      sum_score: 68,
      max_period_score: 80,
      percentage: 85.0,
      attendance_count: 3,
      total_lessons: 3,
      state: "graded",
    };

    const newerInProgressPeriod: StudentJournalPeriod = {
      journal_id: 102,
      course_id: 1,
      course_title: "Timeline Course",
      period_label: "Week 2",
      period_start: "2026-05-08",
      period_end: "2026-05-14",
      homework_score: 10,
      attendance_score: 2,
      exam_score: 0,
      bonus_score: 0,
      sum_score: 12,
      max_period_score: 0,
      percentage: 0,
      attendance_count: 2,
      total_lessons: 3,
      state: "in_progress",
    };

    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profile));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(
      mockSuccessResult([newerInProgressPeriod, olderGradedPeriod])
    );

    renderComponent();

    const resultSection = screen.getByRole("region", { name: /последний доступный период|latest available period/i });
    expect(resultSection.textContent).toContain("Week 2");
    expect(resultSection.textContent).not.toContain("Week 1");
  });

  it("does not default missing score contributions to zero and displays unavailable dash", () => {
    const profile: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 80.0,
        attendance_percentage: 90.0,
        absences: 1,
        total_lessons: 10,
        active_course_count: 1,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "Missing Fields Course", null)],
      avg_score: 80.0,
      absences: 1,
      total_lessons: 10,
    };

    const periodWithMissingFields: StudentJournalPeriod = {
      journal_id: 201,
      course_id: 1,
      course_title: "Missing Fields Course",
      period_label: "Partial Period",
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      homework_score: 20,
      attendance_score: undefined,
      exam_score: undefined,
      bonus_score: undefined,
      sum_score: 20,
      max_period_score: 50,
      percentage: 40.0,
      attendance_count: 4,
      total_lessons: 5,
      state: "in_progress",
    };

    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profile));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([periodWithMissingFields]));

    renderComponent();

    const resultSection = screen.getByRole("region", { name: /последний доступный период|latest available period/i });
    expect(resultSection.querySelector("dl")?.textContent).not.toContain("20");
    expect(resultSection.textContent).toContain("—");
  });

  it("renders independent journal result when profile query fails", () => {
    const refetchProfile = vi.fn();
    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockErrorResult<StudentProfileResponse>(undefined, refetchProfile));

    const mockPeriod: StudentJournalPeriod = {
      journal_id: 301,
      course_id: 1,
      course_title: "Independent Result Course",
      period_label: "Final Period",
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      homework_score: 25,
      attendance_score: 5,
      exam_score: 60,
      bonus_score: 5,
      sum_score: 95,
      max_period_score: 100,
      percentage: 95.0,
      attendance_count: 5,
      total_lessons: 5,
      state: "graded",
    };

    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([mockPeriod]));

    renderComponent();

    const profileError = screen.getAllByRole("alert")[0];
    expect(profileError).toBeDefined();

    const resultSection = screen.getByRole("region", { name: /последний доступный период|latest available period/i });
    expect(resultSection.textContent).toContain("Independent Result Course");
    expect(resultSection.textContent).not.toContain("95");
  });

  it("formats next-lesson metadata from the actual profile timestamp contract", () => {
    const profile: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 90.0,
        attendance_percentage: 90.0,
        absences: 1,
        total_lessons: 10,
        active_course_count: 1,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "Scheduled Course", "2026-06-15T05:00:00Z", 1, "active")],
      avg_score: 90.0,
      absences: 1,
      total_lessons: 10,
    };

    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockSuccessResult(profile));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([]));

    renderComponent();

    const coursesSection = screen.getByRole("region", { name: /мои курсы|my courses/i });
    expect(coursesSection.textContent).toContain("Scheduled Course");
    expect(coursesSection.textContent).toContain("10:00");
  });

  it("retains loaded profile data during background refetch failure and offers retry", () => {
    const profile: StudentProfileResponse = {
      user: mockStudentUser,
      totals: {
        avg_percentage: 90.0,
        attendance_percentage: 100.0,
        absences: 0,
        total_lessons: 10,
        active_course_count: 1,
        archived_course_count: 0,
      },
      courses: [createCourseEntry(1, "Retained Course", "2026-06-15T04:00:00Z")],
      avg_score: 90.0,
      absences: 0,
      total_lessons: 10,
    };

    const refetchProfile = vi.fn();
    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockErrorResult(profile, refetchProfile));
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([]));

    renderComponent();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Faridun Nazarov");
    expect(screen.getAllByText("Retained Course").length).toBeGreaterThanOrEqual(1);

    const refreshWarning = screen.getByRole("alert");
    expect(refreshWarning.textContent).toMatch(/не удалось обновить|failed to refresh/i);

    const retryBtn = screen.getByRole("button", { name: /повторить|retry/i });
    fireEvent.click(retryBtn);
    expect(refetchProfile).toHaveBeenCalledTimes(1);
  });

  it("never invents zero metrics or successful enrollment emptiness after initial profile failure", () => {
    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockInitialErrorResult<StudentProfileResponse>());
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockSuccessResult([]));
    renderComponent();
    const metrics = screen.getByRole("region", { name: /средний балл|average/i });
    expect(metrics.textContent).not.toMatch(/\b0\b/);
    const courses = screen.getByRole("region", { name: /мои курсы|my courses/i });
    expect(within(courses).queryByText(i18n.t("student:noCoursesTitle"))).toBeNull();
  });

  it("retains a successful empty journal response with a local refresh warning", () => {
    vi.mocked(userHooks.useMyStudentProfile).mockReturnValue(mockInitialErrorResult<StudentProfileResponse>());
    vi.mocked(userHooks.useMyStudentJournals).mockReturnValue(mockStaleErrorResult<StudentJournalPeriod[]>([]));
    renderComponent();
    const result = document.querySelector('section[aria-labelledby="result-heading"]');
    expect(result).not.toBeNull();
    expect(result!.textContent).not.toContain(i18n.t("common:error"));
    expect(result!.textContent).toContain(i18n.t("student:journalsRefreshError"));
  });
});

describe("Student recorded result", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("preserves recorded zero without inferring graded state", () => {
    vi.mocked(journalHooks.useJournal).mockReturnValue(mockSuccessResult(recordedDetail(0, 10, 0)));
    renderComponent(<StudentResultCard journal={recordedPeriod} isLoading={false} isError={false} />);
    expect(Array.from(document.querySelectorAll("dd")).map(element => element.textContent)).toEqual(["0", "0", "0", "0"]);
    expect(document.body.textContent).toContain("0 / 10");
    expect(document.body.textContent).toContain(i18n.t("student:gradingStateUnavailable"));
    expect(journalHooks.useJournal).toHaveBeenCalledWith(7);
  });

  it("preserves additive bonus above the nominal maximum without a completion track", () => {
    vi.mocked(journalHooks.useJournal).mockReturnValue(mockSuccessResult(recordedDetail(113, 110, 10)));
    renderComponent(<StudentResultCard journal={recordedPeriod} isLoading={false} isError={false} />);
    expect(document.body.textContent).toContain("113 / 110");
    expect(Array.from(document.querySelectorAll("dd")).map(element => element.textContent)).toEqual(["0", "0", "103", "10"]);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(document.body.textContent).toContain(i18n.t("student:gradingStateUnavailable"));
  });

  it("distinguishes a missing summary from recorded zero", () => {
    const detail = recordedDetail(0, 10, 0); detail.students[0].summary = null;
    vi.mocked(journalHooks.useJournal).mockReturnValue(mockSuccessResult(detail));
    renderComponent(<StudentResultCard journal={recordedPeriod} isLoading={false} isError={false} />);
    expect(document.body.textContent).toContain(i18n.t("student:recordedResultMissing"));
    expect(Array.from(document.querySelectorAll("dd")).map(element => element.textContent)).toEqual(["—", "—", "—", "—"]);
  });

  it("retains a recorded summary when its independent refresh fails and retries only that request", () => {
    const retry = vi.fn(); vi.mocked(journalHooks.useJournal).mockReturnValue(mockStaleErrorResult(recordedDetail(0, 10, 0), retry));
    renderComponent(<StudentResultCard journal={recordedPeriod} isLoading={false} isError={false} />);
    expect(document.body.textContent).toContain("0 / 10");
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button")); expect(retry).toHaveBeenCalledOnce();
  });
});
