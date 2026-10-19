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

function periodPicker(): HTMLElement {
  return screen.getByRole("combobox", { name: "Period" });
}

function pickerSummary(): string {
  return periodPicker().textContent ?? "";
}

function optionTextOf(label: string): string {
  if (periodPicker().getAttribute("aria-expanded") !== "true") fireEvent.click(periodPicker());
  const option: HTMLElement = within(screen.getByRole("listbox")).getByRole("option", { name: new RegExp(`^${label}`) });
  return option.textContent ?? "";
}

function choosePeriod(periodId: number): void {
  fireEvent.click(periodPicker());
  const label: string = (PERIODS.find((period) => period.id === periodId) as JournalPeriod).period_label;
  fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: new RegExp(`^${label}`) }));
}

function periodSettingsButton(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Period options" }));
  return screen.getByRole("menuitem", { name: "Period settings" });
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
    expect(optionTextOf("Month 10")).toContain("Current");
  });

  it("selects the latest started period and labels it Latest when the course calendar has ended", async () => {
    schoolToday.value = "2027-03-01";
    renderWorkspace();
    await waitForGrid();
    expect(getJournalMock).toHaveBeenCalledWith(OCTOBER);
    expect(optionTextOf("Month 10")).toContain("Latest");
    expect(optionTextOf("Month 10")).not.toContain("Current");
  });

  it("selects the earliest period and labels it Upcoming when every period is in the future", async () => {
    schoolToday.value = "2026-01-05";
    renderWorkspace();
    await waitForGrid();
    expect(getJournalMock).toHaveBeenCalledWith(AUGUST);
    expect(pickerSummary()).toContain("Month 8");
    expect(optionTextOf("Month 8")).toContain("Upcoming");
  });

  it("shows only the period label in the trigger, with range and status inside the dropdown items", async () => {
    renderWorkspace();
    await waitForGrid();
    expect(pickerSummary().trim()).toBe("Month 10");
    const optionText: string = optionTextOf("Month 10");
    expect(optionText).toContain(formatSchoolLessonDate("2026-10-01"));
    expect(optionText).toContain("Current");
  });

  it("opens a listbox of rows with label, muted range, timing chip and a check on the selected period, with no fill-state badge", async () => {
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(periodPicker());
    const listbox = screen.getByRole("listbox", { name: "Period" });
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0].textContent).toContain("Month 8");
    expect(options[0].textContent).toContain(`${formatSchoolLessonDate("2026-08-01")} – ${formatSchoolLessonDate("2026-08-31")}`);
    expect(options[0].textContent).toContain("Past");
    expect(options[2].textContent).toContain("Current");
    options.forEach((option) => expect(option.className).toContain("min-h-11"));
    expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
    expect(options[2].querySelector("svg")).not.toBeNull();
    expect(options[0].querySelector("svg")).toBeNull();
    for (const fillState of ["Complete", "In progress", "Not started", "Unavailable"]) {
      expect(listbox.textContent).not.toContain(fillState);
      expect(pickerSummary()).not.toContain(fillState);
    }
    expect(periodPicker().getAttribute("aria-expanded")).toBe("true");
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

    choosePeriod(AUGUST);
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

    choosePeriod(AUGUST);

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

    choosePeriod(AUGUST);

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

    fireEvent.click(within(screen.getAllByRole("columnheader")[1]).getAllByRole("button")[0]);

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
    expect(screen.queryByRole("button", { name: "Period options" })).toBeNull();
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

  it("explains an empty roster", async () => {
    getJournalMock.mockResolvedValue({ ...buildJournal(OCTOBER), students: [] });
    renderWorkspace();
    expect(await screen.findByText("There are no students in this course")).toBeDefined();
  });
});

describe("workspace anatomy", () => {
  it("keeps the exam limit reachable through Period settings", async () => {
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(periodSettingsButton());
    expect(await screen.findByRole("dialog", { name: "Period settings" })).toBeDefined();
  });

});

describe("single-screen journal page", () => {
  it("renders no tabs, no Table/Results switch and no day arrows", async () => {
    renderWorkspace();
    await waitForGrid();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    for (const name of ["Grid", "Summary", "Lesson", "Table", "Results", "Previous lesson", "Next lesson"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("shows a compact toolbar with the period dropdown, search, options menu, save status and a shortcuts icon button", async () => {
    renderWorkspace();
    await waitForGrid();
    const toolbar: HTMLElement = screen.getByTestId("journal-toolbar");
    expect(within(toolbar).getByRole("combobox", { name: "Period" })).toBeDefined();
    expect(within(toolbar).getByTestId("journal-search-slot")).toBeDefined();
    expect(within(toolbar).getByRole("button", { name: "Period options" })).toBeDefined();
    expect(within(toolbar).getByTestId("journal-save-status")).toBeDefined();
    const help: HTMLElement = within(toolbar).getByRole("button", { name: "Keyboard shortcuts" });
    expect(help.textContent).toBe("");
    expect(screen.queryByRole("button", { name: "Period settings" })).toBeNull();
  });

  it("puts the progress chart between the toolbar and the grid and renders no per-student progress table", async () => {
    renderWorkspace();
    await waitForGrid();
    const chart: HTMLElement = await screen.findByTestId("progress-chart");
    const toolbar: HTMLElement = screen.getByTestId("journal-toolbar");
    const grid: HTMLElement = screen.getByRole("region", { name: /Gradebook grid/ });
    expect(toolbar.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chart.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId("progress-table")).toBeNull();
  });

  it("renders no chart when no period has graded data", async () => {
    const ungraded: CourseStaffProgressResponse = buildStaffProgress();
    ungraded.students = ungraded.students.map((entry) => ({
      ...entry,
      period_results: entry.period_results.map((periodResult) => staffResult(periodResult.period_id, null, null, null)),
    }));
    getStaffProgressMock.mockResolvedValue(ungraded);
    renderWorkspace();
    await waitForGrid();
    await waitFor(() => expect(getStaffProgressMock).toHaveBeenCalled());
    expect(screen.queryByTestId("progress-chart")).toBeNull();
    expect(screen.queryByTestId("progress-collapse-toggle")).toBeNull();
  });

  it("shows Exam and Bonus as the last editable columns before Total and %, and saves an exam edit through the summary endpoint", async () => {
    updateSummaryMock.mockImplementation(async (journalId, studentId, payload) => ({
      ...(buildJournal(journalId).students[0].summary as NonNullable<JournalDetailResponse["students"][number]["summary"]>),
      journal_id: journalId,
      student_id: studentId,
      exam_score: payload.exam_score,
      bonus_score: payload.bonus_score,
      version: payload.version + 1,
    }));
    renderWorkspace();
    await waitForGrid();
    const names: string[] = screen.getAllByRole("columnheader").map((header) => header.textContent ?? "");
    expect(names.slice(-4)).toEqual(["Exam", "Bonus", "Total", "%"]);
    const exam = screen.getByRole("textbox", { name: "Exam score for Anvar Tester" });
    fireEvent.change(exam, { target: { value: "30" } });
    fireEvent.blur(exam);
    await waitFor(() => expect(updateSummaryMock).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(updateSummaryMock).toHaveBeenCalledWith(OCTOBER, 11, { exam_score: 30, bonus_score: 0, version: 1 });
  });

  it("keeps Exam and Bonus read-only for a mentor on an archived course", async () => {
    useAuthStore.setState({ role: "mentor" });
    getCourseMock.mockResolvedValue(buildCourse({ status: "archived" }));
    renderWorkspace();
    await waitForGrid();
    expect(screen.queryAllByRole("textbox", { name: /^(Exam|Bonus) score for/ })).toHaveLength(0);
    expect(screen.getAllByLabelText("Exam score for Anvar Tester").length).toBeGreaterThan(0);
  });

  it("bulk-fills a lesson column through one batched autosave request that touches only empty cells", async () => {
    const detail: JournalDetailResponse = buildJournal(OCTOBER);
    detail.students[1] = {
      ...detail.students[1],
      entries: detail.students[1].entries.map((entry) =>
        entry.lesson_date === "2026-10-13" ? { ...entry, attendance: true, score: 3 } : entry,
      ),
    };
    getJournalMock.mockResolvedValue(detail);
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(screen.getByRole("button", { name: `Bulk actions for ${formatSchoolLessonDate("2026-10-13")}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark all present" }));
    await waitFor(() => expect(batchUpdateMock).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const payload = batchUpdateMock.mock.calls[0][1];
    expect(payload).toHaveLength(1);
    expect(payload[0]).toEqual(expect.objectContaining({ student_id: 11, lesson_date: "2026-10-13", attendance: true }));
  });

  it("marks only the at-risk students: low period percentage or three absences in a row", async () => {
    const detail: JournalDetailResponse = buildJournal(OCTOBER);
    detail.students[0] = { ...detail.students[0], summary: { ...(detail.students[0].summary as NonNullable<typeof detail.students[0]["summary"]>), percentage: 40 } };
    detail.students[1] = { ...detail.students[1], summary: { ...(detail.students[1].summary as NonNullable<typeof detail.students[1]["summary"]>), percentage: 80 } };
    getJournalMock.mockResolvedValue(detail);
    renderWorkspace();
    await waitForGrid();
    const markers: HTMLElement[] = screen.getAllByTestId("at-risk-marker");
    expect(markers).toHaveLength(1);
    expect(within(screen.getByRole("rowheader", { name: /Anvar Tester/ })).getByTestId("at-risk-marker")).toBe(markers[0]);
  });

  it("shows a single empty state without toolbar, chart or grid when the course has no students, with an Add students link for an administrator", async () => {
    getJournalMock.mockResolvedValue({ ...buildJournal(OCTOBER), students: [] });
    renderWorkspace();
    expect(await screen.findByText("There are no students in this course")).toBeDefined();
    expect(screen.getByRole("link", { name: "Add students" }).getAttribute("href")).toBe(`/courses/${COURSE_ID}`);
    expect(screen.queryByTestId("journal-toolbar")).toBeNull();
    expect(screen.queryByTestId("progress-chart")).toBeNull();
    expect(screen.queryByRole("region", { name: /Gradebook grid/ })).toBeNull();
  });

  it("offers no Add students link to a mentor on an empty course", async () => {
    useAuthStore.setState({ role: "mentor" });
    getJournalMock.mockResolvedValue({ ...buildJournal(OCTOBER), students: [] });
    renderWorkspace();
    expect(await screen.findByText("There are no students in this course")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Add students" })).toBeNull();
  });
});

describe("Period settings: exam maximum", () => {
  function settingsButton(): HTMLElement {
    return periodSettingsButton();
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
    await screen.findByTestId("progress-chart");
    expect(getStaffProgressMock).toHaveBeenCalledTimes(1);

    fireEvent.click(settingsButton());
    await screen.findByRole("dialog", { name: "Period settings" });
    typeMaximum("80");
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Period settings" })).toBeNull());
    expect(updateExamMaxMock).toHaveBeenCalledWith(OCTOBER, { exam_max_score: 80 });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Period options" })));
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
    fireEvent.click(await screen.findByRole("button", { name: "Параметры периода" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Настройки периода" }));
    expect(await screen.findByRole("dialog", { name: "Настройки периода" })).toBeDefined();
    cleanup();
    await i18n.changeLanguage("tg");
    renderWorkspace();
    await screen.findByRole("region", { name: /./ });
    fireEvent.click(await screen.findByRole("button", { name: "Параметрҳои давра" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Танзимоти давра" }));
    expect(await screen.findByRole("dialog", { name: "Танзимоти давра" })).toBeDefined();
  });

  it("offers no Period settings to an assigned mentor on an archived course", async () => {
    useAuthStore.setState({ role: "mentor" });
    getCourseMock.mockResolvedValue(buildCourse({ status: "archived" }));
    renderWorkspace();
    await waitForGrid();
    expect(screen.queryByRole("button", { name: "Period options" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Period settings" })).toBeNull();
  });

  it("keeps Period settings for an assigned mentor on an active course", async () => {
    useAuthStore.setState({ role: "mentor" });
    renderWorkspace();
    await waitForGrid();
    expect(settingsButton()).toBeDefined();
  });
});

describe("Group 04 cross-surface integration", () => {
  async function visitAugustThenSelectOctober(query: string = "", ready: () => Promise<unknown> = waitForGrid): Promise<void> {
    renderWorkspace([`/journals/${COURSE_ID}?period=${AUGUST}${query}`]);
    await ready();
    choosePeriod(OCTOBER);
    await waitFor(() => expect(pickerSummary()).toContain("Month 10"));
    await ready();
  }

  async function goBackToAugust(): Promise<void> {
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(pickerSummary()).toContain("Month 8"));
  }

  it("closes Period settings and discards its typed maximum when browser Back changes the period", async () => {
    await visitAugustThenSelectOctober();
    fireEvent.click(periodSettingsButton());
    await screen.findByRole("dialog", { name: "Period settings" });
    fireEvent.change(screen.getByLabelText("Exam maximum"), { target: { value: "77" } });

    await goBackToAugust();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Period settings" })).toBeNull());
    expect(updateExamMaxMock).not.toHaveBeenCalled();

    fireEvent.click(periodSettingsButton());
    await screen.findByRole("dialog", { name: "Period settings" });
    expect((screen.getByLabelText("Exam maximum") as HTMLInputElement).value).toBe("100");
    expect(screen.getByRole("dialog", { name: "Period settings" }).textContent).toContain("Month 8");
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

  it("offers no roster search when the course has no students", async () => {
    getJournalMock.mockImplementation(async (journalId: number) => ({ ...buildJournal(journalId), students: [] }));
    renderWorkspace();
    expect(await screen.findByText("There are no students in this course")).toBeDefined();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

});

describe("period listbox keyboard and focus", () => {
  it("opens with ArrowDown, moves with the arrows, Home and End and shows the active option through aria-activedescendant", async () => {
    renderWorkspace();
    await waitForGrid();
    periodPicker().focus();
    fireEvent.keyDown(periodPicker(), { key: "ArrowDown" });
    const listbox = screen.getByRole("listbox");
    expect(document.activeElement).toBe(listbox);
    const options = within(listbox).getAllByRole("option");
    expect(listbox.getAttribute("aria-activedescendant")).toBe(options[2].id);
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    expect(listbox.getAttribute("aria-activedescendant")).toBe(options[1].id);
    fireEvent.keyDown(listbox, { key: "Home" });
    expect(listbox.getAttribute("aria-activedescendant")).toBe(options[0].id);
    fireEvent.keyDown(listbox, { key: "End" });
    expect(listbox.getAttribute("aria-activedescendant")).toBe(options[2].id);
  });

  it("jumps by typeahead on the period label", async () => {
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(periodPicker());
    const listbox = screen.getByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    fireEvent.keyDown(listbox, { key: "m" });
    fireEvent.keyDown(listbox, { key: "o" });
    fireEvent.keyDown(listbox, { key: "n" });
    fireEvent.keyDown(listbox, { key: "t" });
    fireEvent.keyDown(listbox, { key: "h" });
    fireEvent.keyDown(listbox, { key: " " });
    expect(options.length).toBe(3);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("selects with Enter through the drain: waits for the slow save, then switches", async () => {
    const slow = createDeferred<JournalBatchUpdateResponse>();
    batchUpdateMock.mockReturnValueOnce(slow.promise);
    renderWorkspace();
    await waitForGrid();
    const cell = gradeCell("Anvar", "2026-10-13");
    cell.focus();
    fireEvent.keyDown(cell, { key: "4" });
    periodPicker().focus();
    fireEvent.keyDown(periodPicker(), { key: "ArrowDown" });
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "Home" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    await screen.findByText("Saving your changes before you leave…");
    expect(router.state.location.search).toBe("");
    await act(async () => {
      slow.resolve({ applied: [{ student_id: 11, lesson_date: "2026-10-13", attendance: true, score: 4, comment: null, version: 2 }], conflicts: [], summaries: [] });
    });
    await waitFor(() => expect(router.state.location.search).toBe(`?period=${AUGUST}`));
  });

  it("closes with Escape and returns focus to the trigger without changing the period", async () => {
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(periodPicker());
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "Home" });
    fireEvent.keyDown(listbox, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(periodPicker());
    expect(router.state.location.search).toBe("");
  });

  it("closes on an outside press", async () => {
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(periodPicker());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
