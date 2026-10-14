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
import type { CourseResponse, JournalPeriod } from "../lib/courses/types";
import type { JournalBatchUpdateResponse, JournalDetailResponse } from "../lib/journals/types";

vi.hoisted(() =>
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  }),
);

const schoolToday = vi.hoisted(() => ({ value: "2026-10-15" }));

vi.mock("../i18n/formatters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/formatters")>();
  return { ...actual, getSchoolCalendarDate: () => schoolToday.value };
});

vi.mock("../lib/courses/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/courses/endpoints")>();
  return { ...actual, getCourse: vi.fn(), getCourseJournals: vi.fn(), getCourseProgressChart: vi.fn() };
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

const getCourseMock = vi.mocked(courseEndpoints.getCourse);
const getCourseJournalsMock = vi.mocked(courseEndpoints.getCourseJournals);
const getProgressChartMock = vi.mocked(courseEndpoints.getCourseProgressChart);
const getJournalMock = vi.mocked(journalEndpoints.getJournal);
const batchUpdateMock = vi.mocked(journalEndpoints.batchUpdateJournalEntries);
const getMentorProfileMock = vi.mocked(userEndpoints.getMentorProfile);
const listEnrollmentsMock = vi.mocked(enrollmentEndpoints.listEnrollments);

let router: ReturnType<typeof createMemoryRouter>;

function renderWorkspace(entries: string[] = [`/journals/${COURSE_ID}`], index: number = entries.length - 1) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  router = createMemoryRouter(
    [
      { path: "/journals", element: <div>hub page</div> },
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
  await i18n.changeLanguage("en");
  useAuthStore.setState({ role: "superadmin" });
  getCourseMock.mockResolvedValue(buildCourse());
  getCourseJournalsMock.mockResolvedValue(PERIODS);
  getProgressChartMock.mockResolvedValue({ labels: ["Month 8"], periods: [], datasets: [] });
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
    expect(await screen.findByRole("list", { name: /Student totals/ })).toBeDefined();
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
    expect(getProgressChartMock).toHaveBeenCalled();
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
    expect(await screen.findByText("Edit Exam Weight Limit")).toBeDefined();
  });

  it("shows the existing progress chart as the Progress tab content until the new Progress view ships", async () => {
    getProgressChartMock.mockResolvedValue({
      labels: ["Month 8", "Month 9"],
      periods: [],
      datasets: [{ student_id: 11, name: "Anvar Tester", color_hex: "#000000", scores: [50, 60, 55] }],
    });
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(screen.getByRole("tab", { name: "Progress" }));
    expect(await screen.findByText("Score progress")).toBeDefined();
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

  it("restores the Progress tab from the URL and reports an empty chart honestly", async () => {
    renderWorkspace([`/journals/${COURSE_ID}?tab=progress`]);
    expect(await screen.findByText("No chart data yet")).toBeDefined();
    expect(screen.getByRole("tab", { name: "Progress" }).getAttribute("aria-selected")).toBe("true");
  });

  it("restores the Summary view from the URL and lists totals with an honest unavailable state", async () => {
    const detail = buildJournal(OCTOBER);
    detail.students[1] = { ...detail.students[1], summary: null };
    getJournalMock.mockResolvedValue(detail);
    renderWorkspace([`/journals/${COURSE_ID}?view=summary`]);
    const list = await screen.findByRole("list", { name: /Student totals/ });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Unavailable")).toBeDefined();
    expect(screen.queryByRole("region", { name: /Gradebook grid/ })).toBeNull();
  });
});
