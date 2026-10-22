import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useAuthStore } from "../store/authStore";
import { AuthApiError } from "../lib/auth/errors";
import { createDeferred } from "../lib/journals/journalQueueTestSupport";
import { formatSchoolLessonDate } from "../i18n/formatters";
import type { CourseStaffProgressResponse } from "../lib/courses/types";
import type { JournalBatchUpdateResponse, JournalDetailResponse } from "../lib/journals/types";
import { COURSE_ID, AUGUST, OCTOBER, buildCourse, buildJournal, staffResult, buildStaffProgress, getCourseMock, getStaffProgressMock, getJournalMock, batchUpdateMock, updateSummaryMock, updateExamMaxMock, router, renderWorkspace, periodPicker, pickerSummary, choosePeriod, periodSettingsButton, gradeCell, waitForGrid, registerJournalDetailHooks } from "./JournalDetailTestSupport";

vi.mock("../i18n/formatters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/formatters")>();
  const state = await import("./JournalDetailTestState");
  return { ...actual, getSchoolCalendarDate: () => state.schoolToday.value };
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

registerJournalDetailHooks();

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
    expect(within(toolbar).getByRole("button", { name: "Period" })).toBeDefined();
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

  it("shows Exam and Bonus as the last editable columns before Total, and saves an exam edit through the summary endpoint", async () => {
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
    expect(names.slice(-3)).toEqual(["Exam", "Bonus", "Total / 100"]);
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

describe("period select keyboard and focus", () => {
  it("opens on click, moves focus with the arrows, Home and End and marks the selected option", async () => {
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(periodPicker());
    const listbox = screen.getByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
    options[2].focus();
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(listbox, { key: "Home" });
    expect(document.activeElement).toBe(options[0]);
    fireEvent.keyDown(listbox, { key: "End" });
    expect(document.activeElement).toBe(options[2]);
  });

  it("selects through the drain: waits for the slow save, then switches", async () => {
    const slow = createDeferred<JournalBatchUpdateResponse>();
    batchUpdateMock.mockReturnValueOnce(slow.promise);
    renderWorkspace();
    await waitForGrid();
    const cell = gradeCell("Anvar", "2026-10-13");
    cell.focus();
    fireEvent.keyDown(cell, { key: "4" });
    choosePeriod(AUGUST);
    await screen.findByText("Saving your changes before you leave…");
    expect(router.state.location.search).toBe("");
    await act(async () => {
      slow.resolve({ applied: [{ student_id: 11, lesson_date: "2026-10-13", attendance: true, score: 4, comment: null, version: 2 }], conflicts: [], summaries: [] });
    });
    await waitFor(() => expect(router.state.location.search).toBe(`?period=${AUGUST}`));
  });

  it("closes with Escape without changing the period", async () => {
    renderWorkspace();
    await waitForGrid();
    fireEvent.click(periodPicker());
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "Home" });
    fireEvent.keyDown(listbox, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(router.state.location.search).toBe("");
  });

  it("choosing the already selected period keeps the route unchanged", async () => {
    renderWorkspace();
    await waitForGrid();
    choosePeriod(OCTOBER);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(router.state.location.search).toBe("");
  });
});
