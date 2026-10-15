import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../i18n";
import { JournalDetail } from "./JournalDetail";
import { useAuthStore } from "../store/authStore";
import { AuthApiError } from "../lib/auth/errors";
import * as courseEndpoints from "../lib/courses/endpoints";
import * as journalEndpoints from "../lib/journals/endpoints";
import * as userEndpoints from "../lib/users/endpoints";
import * as enrollmentEndpoints from "../lib/enrollments/endpoints";
import { createDeferred } from "../lib/journals/journalQueueTestSupport";
import { formatSchoolLessonDate } from "../i18n/formatters";
import type { CourseResponse, CourseStaffProgressResponse, JournalPeriod } from "../lib/courses/types";
import type { JournalBatchUpdateResponse, JournalDetailResponse, JournalExamMaxScoreUpdateResponse } from "../lib/journals/types";

const viewportState = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    desktop: true,
    listeners,
    setDesktop(next: boolean): void {
      state.desktop = next;
      listeners.forEach((listener) => listener());
    },
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return query.includes("1024px") ? state.desktop : false;
      },
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    }),
  });
  return state;
});

const schoolToday = vi.hoisted(() => ({ value: "2026-10-15" }));

vi.mock("../i18n/formatters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/formatters")>();
  return { ...actual, getSchoolCalendarDate: () => schoolToday.value };
});

vi.mock("../lib/courses/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/endpoints")>();
  return { ...actual, getCourse: vi.fn(), getCourseJournals: vi.fn(), getCourseProgressChart: vi.fn(), getCourseStaffProgress: vi.fn() };
});
vi.mock("../lib/journals/endpoints", () => ({
  getJournal: vi.fn(),
  batchUpdateJournalEntries: vi.fn(),
  updateJournalStudentSummary: vi.fn(),
  updateJournalExamMaxScore: vi.fn(),
  getMentorGradingQueue: vi.fn(),
}));
vi.mock("../lib/users/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/users/endpoints")>();
  return { ...actual, getMentorProfile: vi.fn() };
});
vi.mock("../lib/enrollments/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/enrollments/endpoints")>();
  return { ...actual, listEnrollments: vi.fn() };
});

const COURSE_ID = 5;
const AUGUST = 101;
const SEPTEMBER = 102;
const OCTOBER = 103;

const PERIODS: JournalPeriod[] = [
  { id: AUGUST, course_id: COURSE_ID, period_label: "Month 8", period_start: "2026-08-01", period_end: "2026-08-31", period_type: "month", state: "complete" },
  { id: SEPTEMBER, course_id: COURSE_ID, period_label: "Month 9", period_start: "2026-09-01", period_end: "2026-09-30", period_type: "month", state: "partial" },
  { id: OCTOBER, course_id: COURSE_ID, period_label: "Month 10", period_start: "2026-10-01", period_end: "2026-10-31", period_type: "month", state: "partial" },
];

const LESSONS: Record<number, string[]> = {
  [AUGUST]: ["2026-08-04", "2026-08-11"],
  [SEPTEMBER]: ["2026-09-01", "2026-09-08"],
  [OCTOBER]: ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"],
};

function buildCourse(overrides: Partial<CourseResponse> = {}): CourseResponse {
  return {
    id: COURSE_ID,
    title: "Algebra Intensive",
    description: "",
    photo_path: null,
    start_date: "2026-08-01",
    end_date: "2026-12-31",
    exam_type: "monthly",
    price: "100.00",
    mentor_id: 77,
    status: "active",
    is_deleted: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function buildJournal(journalId: number): JournalDetailResponse {
  const period = PERIODS.find((candidate) => candidate.id === journalId) as JournalPeriod;
  const dates = LESSONS[journalId];
  const student = (id: number, first: string) => ({
    student_id: id,
    first_name: first,
    last_name: "Tester",
    email: `${first}@example.com`,
    color_hex: "",
    entries: dates.map((date, index) => ({
      id: id * 1000 + journalId + index,
      lesson_date: date,
      attendance: false,
      score: 0,
      comment: null,
      has_comment: false,
      version: 1,
    })),
    summary: {
      id: id * 100 + journalId,
      journal_id: journalId,
      student_id: id,
      homework_score: 0,
      attendance_score: 0,
      exam_score: 0,
      bonus_score: 0,
      sum_score: 0,
      max_period_score: 100,
      percentage: 0,
      attendance_count: 0,
      total_lessons: dates.length,
      version: 1,
    },
  });
  return {
    journal_id: journalId,
    course_id: COURSE_ID,
    period_label: period.period_label,
    period_start: period.period_start,
    period_end: period.period_end,
    period_type: "month",
    exam_max_score: 100,
    lesson_dates: dates,
    students: [student(11, "Anvar"), student(12, "Bahor")],
  };
}

function staffResult(periodId: number, score: number | null, maxScore: number | null, percentage: number | null) {
  return { period_id: periodId, grading_state: "missing" as const, score, max_score: maxScore, percentage };
}

function buildStaffProgress(): CourseStaffProgressResponse {
  return {
    course_id: COURSE_ID,
    periods: PERIODS.map((period) => ({
      id: period.id,
      period_label: period.period_label,
      period_start: period.period_start,
      period_end: period.period_end,
    })),
    students: [
      {
        student_id: 11,
        first_name: "Anvar",
        last_name: "Tester",
        grading_provenance: "unknown",
        period_results: [staffResult(AUGUST, 18, 24, 75), staffResult(SEPTEMBER, 0, 24, 0), staffResult(OCTOBER, 25, 24.5, 102)],
      },
      {
        student_id: 12,
        first_name: "Bahor",
        last_name: "Tester",
        grading_provenance: "unknown",
        period_results: [staffResult(AUGUST, null, null, null), staffResult(SEPTEMBER, 12, 24, 50), staffResult(OCTOBER, 12, 24, 50)],
      },
    ],
  };
}

const getCourseMock = vi.mocked(courseEndpoints.getCourse);
const getCourseJournalsMock = vi.mocked(courseEndpoints.getCourseJournals);
const getStaffProgressMock = vi.mocked(courseEndpoints.getCourseStaffProgress);
const getJournalMock = vi.mocked(journalEndpoints.getJournal);
const batchUpdateMock = vi.mocked(journalEndpoints.batchUpdateJournalEntries);
const updateSummaryMock = vi.mocked(journalEndpoints.updateJournalStudentSummary);
const updateExamMaxMock = vi.mocked(journalEndpoints.updateJournalExamMaxScore);
const getMentorProfileMock = vi.mocked(userEndpoints.getMentorProfile);
const listEnrollmentsMock = vi.mocked(enrollmentEndpoints.listEnrollments);

let router: ReturnType<typeof createMemoryRouter>;

function renderWorkspace(entries: string[] = [`/journals/${COURSE_ID}`], index: number = entries.length - 1) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  router = createMemoryRouter(
    [
      { path: "/journals", element: <div>hub page</div> },
      { path: "/students/:id", element: <div>student profile page</div> },
      { path: "/journals/:id", element: <JournalDetail /> },
    ],
    { initialEntries: entries, initialIndex: index },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function periodPicker(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: "Period" }) as HTMLSelectElement;
}

function pickerSummary(): string {
  return periodPicker().parentElement?.textContent ?? "";
}

function gradeCell(name: string, date: string): HTMLElement {
  return screen.getByLabelText(`Score for ${name} Tester on ${formatSchoolLessonDate(date)}`);
}

async function waitForGrid(): Promise<void> {
  await screen.findByRole("region", { name: /Gradebook grid/ });
}

beforeEach(async () => {
  vi.clearAllMocks();
  schoolToday.value = "2026-10-15";
  viewportState.desktop = true;
  await i18n.changeLanguage("en");
  useAuthStore.setState({ role: "superadmin" });
  getCourseMock.mockResolvedValue(buildCourse());
  getCourseJournalsMock.mockResolvedValue(PERIODS);
  getStaffProgressMock.mockResolvedValue(buildStaffProgress());
  getJournalMock.mockImplementation(async (journalId: number) => buildJournal(journalId));
  getMentorProfileMock.mockRejectedValue(new AuthApiError(404, "none"));
  listEnrollmentsMock.mockResolvedValue({ items: [], total: 2, page: 1, page_size: 1, total_pages: 2 });
  batchUpdateMock.mockImplementation(async (_journalId, payload) => ({
    applied: payload.map((item) => ({ ...item, version: item.version + 1 })),
    conflicts: [],
    summaries: [],
  }));
});

afterEach(() => cleanup());

describe("course versus journal identifier", () => {
  it("loads the course by the route id and the journal by the selected period id", async () => {
    renderWorkspace();
    await waitForGrid();
    expect(getCourseMock).toHaveBeenCalledWith(COURSE_ID);
    expect(getCourseJournalsMock).toHaveBeenCalledWith(COURSE_ID);
    expect(getJournalMock).toHaveBeenCalledWith(OCTOBER);
    expect(getJournalMock).not.toHaveBeenCalledWith(COURSE_ID);
  });

  it("sends grades to the selected period's journal id, never to the course id", async () => {
    renderWorkspace();
    await waitForGrid();
    const cell = gradeCell("Anvar", "2026-10-13");
    cell.focus();
    fireEvent.keyDown(cell, { key: "4" });
    await waitFor(() => expect(batchUpdateMock).toHaveBeenCalledTimes(1));
    expect(batchUpdateMock.mock.calls[0][0]).toBe(OCTOBER);
    expect(batchUpdateMock.mock.calls[0][0]).not.toBe(COURSE_ID);
    expect(batchUpdateMock.mock.calls[0][1]).toEqual([
      expect.objectContaining({ student_id: 11, lesson_date: "2026-10-13", score: 4, attendance: true }),
    ]);
  });

  it("shows a not-found state for a malformed course id without requesting data", async () => {
    renderWorkspace(["/journals/abc"]);
    expect(await screen.findByText("Journal not found")).toBeDefined();
    expect(getCourseMock).not.toHaveBeenCalled();
  });
});

describe("period selection", () => {
  it("selects the date-active period and labels it Current", async () => {
    renderWorkspace();
    await waitForGrid();
    expect(getJournalMock).toHaveBeenCalledWith(OCTOBER);
    expect(pickerSummary()).toContain("Month 10");
    expect(pickerSummary()).toContain("Current");
  });

  it("selects the latest started period and labels it Latest when the course calendar has ended", async () => {
    schoolToday.value = "2027-03-01";
    renderWorkspace();
    await waitForGrid();
    expect(getJournalMock).toHaveBeenCalledWith(OCTOBER);
    expect(pickerSummary()).toContain("Latest");
    expect(pickerSummary()).not.toContain("Current");
  });

  it("selects the earliest period and labels it Upcoming when every period is in the future", async () => {
    schoolToday.value = "2026-01-05";
    renderWorkspace();
    await waitForGrid();
    expect(getJournalMock).toHaveBeenCalledWith(AUGUST);
    expect(pickerSummary()).toContain("Month 8");
    expect(pickerSummary()).toContain("Upcoming");
  });

  it("lists every period with label, formatted range and timing tag but no fill-state badge", async () => {
    renderWorkspace();
    await waitForGrid();
    const options = within(periodPicker()).getAllByRole("option").map((option) => option.textContent);
    expect(options).toHaveLength(3);
    expect(options[0]).toBe(`Month 8 · ${formatSchoolLessonDate("2026-08-01")} – ${formatSchoolLessonDate("2026-08-31")} · Past`);
    expect(options[2]).toBe(`Month 10 · ${formatSchoolLessonDate("2026-10-01")} – ${formatSchoolLessonDate("2026-10-31")} · Current`);
    const visible = pickerSummary();
    for (const fillState of ["Complete", "In progress", "Not started", "Unavailable"]) {
      expect(visible).not.toContain(fillState);
      options.forEach((option) => expect(option).not.toContain(fillState));
    }
  });

  it("honours a valid period query without a notice", async () => {
    renderWorkspace([`/journals/${COURSE_ID}?period=${AUGUST}`]);
    await waitForGrid();
    expect(getJournalMock).toHaveBeenCalledWith(AUGUST);
    expect(getJournalMock).not.toHaveBeenCalledWith(OCTOBER);
    expect(screen.queryByTestId("journal-route-notice-period")).toBeNull();
  });

  it.each(["999", "abc", "-4"])(
    "treats the foreign or malformed period %j as invalid, shows a notice and normalizes the URL with replacement history",
    async (rawPeriod) => {
      renderWorkspace(["/journals", `/journals/${COURSE_ID}?period=${rawPeriod}`]);
      await waitForGrid();
      expect(getJournalMock).toHaveBeenCalledWith(OCTOBER);
      expect(getJournalMock).not.toHaveBeenCalledWith(Number(rawPeriod));
      expect(screen.getByTestId("journal-route-notice-period").textContent).toContain("Month 10");
      expect(router.state.location.search).not.toContain("period=");
      expect(router.state.historyAction).toBe("REPLACE");

      await act(async () => {
        await router.navigate(-1);
      });
      expect(router.state.location.pathname).toBe("/journals");
    },
  );

  it("treats a period that belongs to another course as invalid", async () => {
    getCourseJournalsMock.mockResolvedValue(PERIODS);
    renderWorkspace([`/journals/${COURSE_ID}?period=9001`]);
    await waitForGrid();
    expect(getJournalMock).not.toHaveBeenCalledWith(9001);
    expect(screen.getByTestId("journal-route-notice-period")).toBeDefined();
  });

  it("dismisses the notice and keeps the normalized context", async () => {
    renderWorkspace([`/journals/${COURSE_ID}?period=999`]);
    await waitForGrid();
    fireEvent.click(within(screen.getByTestId("journal-route-notice-period")).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByTestId("journal-route-notice-period")).toBeNull());
    expect(pickerSummary()).toContain("Month 10");
  });

  it("pushes a history entry for a period change and Back/Forward update the visible context", async () => {
    renderWorkspace();
    await waitForGrid();
    expect(pickerSummary()).toContain("Month 10");

    fireEvent.change(periodPicker(), { target: { value: String(AUGUST) } });
    await waitFor(() => expect(router.state.location.search).toBe(`?period=${AUGUST}`));
    await waitFor(() => expect(pickerSummary()).toContain("Month 8"));
    expect(router.state.historyAction).toBe("PUSH");
    await screen.findByLabelText(`Score for Anvar Tester on ${formatSchoolLessonDate("2026-08-04")}`);

    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(pickerSummary()).toContain("Month 10"));
    await screen.findByLabelText(`Score for Anvar Tester on ${formatSchoolLessonDate("2026-10-06")}`);

    await act(async () => {
      await router.navigate(1);
    });
    await waitFor(() => expect(pickerSummary()).toContain("Month 8"));
    expect(router.state.location.search).toBe(`?period=${AUGUST}`);
  });

  it("shows no period picker and an explanation when the course has no periods", async () => {
    getCourseJournalsMock.mockResolvedValue([]);
    renderWorkspace();
    expect(await screen.findByText("No journal periods yet")).toBeDefined();
    expect(screen.queryByRole("combobox", { name: "Period" })).toBeNull();
    expect(getJournalMock).not.toHaveBeenCalled();
  });
});

describe("lesson selection", () => {
  it("selects the latest lesson on or before today when none is scheduled today", async () => {
    renderWorkspace();
    await waitForGrid();
    const selected = screen.getAllByRole("columnheader").find((header) => header.getAttribute("aria-current") === "date");
    expect(selected?.textContent).toContain(formatSchoolLessonDate("2026-10-13"));
  });

  it("selects today's lesson when one is scheduled", async () => {
    schoolToday.value = "2026-10-20";
    renderWorkspace();
    await waitForGrid();
    const selected = screen.getAllByRole("columnheader").find((header) => header.getAttribute("aria-current") === "date");
    expect(selected?.textContent).toContain(formatSchoolLessonDate("2026-10-20"));
    expect(screen.getByText("Today")).toBeDefined();
  });

  it("selects the first lesson when the whole period is still ahead", async () => {
    schoolToday.value = "2026-10-01";
    renderWorkspace();
    await waitForGrid();
    const selected = screen.getAllByRole("columnheader").find((header) => header.getAttribute("aria-current") === "date");
    expect(selected?.textContent).toContain(formatSchoolLessonDate("2026-10-06"));
  });

  it("falls back from an unscheduled lesson query with a notice and a replaced URL", async () => {
    renderWorkspace(["/journals", `/journals/${COURSE_ID}?period=${OCTOBER}&lesson=2026-10-14`]);
    await waitForGrid();
    await waitFor(() => expect(router.state.location.search).toBe(`?period=${OCTOBER}`));
    expect(screen.getByTestId("journal-route-notice-lesson").textContent).toContain(formatSchoolLessonDate("2026-10-13"));
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.pathname).toBe("/journals");
  });

  it("stops the previous and next arrows at the period boundary", async () => {
    renderWorkspace();
    await waitForGrid();
    const previous = screen.getByRole("button", { name: "Previous lesson" });
    const next = screen.getByRole("button", { name: "Next lesson" });

    fireEvent.click(previous);
    await waitFor(() => expect(router.state.location.search).toContain("lesson=2026-10-06"));
    expect((screen.getByRole("button", { name: "Previous lesson" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    await waitFor(() => expect(router.state.location.search).toContain("lesson=2026-10-27"));
    expect((screen.getByRole("button", { name: "Next lesson" }) as HTMLButtonElement).disabled).toBe(true);
    expect(router.state.location.search).not.toContain("period=");
    expect(getJournalMock).not.toHaveBeenCalledWith(AUGUST);
  });

  it("uses replacement history for lesson, tab and view changes so Back leaves the journal", async () => {
    renderWorkspace(["/journals", `/journals/${COURSE_ID}`]);
    await waitForGrid();
    fireEvent.click(screen.getByRole("button", { name: "Previous lesson" }));
    fireEvent.click(screen.getByRole("button", { name: "Summary" }));
    fireEvent.click(screen.getByRole("tab", { name: "Progress" }));
    await waitFor(() => expect(router.state.location.search).toContain("tab=progress"));
    expect(router.state.location.search).toContain("view=summary");
    expect(router.state.location.search).toContain("lesson=2026-10-06");
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.pathname).toBe("/journals");
  });
});

describe("period change goes through the drain", () => {
  async function gradeAnvarInOctober(): Promise<void> {
    const cell = gradeCell("Anvar", "2026-10-13");
    cell.focus();
    fireEvent.keyDown(cell, { key: "4" });
  }

  it("waits for the slow save before switching the period and never sends the old draft to the new journal", async () => {
    const slow = createDeferred<JournalBatchUpdateResponse>();
    batchUpdateMock.mockReturnValueOnce(slow.promise);
    renderWorkspace();
    await waitForGrid();
    await gradeAnvarInOctober();

    fireEvent.change(periodPicker(), { target: { value: String(AUGUST) } });

    await screen.findByText("Saving your changes before you leave…");
    expect(router.state.location.search).toBe("");
    expect(getJournalMock).not.toHaveBeenCalledWith(AUGUST);

    await act(async () => {
      slow.resolve({
        applied: [{ student_id: 11, lesson_date: "2026-10-13", attendance: true, score: 4, comment: null, version: 2 }],
        conflicts: [],
        summaries: [],
      });
    });

    await waitFor(() => expect(router.state.location.search).toBe(`?period=${AUGUST}`));
    await waitFor(() => expect(getJournalMock).toHaveBeenCalledWith(AUGUST));
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
    expect(batchUpdateMock.mock.calls.every((call) => call[0] === OCTOBER)).toBe(true);
  });

  it("stays in the old period with the draft kept when the drain fails", async () => {
    batchUpdateMock.mockRejectedValue(new AuthApiError(400, "Bad request"));
    renderWorkspace();
    await waitForGrid();
    await gradeAnvarInOctober();

    fireEvent.change(periodPicker(), { target: { value: String(AUGUST) } });

    await screen.findByText("Changes could not be saved");
    expect(router.state.location.search).toBe("");
    expect(getJournalMock).not.toHaveBeenCalledWith(AUGUST);
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByText("Changes could not be saved")).toBeNull());
    expect(pickerSummary()).toContain("Month 10");
    expect(within(gradeCell("Anvar", "2026-10-13")).getByRole("button", { name: "4" })).toBeDefined();
  });

  it("does not drain for a lesson change inside the same period", async () => {
    const slow = createDeferred<JournalBatchUpdateResponse>();
    batchUpdateMock.mockReturnValueOnce(slow.promise);
    renderWorkspace();
    await waitForGrid();
    await gradeAnvarInOctober();

    fireEvent.click(screen.getByRole("button", { name: "Previous lesson" }));

    await waitFor(() => expect(router.state.location.search).toContain("lesson=2026-10-06"));
    expect(screen.queryByText("Saving your changes before you leave…")).toBeNull();
    await act(async () => {
      slow.resolve({ applied: [], conflicts: [], summaries: [] });
    });
  });
});

describe("read-only and permission loss", () => {
  it("keeps an archived course read-only for its assigned mentor with an explanation and no editors", async () => {
    useAuthStore.setState({ role: "mentor" });
    getCourseMock.mockResolvedValue(buildCourse({ status: "archived" }));
    renderWorkspace();
    await waitForGrid();
    expect(screen.getByTestId("journal-archived-notice").textContent).toContain("read-only");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelectorAll('[aria-haspopup="menu"], [aria-haspopup="dialog"]')).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Period settings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Keyboard help" })).toBeNull();

    const group = screen.getAllByRole("group", { name: /Attendance, score and comment/ })[0];
    fireEvent.keyDown(group, { key: "4" });
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(batchUpdateMock).not.toHaveBeenCalled();
  });

  it("keeps an archived course editable for a superadmin, as the endpoint allows", async () => {
    getCourseMock.mockResolvedValue(buildCourse({ status: "archived" }));
    renderWorkspace();
    await waitForGrid();
    expect(screen.queryByTestId("journal-archived-notice")).toBeNull();
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it("preserves unacknowledged work for review after a 403 and blocks every further write", async () => {
    useAuthStore.setState({ role: "mentor" });
    batchUpdateMock.mockRejectedValue(new AuthApiError(403, "Cannot update archived course"));
    renderWorkspace();
    await waitForGrid();
    const cell = gradeCell("Anvar", "2026-10-13");
    cell.focus();
    fireEvent.keyDown(cell, { key: "4" });

    const notice = await screen.findByTestId("journal-forbidden-notice");
    expect(notice.textContent).toContain("kept here for review");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByTestId("journal-save-status").getAttribute("data-phase")).toBe("failed");
    expect(screen.getByText("Changes not saved")).toBeDefined();
    const preserved = screen.getAllByRole("group", { name: /Attendance, score and comment for Anvar Tester/ })[1];
    expect(within(preserved).getByText("4")).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });
});

describe("four states", () => {
  it("shows skeleton slots while the period list loads", async () => {
    const pending = createDeferred<JournalPeriod[]>();
    getCourseJournalsMock.mockReturnValue(pending.promise);
    renderWorkspace();
    expect(await screen.findByTestId("journal-period-skeleton")).toBeDefined();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Algebra Intensive");
    await act(async () => {
      pending.resolve(PERIODS);
    });
    await waitForGrid();
  });

  it("shows a working retry when the period list fails and keeps the course identity", async () => {
    getCourseJournalsMock.mockRejectedValueOnce(new AuthApiError(500, "boom"));
    renderWorkspace();
    expect(await screen.findByText("Could not load the journal periods")).toBeDefined();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Algebra Intensive");
    expect(screen.getByRole("link", { name: "Journals" }).getAttribute("href")).toBe("/journals");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitForGrid();
  });

  it("shows a grid skeleton while the selected journal loads and a working retry when it fails", async () => {
    getJournalMock.mockRejectedValueOnce(new AuthApiError(500, "boom"));
    renderWorkspace();
    expect(await screen.findByText("Failed to load journal data")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitForGrid();
  });

  it("renders a grid skeleton in the grid geometry before data arrives", async () => {
    const pending = createDeferred<JournalDetailResponse>();
    getJournalMock.mockReturnValueOnce(pending.promise);
    renderWorkspace();
    expect(await screen.findByTestId("journal-grid-skeleton")).toBeDefined();
    await act(async () => {
      pending.resolve(buildJournal(OCTOBER));
    });
    await waitForGrid();
    expect(screen.queryByTestId("journal-grid-skeleton")).toBeNull();
  });

  it("explains a period with no scheduled lessons and offers Summary", async () => {
    getJournalMock.mockResolvedValue({ ...buildJournal(OCTOBER), lesson_dates: [] });
    renderWorkspace();
    expect(await screen.findByText("No lessons in this period")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Summary" }));
    expect(await screen.findByRole("table", { name: /Student totals/ })).toBeDefined();
  });

  it("explains an empty roster", async () => {
    getJournalMock.mockResolvedValue({ ...buildJournal(OCTOBER), students: [] });
    renderWorkspace();
    expect(await screen.findByText("There are no students in this course")).toBeDefined();
  });
});

describe("workspace anatomy", () => {
  it("has no metric cards or progress chart above the grid", async () => {
    renderWorkspace();
    await waitForGrid();
    expect(screen.queryByText("Class Average")).toBeNull();
    expect(screen.queryByText("Attendance Rate")).toBeNull();
    expect(screen.queryByText("Score progress")).toBeNull();
    expect(getStaffProgressMock).not.toHaveBeenCalled();
  });

  it("shows the back link, wrapping title, roster count, period picker, settings, tabs, view switch and reserved status", async () => {
    renderWorkspace();
    await waitForGrid();
    expect(screen.getByRole("link", { name: "Journals" }).getAttribute("href")).toBe("/journals");
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("break-words");
    expect(await screen.findByText("2 students")).toBeDefined();
    expect(screen.getByRole("button", { name: "Period settings" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Keyboard help" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Gradebook" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Progress" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Grid" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("journal-search-slot")).toBeDefined();
    expect(screen.getByTestId("journal-save-status")).toBeDefined();
  });

  it("keeps the exam limit reachable through Period settings", async () => {
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(screen.getByRole("button", { name: "Period settings" }));
    expect(await screen.findByRole("dialog", { name: "Period settings" })).toBeDefined();
  });

  it("shows the course-wide Progress view instead of the Gradebook when the Progress tab is chosen", async () => {
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(screen.getByRole("tab", { name: "Progress" }));
    expect(await screen.findByTestId("progress-scope")).toBeDefined();
    expect(screen.queryByRole("region", { name: /Gradebook grid/ })).toBeNull();
    expect(screen.queryByTestId("journal-save-status")).toBeNull();
  });

  it("keeps the save status visible in Progress while work is unresolved", async () => {
    batchUpdateMock.mockRejectedValue(new AuthApiError(400, "Bad request"));
    renderWorkspace();
    await waitForGrid();
    const cell = gradeCell("Anvar", "2026-10-13");
    cell.focus();
    fireEvent.keyDown(cell, { key: "4" });
    await waitFor(() => expect(screen.getByTestId("journal-save-status").getAttribute("data-phase")).toBe("failed"));
    fireEvent.click(screen.getByRole("tab", { name: "Progress" }));
    expect(screen.getByTestId("journal-save-status").getAttribute("data-phase")).toBe("failed");
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });

  it("restores the Progress tab from the URL", async () => {
    renderWorkspace([`/journals/${COURSE_ID}?tab=progress`]);
    expect(await screen.findByTestId("progress-scope")).toBeDefined();
    expect(screen.getByRole("tab", { name: "Progress" }).getAttribute("aria-selected")).toBe("true");
  });

  it("restores the Summary view from the URL and lists totals with an honest unavailable state", async () => {
    const detail = buildJournal(OCTOBER);
    detail.students[1] = { ...detail.students[1], summary: null };
    getJournalMock.mockResolvedValue(detail);
    renderWorkspace([`/journals/${COURSE_ID}?view=summary`]);
    const list = await screen.findByRole("table", { name: /Student totals/ });
    expect(within(list).getAllByRole("row")).toHaveLength(3);
    expect(within(list).getByText("Unavailable")).toBeDefined();
    expect(screen.queryByRole("region", { name: /Gradebook grid/ })).toBeNull();
  });
});

describe("phone and tablet Lesson view", () => {
  beforeEach(() => {
    viewportState.desktop = false;
  });

  function lessonRow(name: string): HTMLElement {
    return document.querySelector(`[data-lesson-row="${name === "Anvar" ? 11 : 12}"]`) as HTMLElement;
  }

  async function waitForLesson(): Promise<void> {
    await screen.findByRole("list", { name: "Students for the selected lesson" });
  }

  it("shows Lesson and Summary instead of the desktop grid below 1024px", async () => {
    renderWorkspace();
    await waitForLesson();
    expect(screen.queryByRole("region", { name: /Gradebook grid/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Lesson" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Summary" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Keyboard help" })).toBeNull();
    expect(within(lessonRow("Anvar")).getByText("Anvar Tester")).toBeDefined();
  });

  it("keeps the lesson and status in one sticky band that stops sticking at short landscape heights", async () => {
    renderWorkspace();
    await waitForLesson();
    const band = screen.getByTestId("journal-lesson-band");
    expect(band.className).toContain("sticky");
    expect(band.className).toContain("top-[calc(3.5rem+1px+env(safe-area-inset-top))]");
    expect(band.className).toContain("[@media(max-height:500px)]:static");
    expect(within(band).getByRole("button", { name: "Previous lesson" })).toBeDefined();
    expect(within(band).getByTestId("journal-save-status")).toBeDefined();
  });

  it("collapses the lesson band in Summary while nothing is unsettled", async () => {
    renderWorkspace([`/journals/${COURSE_ID}?view=summary`]);
    await screen.findByRole("list", { name: /Student totals/ });
    expect(screen.queryByTestId("journal-lesson-band")).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous lesson" })).toBeNull();
  });

  it("keeps the status line visible in Summary while there is unsettled work", async () => {
    const slow = createDeferred<Record<string, number>>();
    updateSummaryMock.mockReturnValueOnce(slow.promise as never);
    renderWorkspace([`/journals/${COURSE_ID}?view=summary`]);
    await screen.findByRole("list", { name: /Student totals/ });
    fireEvent.click(screen.getByRole("button", { name: "Edit exam and bonus for Anvar Tester" }));
    fireEvent.change(screen.getByLabelText("Bonus"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const band = await screen.findByTestId("journal-lesson-band");
    expect(within(band).getByTestId("journal-save-status")).toBeDefined();
    expect(within(band).queryByRole("button", { name: "Previous lesson" })).toBeNull();
    await act(async () => {
      slow.resolve({ id: 1101, journal_id: OCTOBER, student_id: 11, homework_score: 0, attendance_score: 0, exam_score: 0, bonus_score: 6, sum_score: 6, max_period_score: 100, percentage: 6, attendance_count: 0, total_lessons: 4, version: 2 });
    });
  });

  it("queues a phone score through the same owner and journal id as the grid", async () => {
    renderWorkspace();
    await waitForLesson();
    fireEvent.click(within(lessonRow("Anvar")).getByRole("button", { name: /Score for Anvar Tester/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "4" }));
    await waitFor(() => expect(batchUpdateMock).toHaveBeenCalledTimes(1));
    expect(batchUpdateMock.mock.calls[0][0]).toBe(OCTOBER);
    expect(batchUpdateMock.mock.calls[0][1]).toEqual([
      expect.objectContaining({ student_id: 11, lesson_date: "2026-10-13", score: 4, attendance: true }),
    ]);
  });

  it("sends the checkbox absence payload from the phone row", async () => {
    const detail = buildJournal(OCTOBER);
    detail.students[0].entries[1] = { ...detail.students[0].entries[1], attendance: true, score: 4 };
    getJournalMock.mockResolvedValue(detail);
    renderWorkspace();
    await waitForLesson();
    fireEvent.click(within(lessonRow("Anvar")).getByRole("checkbox"));
    await waitFor(() => expect(batchUpdateMock).toHaveBeenCalledTimes(1));
    expect(batchUpdateMock.mock.calls[0][1]).toEqual([
      expect.objectContaining({ student_id: 11, lesson_date: "2026-10-13", attendance: false, score: 0 }),
    ]);
  });

  it("keeps the owner, draft and a single write when the viewport crosses 1024px during the debounce", async () => {
    renderWorkspace();
    await waitForLesson();
    fireEvent.click(within(lessonRow("Anvar")).getByRole("button", { name: /Score for Anvar Tester/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "3" }));

    await act(async () => {
      viewportState.setDesktop(true);
    });
    await waitForGrid();
    expect(within(gradeCell("Anvar", "2026-10-13")).getByRole("button", { name: "3" })).toBeDefined();
    expect(pickerSummary()).toContain("Month 10");

    await waitFor(() => expect(batchUpdateMock).toHaveBeenCalledTimes(1));
    expect(batchUpdateMock.mock.calls[0][1]).toEqual([expect.objectContaining({ student_id: 11, score: 3 })]);
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the equivalent control when the layout changes under a focused row control", async () => {
    renderWorkspace();
    await waitForLesson();
    const scoreButton = within(lessonRow("Bahor")).getByRole("button", { name: /Score for Bahor Tester/ });
    scoreButton.focus();
    await act(async () => {
      viewportState.setDesktop(true);
    });
    await waitForGrid();
    await waitFor(() => {
      const active = document.activeElement as HTMLElement;
      expect(active.getAttribute("data-control")).toBe("score");
      expect(active.closest("[data-anchor]")?.getAttribute("data-anchor")).toBe("12:2026-10-13");
    });
  });

  it("filters the loaded roster with a matched count, keeps source order and clears", async () => {
    renderWorkspace();
    await waitForLesson();
    const search = screen.getByRole("searchbox", { name: "Search students in this period" });
    fireEvent.change(search, { target: { value: "bah" } });
    expect(document.querySelector('[data-lesson-row="11"]')).toBeNull();
    expect(lessonRow("Bahor")).not.toBeNull();
    expect(screen.getByText("1 of 2 students")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.queryByText("1 of 2 students")).toBeNull();
    const names = Array.from(document.querySelectorAll("[data-lesson-row]")).map((row) => row.getAttribute("data-lesson-row"));
    expect(names).toEqual(["11", "12"]);
  });

  it("keeps hidden rows' pending work in the global status and sends later grades by student identity", async () => {
    const slow = createDeferred<JournalBatchUpdateResponse>();
    batchUpdateMock.mockReturnValueOnce(slow.promise);
    renderWorkspace();
    await waitForLesson();
    fireEvent.click(within(lessonRow("Anvar")).getByRole("button", { name: /Score for Anvar Tester/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "5" }));
    await waitFor(() => expect(batchUpdateMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole("searchbox", { name: "Search students in this period" }), { target: { value: "bahor" } });
    expect(document.querySelector('[data-lesson-row="11"]')).toBeNull();
    expect(screen.getByTestId("journal-save-status").getAttribute("data-phase")).toBe("saving");

    fireEvent.click(within(lessonRow("Bahor")).getByRole("button", { name: /Score for Bahor Tester/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "2" }));
    await act(async () => {
      slow.resolve({ applied: [{ student_id: 11, lesson_date: "2026-10-13", attendance: true, score: 5, comment: null, version: 2 }], conflicts: [], summaries: [] });
    });
    await waitFor(() => expect(batchUpdateMock).toHaveBeenCalledTimes(2));
    expect(batchUpdateMock.mock.calls[1][1]).toEqual([expect.objectContaining({ student_id: 12, score: 2 })]);
    expect(batchUpdateMock.mock.calls.flatMap((call) => call[1]).filter((item) => item.student_id === 11)).toHaveLength(1);
  });

  it("shows no-match copy distinct from the no-students copy", async () => {
    renderWorkspace();
    await waitForLesson();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search students in this period" }), { target: { value: "zzz" } });
    expect(await screen.findByText("No students match")).toBeDefined();
    expect(screen.queryByText("There are no students in this course")).toBeNull();
    cleanup();

    getJournalMock.mockResolvedValue({ ...buildJournal(OCTOBER), students: [] });
    renderWorkspace();
    expect(await screen.findByText("There are no students in this course")).toBeDefined();
    expect(screen.queryByText("No students match")).toBeNull();
  });

  it("filters the desktop grid by identity so a grade after filtering reaches the matched student only", async () => {
    viewportState.desktop = true;
    renderWorkspace();
    await waitForGrid();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search students in this period" }), { target: { value: "bahor" } });
    expect(screen.queryByLabelText(new RegExp(`Score for Anvar Tester`))).toBeNull();
    const cell = gradeCell("Bahor", "2026-10-13");
    cell.focus();
    fireEvent.keyDown(cell, { key: "4" });
    await waitFor(() => expect(batchUpdateMock).toHaveBeenCalledTimes(1));
    expect(batchUpdateMock.mock.calls[0][1]).toEqual([expect.objectContaining({ student_id: 12, score: 4 })]);
  });

  it("shows read-only phone rows with the archived explanation and no editors for an assigned mentor", async () => {
    useAuthStore.setState({ role: "mentor" });
    getCourseMock.mockResolvedValue(buildCourse({ status: "archived" }));
    renderWorkspace();
    await waitForLesson();
    expect(screen.getByTestId("journal-archived-notice")).toBeDefined();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(within(lessonRow("Anvar")).queryAllByRole("button")).toHaveLength(0);
  });

  it("shows a lesson skeleton in row geometry while the journal loads and a working retry on failure", async () => {
    getJournalMock.mockRejectedValueOnce(new AuthApiError(500, "boom"));
    renderWorkspace();
    expect(await screen.findByText("Failed to load journal data")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitForLesson();
    cleanup();

    const pending = createDeferred<JournalDetailResponse>();
    getJournalMock.mockReturnValueOnce(pending.promise);
    renderWorkspace();
    expect(await screen.findByTestId("journal-lesson-skeleton")).toBeDefined();
    await act(async () => {
      pending.resolve(buildJournal(OCTOBER));
    });
    await waitForLesson();
  });
});

describe("Summary, breakdown and the paired editor", () => {
  const SUMMARY_URL = `/journals/${COURSE_ID}?view=summary`;

  async function openBreakdown(name = "Anvar"): Promise<void> {
    fireEvent.click(await screen.findByRole("button", { name: `Open breakdown for ${name} Tester` }));
    await screen.findByRole("button", { name: "Back to summary" });
  }

  it("replaces the interim list with a readable table and hides the lesson controls while keeping search and status", async () => {
    renderWorkspace([SUMMARY_URL]);
    const table = await screen.findByRole("table", { name: /Student totals/ });
    ["Students", "Homework", "Attendance", "Exam", "Bonus", "Total / max", "%"].forEach((heading) =>
      expect(within(table).getByRole("columnheader", { name: heading })).toBeDefined(),
    );
    expect(screen.queryByRole("button", { name: "Previous lesson" })).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search students in this period" })).toBeDefined();
    expect(screen.getByTestId("journal-save-status")).toBeDefined();
  });

  it("keeps the selected lesson in the URL while Summary is shown so Grid returns to it", async () => {
    renderWorkspace([`/journals/${COURSE_ID}?lesson=2026-10-06`]);
    await waitForGrid();
    fireEvent.click(screen.getByRole("button", { name: "Summary" }));
    await screen.findByRole("table", { name: /Student totals/ });
    expect(router.state.location.search).toContain("lesson=2026-10-06");
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    await waitForGrid();
    const selected = screen.getAllByRole("columnheader").find((header) => header.getAttribute("aria-current") === "date");
    expect(selected?.textContent).toContain(formatSchoolLessonDate("2026-10-06"));
  });

  it("opens the breakdown in place without any further request and Back restores the row focus", async () => {
    renderWorkspace([SUMMARY_URL]);
    await screen.findByRole("table", { name: /Student totals/ });
    const journalCalls = getJournalMock.mock.calls.length;
    const enrollmentCalls = listEnrollmentsMock.mock.calls.length;
    await openBreakdown();
    expect(router.state.location.search).toContain("student=11");
    expect(getJournalMock.mock.calls.length).toBe(journalCalls);
    expect(listEnrollmentsMock.mock.calls.length).toBe(enrollmentCalls);
    expect(screen.getByRole("heading", { name: "Anvar Tester" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Back to summary" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open breakdown for Anvar Tester" })));
    expect(router.state.location.search).not.toContain("student=");
  });

  it("restores an open breakdown from the URL", async () => {
    renderWorkspace([`${SUMMARY_URL}&student=12`]);
    expect(await screen.findByRole("heading", { name: "Bahor Tester" })).toBeDefined();
  });

  it("shows View profile for a superadmin and sends navigation through the drain", async () => {
    const slow = createDeferred<{ id: number; journal_id: number; student_id: number }>();
    updateSummaryMock.mockReturnValueOnce(slow.promise as never);
    renderWorkspace([SUMMARY_URL]);
    await openBreakdown();
    fireEvent.click(screen.getByRole("button", { name: "Edit exam and bonus" }));
    fireEvent.change(screen.getByLabelText("Bonus"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(updateSummaryMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("link", { name: "View profile" }));
    await screen.findByText("Saving your changes before you leave…");
    expect(router.state.location.pathname).toBe(`/journals/${COURSE_ID}`);

    await act(async () => {
      slow.resolve({ id: 1101, journal_id: OCTOBER, student_id: 11, homework_score: 0, attendance_score: 0, exam_score: 0, bonus_score: 7, sum_score: 7, max_period_score: 100, percentage: 7, attendance_count: 0, total_lessons: 4, version: 2 } as never);
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/students/11"));
  });

  it("queues bonus and exam together with the current version as one summary write", async () => {
    updateSummaryMock.mockImplementation(async (_journalId, studentId, payload) => ({
      id: 1, journal_id: OCTOBER, student_id: studentId, homework_score: 0, attendance_score: 0, exam_score: payload.exam_score,
      bonus_score: payload.bonus_score, sum_score: payload.exam_score + payload.bonus_score, max_period_score: 100,
      percentage: payload.exam_score + payload.bonus_score, attendance_count: 0, total_lessons: 4, version: payload.version + 1,
    }));
    renderWorkspace([SUMMARY_URL]);
    await openBreakdown();
    fireEvent.click(screen.getByRole("button", { name: "Edit exam and bonus" }));
    fireEvent.change(screen.getByLabelText("Bonus"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Exam"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(updateSummaryMock).toHaveBeenCalledTimes(1));
    expect(updateSummaryMock).toHaveBeenCalledWith(OCTOBER, 11, { bonus_score: 8, exam_score: 45, version: 1 });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit exam and bonus" })));
  });

  it("keeps both local values and enters review when the summary version is stale", async () => {
    updateSummaryMock.mockRejectedValue(new AuthApiError(409, "Conflict"));
    renderWorkspace([SUMMARY_URL]);
    await openBreakdown();
    fireEvent.click(screen.getByRole("button", { name: "Edit exam and bonus" }));
    fireEvent.change(screen.getByLabelText("Bonus"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Exam"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByTestId("journal-save-status").getAttribute("data-phase")).toBe("conflict"));
    expect(screen.getByRole("button", { name: "Review" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Edit exam and bonus" }));
    expect((screen.getByLabelText("Bonus") as HTMLInputElement).value).toBe("8");
    expect((screen.getByLabelText("Exam") as HTMLInputElement).value).toBe("45");
  });

  it("shows no edit action and no editor to a mentor on an archived journal but still opens the breakdown", async () => {
    useAuthStore.setState({ role: "mentor", userId: 77 });
    getCourseMock.mockResolvedValue(buildCourse({ status: "archived" }));
    renderWorkspace([SUMMARY_URL]);
    await screen.findByRole("table", { name: /Student totals/ });
    expect(screen.queryByRole("button", { name: /Edit exam and bonus/ })).toBeNull();
    await openBreakdown();
    expect(screen.queryByRole("button", { name: "Edit exam and bonus" })).toBeNull();
    expect(screen.getByRole("link", { name: "View profile" }).getAttribute("href")).toBe("/students/11");
  });

  it("reads Unavailable for a missing summary and a percentage above 100 as supplied", async () => {
    const detail = buildJournal(OCTOBER);
    detail.students[0].summary = { ...detail.students[0].summary!, sum_score: 130, max_period_score: 124, percentage: 104.84 };
    detail.students[1] = { ...detail.students[1], summary: null };
    getJournalMock.mockResolvedValue(detail);
    renderWorkspace([SUMMARY_URL]);
    const table = await screen.findByRole("table", { name: /Student totals/ });
    expect(within(table).getByText("104.84%")).toBeDefined();
    expect(within(table).getByText("130 / 124")).toBeDefined();
    expect(within(table).getByText("Unavailable")).toBeDefined();
  });

  it("shows divided rows with labeled component pairs on narrow viewports", async () => {
    viewportState.desktop = false;
    renderWorkspace([SUMMARY_URL]);
    const list = await screen.findByRole("list", { name: /Student totals/ });
    const first = within(list).getAllByRole("listitem")[0];
    ["Homework", "Attendance", "Exam", "Bonus"].forEach((label) => expect(within(first).getByText(label)).toBeDefined());
    expect(within(first).getByRole("button", { name: /Edit exam and bonus for Anvar Tester/ })).toBeDefined();
  });

  it("filters Summary rows with the roster search", async () => {
    renderWorkspace([SUMMARY_URL]);
    const table = await screen.findByRole("table", { name: /Student totals/ });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search students in this period" }), { target: { value: "bahor" } });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).queryByText("Anvar Tester")).toBeNull();
  });
});

describe("Period settings: exam maximum", () => {
  function settingsButton(): HTMLElement {
    return screen.getByRole("button", { name: "Period settings" });
  }

  async function openSettings(): Promise<HTMLElement> {
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(settingsButton());
    return screen.findByRole("dialog", { name: "Period settings" });
  }

  function maximumInput(): HTMLInputElement {
    return screen.getByLabelText("Exam maximum") as HTMLInputElement;
  }

  function saveButton(): HTMLButtonElement {
    return screen.getByRole("button", { name: /^(Save|Saving…|Saving pending grades first…)$/ }) as HTMLButtonElement;
  }

  function typeMaximum(value: string): void {
    fireEvent.change(maximumInput(), { target: { value } });
  }

  function examResponse(examMaximum: number): JournalExamMaxScoreUpdateResponse {
    const detail = buildJournal(OCTOBER);
    return {
      journal: {
        id: OCTOBER,
        course_id: COURSE_ID,
        period_label: detail.period_label,
        period_start: detail.period_start,
        period_end: detail.period_end,
        period_type: "month",
        exam_max_score: examMaximum,
      },
      summaries: detail.students.map((student) => ({
        ...(student.summary as NonNullable<typeof student.summary>),
        journal_id: OCTOBER,
        student_id: student.student_id,
        max_period_score: 24 + examMaximum,
        version: 2,
      })),
    };
  }

  function gradeAnvar(): void {
    const cell = gradeCell("Anvar", "2026-10-13");
    cell.focus();
    fireEvent.keyDown(cell, { key: "4" });
  }

  beforeEach(() => {
    updateExamMaxMock.mockImplementation(async (_journalId, payload) => examResponse(payload.exam_max_score));
  });

  it("shows course, period name and range, current maximum, allowed range and the recalculation explanation", async () => {
    const dialog = await openSettings();
    expect(within(dialog).getByText("Algebra Intensive")).toBeDefined();
    expect(within(dialog).getByText("Month 10")).toBeDefined();
    expect(dialog.textContent).toContain(`${formatSchoolLessonDate("2026-10-01")} – ${formatSchoolLessonDate("2026-10-31")}`);
    expect(within(dialog).getByText("Current exam maximum").nextElementSibling?.textContent).toBe("100");
    expect(within(dialog).getByText("Whole number from 0 to 100")).toBeDefined();
    expect(dialog.textContent).toContain("recalculates the grading denominator of this period");
    expect(maximumInput().value).toBe("100");
    expect(saveButton().disabled).toBe(true);
  });

  it("drains pending grades before the maximum request and sends the maximum only after the drain is acknowledged", async () => {
    const slow = createDeferred<JournalBatchUpdateResponse>();
    batchUpdateMock.mockReturnValueOnce(slow.promise);
    renderWorkspace();
    await waitForGrid();
    gradeAnvar();
    fireEvent.click(settingsButton());
    await screen.findByRole("dialog", { name: "Period settings" });
    typeMaximum("80");
    fireEvent.click(saveButton());

    await waitFor(() => expect(batchUpdateMock).toHaveBeenCalledTimes(1));
    await screen.findAllByText("Saving pending grades first…");
    expect(updateExamMaxMock).not.toHaveBeenCalled();

    await act(async () => {
      slow.resolve({
        applied: [{ student_id: 11, lesson_date: "2026-10-13", attendance: true, score: 4, comment: null, version: 2 }],
        conflicts: [],
        summaries: [],
      });
    });
    await waitFor(() => expect(updateExamMaxMock).toHaveBeenCalledTimes(1));
    expect(updateExamMaxMock).toHaveBeenCalledWith(OCTOBER, { exam_max_score: 80 });
    expect(batchUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(updateExamMaxMock.mock.invocationCallOrder[0]);
  });

  it("sends nothing and keeps the draft with Retry when the drain fails", async () => {
    batchUpdateMock.mockRejectedValue(new AuthApiError(400, "Bad request"));
    renderWorkspace();
    await waitForGrid();
    gradeAnvar();
    fireEvent.click(settingsButton());
    await screen.findByRole("dialog", { name: "Period settings" });
    typeMaximum("80");
    fireEvent.click(saveButton());

    const alert = await screen.findByTestId("period-settings-alert");
    expect(alert.textContent).toContain("exam maximum was not changed");
    expect(updateExamMaxMock).not.toHaveBeenCalled();
    expect(maximumInput().value).toBe("80");
    expect(screen.getByRole("dialog", { name: "Period settings" }).textContent).toContain("Month 10");
    const dialog = screen.getByRole("dialog", { name: "Period settings" });
    expect(within(dialog).getByRole("button", { name: "Retry" })).toBeDefined();
    expect(within(dialog).queryByRole("button", { name: "Review" })).toBeNull();
  });

  it("offers Review for a conflicted drain, keeps the draft, sends nothing and returns to the dialog after review", async () => {
    batchUpdateMock.mockResolvedValue({
      applied: [],
      conflicts: [
        {
          student_id: 11,
          lesson_date: "2026-10-13",
          submitted_version: 1,
          current: { student_id: 11, lesson_date: "2026-10-13", attendance: true, score: 2, comment: null, version: 5 },
        },
      ],
      summaries: [],
    });
    renderWorkspace();
    await waitForGrid();
    gradeAnvar();
    fireEvent.click(settingsButton());
    await screen.findByRole("dialog", { name: "Period settings" });
    typeMaximum("80");
    fireEvent.click(saveButton());

    const alert = await screen.findByTestId("period-settings-alert");
    expect(alert.textContent).toContain("conflict with newer data");
    expect(updateExamMaxMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Period settings" })).getByRole("button", { name: "Review" }));
    expect(await screen.findByTestId("conflict-review-list")).toBeDefined();
    expect(screen.queryByRole("dialog", { name: "Period settings" })).toBeNull();
    expect(updateExamMaxMock).not.toHaveBeenCalled();
  });

  it("makes the journal editors inert while the maximum request is in flight and restores them afterwards", async () => {
    const pending = createDeferred<JournalExamMaxScoreUpdateResponse>();
    updateExamMaxMock.mockReturnValueOnce(pending.promise);
    renderWorkspace();
    await waitForGrid();
    const editableCells = () => screen.queryAllByLabelText(`Score for Anvar Tester on ${formatSchoolLessonDate("2026-10-13")}`).length;
    expect(editableCells()).toBe(1);
    fireEvent.click(settingsButton());
    await screen.findByRole("dialog", { name: "Period settings" });
    typeMaximum("90");
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateExamMaxMock).toHaveBeenCalledTimes(1));
    expect(editableCells()).toBe(0);
    expect(document.querySelectorAll('input[type="checkbox"]:not([disabled])')).toHaveLength(0);

    await act(async () => {
      pending.resolve(examResponse(90));
    });
    await waitFor(() => expect(editableCells()).toBe(1));
  });

  it.each([
    ["", "Enter a whole number from 0 to 100."],
    ["7.5", "Use digits only, without decimals or signs."],
    ["-1", "Use digits only, without decimals or signs."],
    ["abc", "Use digits only, without decimals or signs."],
    ["101", "The exam maximum must be between 0 and 100."],
  ])("rejects %j without clamping, keeps the text and disables Save", async (value, message) => {
    await openSettings();
    typeMaximum(value);
    expect(maximumInput().value).toBe(value);
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(saveButton().disabled).toBe(true);
    fireEvent.submit(maximumInput().closest("form") as HTMLFormElement);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updateExamMaxMock).not.toHaveBeenCalled();
    expect(batchUpdateMock).not.toHaveBeenCalled();
  });

  it("disables Save for an unchanged value, including after retyping the current one", async () => {
    await openSettings();
    expect(saveButton().disabled).toBe(true);
    typeMaximum("90");
    expect(saveButton().disabled).toBe(false);
    typeMaximum("100");
    expect(saveButton().disabled).toBe(true);
  });

  it("sends exactly one request when Save is triggered repeatedly and labels the pending state", async () => {
    const pending = createDeferred<JournalExamMaxScoreUpdateResponse>();
    updateExamMaxMock.mockReturnValueOnce(pending.promise);
    await openSettings();
    typeMaximum("90");
    const form = maximumInput().closest("form") as HTMLFormElement;
    fireEvent.click(saveButton());
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(updateExamMaxMock).toHaveBeenCalledTimes(1));
    expect(saveButton().textContent).toContain("Saving…");
    expect(saveButton().disabled).toBe(true);
    fireEvent.submit(form);
    await act(async () => {
      pending.resolve(examResponse(90));
    });
    expect(updateExamMaxMock).toHaveBeenCalledTimes(1);
  });

  it("cannot be dismissed while the request is in flight", async () => {
    const pending = createDeferred<JournalExamMaxScoreUpdateResponse>();
    updateExamMaxMock.mockReturnValueOnce(pending.promise);
    await openSettings();
    typeMaximum("90");
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateExamMaxMock).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Period settings" }), { key: "Escape" });
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("dialog", { name: "Period settings" })).toBeDefined();
    expect(screen.queryByText("Continue editing")).toBeNull();

    await act(async () => {
      pending.resolve(examResponse(90));
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Period settings" })).toBeNull());
  });

  it("closes a pristine dialog with Escape or Cancel and writes nothing", async () => {
    await openSettings();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Period settings" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Period settings" })).toBeNull());
    fireEvent.click(settingsButton());
    await screen.findByRole("dialog", { name: "Period settings" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Period settings" })).toBeNull());
    expect(updateExamMaxMock).not.toHaveBeenCalled();
    expect(batchUpdateMock).not.toHaveBeenCalled();
  });

  it("asks Continue editing or Discard changes for a dirty unsent value", async () => {
    await openSettings();
    typeMaximum("90");
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Period settings" }), { key: "Escape" });
    expect(await screen.findByText("You have an unsaved exam maximum.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Continue editing" }));
    expect(maximumInput().value).toBe("90");
    expect(screen.queryByText("You have an unsaved exam maximum.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Period settings" })).toBeNull());
    expect(updateExamMaxMock).not.toHaveBeenCalled();

    fireEvent.click(settingsButton());
    await screen.findByRole("dialog", { name: "Period settings" });
    expect(maximumInput().value).toBe("100");
  });

  it("applies the returned maximum and summaries, closes, returns focus and refreshes Progress", async () => {
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(screen.getByRole("tab", { name: "Progress" }));
    await screen.findByRole("table", { name: "Class results by period" });
    expect(getStaffProgressMock).toHaveBeenCalledTimes(1);

    fireEvent.click(settingsButton());
    await screen.findByRole("dialog", { name: "Period settings" });
    typeMaximum("80");
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Period settings" })).toBeNull());
    expect(updateExamMaxMock).toHaveBeenCalledWith(OCTOBER, { exam_max_score: 80 });
    await waitFor(() => expect(document.activeElement).toBe(settingsButton()));
    await waitFor(() => expect(getStaffProgressMock).toHaveBeenCalledTimes(2));

    fireEvent.click(settingsButton());
    await screen.findByRole("dialog", { name: "Period settings" });
    expect(maximumInput().value).toBe("80");
  });

  it("names the highest existing exam score when the server rejects a lower maximum and keeps the input", async () => {
    getJournalMock.mockImplementation(async (journalId: number) => {
      const detail = buildJournal(journalId);
      detail.students[0].summary = { ...(detail.students[0].summary as NonNullable<typeof detail.students[0]["summary"]>), exam_score: 60 };
      return detail;
    });
    updateExamMaxMock.mockRejectedValue(new AuthApiError(400, "Cannot lower exam max score to 40: student(s) Anvar Tester already have higher exam scores"));
    const dialog = await openSettings();
    expect(dialog.textContent).toContain("Highest existing exam score: 60");
    typeMaximum("40");
    fireEvent.click(saveButton());

    const alert = await screen.findByTestId("period-settings-alert");
    expect(updateExamMaxMock).toHaveBeenCalledWith(OCTOBER, { exam_max_score: 40 });
    expect(alert.textContent).toBe("Cannot lower the exam maximum to 40: the highest existing exam score is 60. Choose 60 or more.");
    expect(maximumInput().value).toBe("40");
    expect(screen.getByRole("dialog", { name: "Period settings" })).toBeDefined();
    expect(saveButton().disabled).toBe(false);
  });

  it.each([
    [new AuthApiError(403, "Not enough permissions"), "You no longer have permission to change this period."],
    [new AuthApiError(404, "Journal not found"), "This period no longer exists. Reload the journal."],
    [new AuthApiError(500, "boom"), "The exam maximum could not be changed. Try again."],
  ])("maps %o to a translated message instead of the raw server text", async (error, message) => {
    updateExamMaxMock.mockRejectedValue(error);
    await openSettings();
    typeMaximum("90");
    fireEvent.click(saveButton());
    expect((await screen.findByTestId("period-settings-alert")).textContent).toBe(message);
    expect(maximumInput().value).toBe("90");
  });

  it("is translated in Russian and Tajik", async () => {
    await i18n.changeLanguage("ru");
    renderWorkspace();
    await screen.findByRole("region", { name: /./ });
    fireEvent.click(screen.getByRole("button", { name: "Настройки периода" }));
    expect(await screen.findByRole("dialog", { name: "Настройки периода" })).toBeDefined();
    cleanup();
    await i18n.changeLanguage("tg");
    renderWorkspace();
    await screen.findByRole("region", { name: /./ });
    fireEvent.click(screen.getByRole("button", { name: "Танзимоти давра" }));
    expect(await screen.findByRole("dialog", { name: "Танзимоти давра" })).toBeDefined();
  });

  it("offers no Period settings to an assigned mentor on an archived course", async () => {
    useAuthStore.setState({ role: "mentor" });
    getCourseMock.mockResolvedValue(buildCourse({ status: "archived" }));
    renderWorkspace();
    await waitForGrid();
    expect(screen.queryByRole("button", { name: "Period settings" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Period settings" })).toBeNull();
  });

  it("keeps Period settings for an assigned mentor on an active course", async () => {
    useAuthStore.setState({ role: "mentor" });
    renderWorkspace();
    await waitForGrid();
    expect(settingsButton()).toBeDefined();
  });
});

describe("Progress tab", () => {
  const PROGRESS_URL = `/journals/${COURSE_ID}?tab=progress`;

  async function openProgress(): Promise<HTMLElement> {
    renderWorkspace([PROGRESS_URL]);
    return screen.findByRole("table", { name: "Class results by period" });
  }

  function periodRow(table: HTMLElement, label: string): HTMLElement {
    return within(table).getByRole("rowheader", { name: new RegExp(label) }).closest("tr") as HTMLElement;
  }

  function fills(row: HTMLElement): number[] {
    return within(row).getAllByTestId("progress-bar").map((bar) => Number((bar.firstElementChild as HTMLElement).getAttribute("data-fill")));
  }

  it("scopes the view to the whole course with each period's range and a stored-totals note", async () => {
    const table = await openProgress();
    expect(screen.getByTestId("progress-scope").textContent).toBe("Whole course, all periods");
    expect(screen.getByText("Average of stored totals for every period of this course. Missing results show as Unavailable.")).toBeDefined();
    expect(periodRow(table, "Month 8").textContent).toContain(`${formatSchoolLessonDate("2026-08-01")} – ${formatSchoolLessonDate("2026-08-31")}`);
    expect(getStaffProgressMock).toHaveBeenCalledWith(COURSE_ID);
  });

  it("counts stored results out of the roster, excludes missing results from the average and calls them Unavailable", async () => {
    const table = await openProgress();
    const august = periodRow(table, "Month 8");
    expect(august.textContent).toContain("1 of 2 students");
    expect(august.textContent).toContain("Unavailable: 1");
    expect(within(august).getByText("75%")).toBeDefined();
    expect(periodRow(table, "Month 9").textContent).toContain("2 of 2 students");
  });

  it("distinguishes a stored zero from a missing result", async () => {
    const table = await openProgress();
    fireEvent.change(screen.getByLabelText("Compare a student"), { target: { value: "11" } });
    const september = periodRow(table, "Month 9");
    expect(within(september).getByText("0%")).toBeDefined();
    expect(september.textContent).toContain("0 of 24");
    expect(september.textContent).not.toContain("Unavailable");
    expect(within(september).getByText("25%")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Compare a student"), { target: { value: "12" } });
    const august = periodRow(table, "Month 8");
    expect(within(august).getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(fills(august)[1]).toBe(0);
  });

  it("shows values above 100 as supplied and scales bars so nothing is clipped", async () => {
    const table = await openProgress();
    fireEvent.change(screen.getByLabelText("Compare a student"), { target: { value: "11" } });
    const october = periodRow(table, "Month 10");
    expect(within(october).getByText("102%")).toBeDefined();
    expect(october.textContent).toContain("25 of 24.5");
    const [classFill, studentFill] = fills(october);
    expect(studentFill).toBe(100);
    expect(classFill).toBeLessThan(100);
    expect(classFill).toBeCloseTo((76 / 102) * 100, 5);
    fireEvent.change(screen.getByLabelText("Compare a student"), { target: { value: "" } });
    expect(Math.max(...fills(periodRow(table, "Month 9")))).toBeLessThanOrEqual(100);
  });

  it("keeps the same course-wide scope and one request when the Gradebook period changes", async () => {
    await openProgress();
    fireEvent.change(periodPicker(), { target: { value: String(AUGUST) } });
    await waitFor(() => expect(router.state.location.search).toContain(`period=${AUGUST}`));
    expect(screen.getByTestId("progress-scope").textContent).toBe("Whole course, all periods");
    expect(getStaffProgressMock).toHaveBeenCalledTimes(1);
  });

  it("offers one roster-scoped comparison select with a None option and no separate search", async () => {
    await openProgress();
    const select = screen.getByLabelText("Compare a student") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(["None", "Anvar Tester", "Bahor Tester"]);
    expect(screen.queryByLabelText("Search students in this course")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("labels periods that start after school-calendar today Upcoming and Not started, by date only", async () => {
    const data = buildStaffProgress();
    data.periods.push({ id: 104, period_label: "Month 11", period_start: "2026-11-01", period_end: "2026-11-30" });
    data.students.forEach((student) => student.period_results.push(staffResult(104, 0, 24, 0)));
    getStaffProgressMock.mockResolvedValue(data);
    const table = await openProgress();
    const november = periodRow(table, "Month 11");
    expect(november.textContent).toContain("Upcoming");
    expect(november.textContent).toContain("Not started");
    expect(november.textContent).not.toContain("0%");
    expect(november.textContent).not.toContain("of 2 students");
    expect(within(november).queryAllByTestId("progress-bar")).toHaveLength(0);
    expect(periodRow(table, "Month 10").textContent).not.toContain("Upcoming");
    schoolToday.value = "2026-11-01";
    cleanup();
    renderWorkspace([PROGRESS_URL]);
    const later = await screen.findByRole("table", { name: "Class results by period" });
    expect(periodRow(later, "Month 11").textContent).not.toContain("Not started");
    expect(periodRow(later, "Month 11").textContent).toContain("2 of 2 students");
  });

  it("colors the student series with the primary token in both themes and the class series with the muted token", async () => {
    const table = await openProgress();
    fireEvent.change(screen.getByLabelText("Compare a student"), { target: { value: "11" } });
    const bars = within(periodRow(table, "Month 10")).getAllByTestId("progress-bar");
    expect(bars[0].firstElementChild?.className).toContain("bg-muted");
    expect(bars[1].firstElementChild?.className).toContain("bg-maroon");
    expect(document.querySelector("[data-testid='journal-progress']")?.innerHTML).not.toContain("dark:bg-accent");
  });

  it("renders no completion, grading-status or needs-grading claim and no chart", async () => {
    await openProgress();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/graded|completed|complete\b|completion|needs grading|ungraded/i);
    expect(document.querySelector("svg[role='img']")).toBeNull();
  });

  it("shows the divided period list with the same numbers on a narrow viewport", async () => {
    viewportState.setDesktop(false);
    renderWorkspace([PROGRESS_URL]);
    const list = await screen.findByRole("list", { name: "Class results by period" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(list.textContent).toContain("1 of 2 students");
    expect(list.textContent).toContain("75%");
    expect(screen.queryByRole("table")).toBeNull();
    viewportState.setDesktop(true);
  });

  it("shows a skeleton while loading, then an empty-roster explanation", async () => {
    const pending = createDeferred<CourseStaffProgressResponse>();
    getStaffProgressMock.mockReturnValueOnce(pending.promise);
    renderWorkspace([PROGRESS_URL]);
    expect(await screen.findByTestId("journal-progress-skeleton")).toBeDefined();
    await act(async () => {
      pending.resolve({ ...buildStaffProgress(), students: [] });
    });
    expect(await screen.findByText("No students in this course")).toBeDefined();
  });

  it("keeps the Gradebook and its drafts intact when Progress fails, and Retry recovers", async () => {
    getStaffProgressMock.mockRejectedValueOnce(new AuthApiError(500, "boom"));
    batchUpdateMock.mockImplementation(() => new Promise(() => undefined));
    renderWorkspace();
    await waitForGrid();
    const cell = gradeCell("Anvar", "2026-10-13");
    cell.focus();
    fireEvent.keyDown(cell, { key: "4" });
    fireEvent.click(screen.getByRole("tab", { name: "Progress" }));
    const alert = await screen.findByText("Could not load progress");
    expect(alert).toBeDefined();
    expect(screen.getByText("Your gradebook and unsaved changes are not affected.")).toBeDefined();
    expect(screen.getByTestId("journal-save-status")).toBeDefined();

    fireEvent.click(screen.getAllByRole("button", { name: "Retry" }).find((button) => button.closest("[role='alert']")?.textContent?.includes("Could not load progress")) as HTMLElement);
    expect(await screen.findByRole("table", { name: "Class results by period" })).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "Gradebook" }));
    await waitForGrid();
    expect(within(gradeCell("Anvar", "2026-10-13")).getByRole("button", { name: "4" })).toBeDefined();
  });

  it("is translated in Russian and Tajik", async () => {
    await i18n.changeLanguage("ru");
    renderWorkspace([PROGRESS_URL]);
    expect((await screen.findByTestId("progress-scope")).textContent).toBe("Весь курс, все периоды");
    cleanup();
    await i18n.changeLanguage("tg");
    renderWorkspace([PROGRESS_URL]);
    expect((await screen.findByTestId("progress-scope")).textContent).toBe("Тамоми курс, ҳамаи давраҳо");
  });
});

describe("Group 04 cross-surface integration", () => {
  async function visitAugustThenSelectOctober(query: string = "", ready: () => Promise<unknown> = waitForGrid): Promise<void> {
    renderWorkspace([`/journals/${COURSE_ID}?period=${AUGUST}${query}`]);
    await ready();
    fireEvent.change(periodPicker(), { target: { value: String(OCTOBER) } });
    await waitFor(() => expect(pickerSummary()).toContain("Month 10"));
    await ready();
  }

  async function goBackToAugust(): Promise<void> {
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(pickerSummary()).toContain("Month 8"));
  }

  it("sends View profile with the full journal URL so the profile can return to it", async () => {
    renderWorkspace([`/journals/${COURSE_ID}?period=${OCTOBER}&lesson=2026-10-13&view=summary&student=11`]);
    fireEvent.click(await screen.findByRole("link", { name: "View profile" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/students/11"));
    expect(router.state.location.state).toEqual({
      fromJournal: `/journals/${COURSE_ID}?period=${OCTOBER}&lesson=2026-10-13&view=summary&student=11`,
    });
  });

  it("closes Period settings and discards its typed maximum when browser Back changes the period", async () => {
    await visitAugustThenSelectOctober();
    fireEvent.click(screen.getByRole("button", { name: "Period settings" }));
    await screen.findByRole("dialog", { name: "Period settings" });
    fireEvent.change(screen.getByLabelText("Exam maximum"), { target: { value: "77" } });

    await goBackToAugust();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Period settings" })).toBeNull());
    expect(updateExamMaxMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Period settings" }));
    await screen.findByRole("dialog", { name: "Period settings" });
    expect((screen.getByLabelText("Exam maximum") as HTMLInputElement).value).toBe("100");
    expect(screen.getByRole("dialog", { name: "Period settings" }).textContent).toContain("Month 8");
  });

  it("closes the Summary editor and drops its draft when browser Back changes the period", async () => {
    await visitAugustThenSelectOctober("&view=summary", () => screen.findByRole("table", { name: /Student totals/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit exam and bonus for Anvar Tester" }));
    fireEvent.change(await screen.findByLabelText("Bonus"), { target: { value: "9" } });

    await goBackToAugust();
    await waitFor(() => expect(screen.queryByLabelText("Bonus")).toBeNull());
    expect(updateSummaryMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes a phone comment dialog when browser Back changes the period and never saves its text to the other journal", async () => {
    viewportState.setDesktop(false);
    await visitAugustThenSelectOctober("", () => screen.findByRole("list", { name: "Students for the selected lesson" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add comment for Anvar Tester" }));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "typed for October" } });

    await goBackToAugust();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(batchUpdateMock).not.toHaveBeenCalled();
    viewportState.setDesktop(true);
  });

  it("keeps a dirty Summary editor draft when the viewport crosses the 1024px breakpoint", async () => {
    renderWorkspace([`/journals/${COURSE_ID}?view=summary`]);
    await screen.findByRole("table", { name: /Student totals/ });
    fireEvent.click(screen.getByRole("button", { name: "Edit exam and bonus for Anvar Tester" }));
    fireEvent.change(await screen.findByLabelText("Bonus"), { target: { value: "9" } });

    act(() => viewportState.setDesktop(false));
    await screen.findByRole("list", { name: /Student totals/, hidden: true });
    expect((screen.getByLabelText("Bonus") as HTMLInputElement).value).toBe("9");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    act(() => viewportState.setDesktop(true));
    await screen.findByRole("table", { name: /Student totals/, hidden: true });
    expect((screen.getByLabelText("Bonus") as HTMLInputElement).value).toBe("9");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it.each([
    [403, "You do not have access to this journal"],
    [404, "Journal not found"],
  ])("explains a %i course response as a denial with no Retry", async (status, title) => {
    useAuthStore.setState({ role: "mentor" });
    getCourseMock.mockRejectedValue(new AuthApiError(status, "denied"));
    renderWorkspace();
    expect(await screen.findByText(title)).toBeDefined();
    expect(screen.queryByText("Failed to load course")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("link", { name: "Journals" })).toBeDefined();
  });

  it("hides roster search while a breakdown is open and shows it again after Back to summary", async () => {
    renderWorkspace([`/journals/${COURSE_ID}?view=summary&student=11`]);
    await screen.findByRole("button", { name: "Back to summary" });
    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to summary" }));
    expect(await screen.findByRole("searchbox", { name: "Search students in this period" })).toBeDefined();
  });

  it("offers no roster search when the course has no students", async () => {
    getJournalMock.mockImplementation(async (journalId: number) => ({ ...buildJournal(journalId), students: [] }));
    renderWorkspace();
    expect(await screen.findByText("There are no students in this course")).toBeDefined();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("moves focus to the breakdown heading when the page is restored with an open breakdown", async () => {
    renderWorkspace([`/journals/${COURSE_ID}?view=summary&student=12`]);
    const heading = await screen.findByRole("heading", { name: "Bahor Tester" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
});
