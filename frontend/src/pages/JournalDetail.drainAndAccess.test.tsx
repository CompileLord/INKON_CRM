import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useAuthStore } from "../store/authStore";
import { AuthApiError } from "../lib/auth/errors";
import { createDeferred } from "../lib/journals/journalQueueTestSupport";
import type { JournalPeriod } from "../lib/courses/types";
import type { JournalBatchUpdateResponse, JournalDetailResponse } from "../lib/journals/types";
import { AUGUST, OCTOBER, PERIODS, buildCourse, buildJournal, getCourseMock, getCourseJournalsMock, getJournalMock, batchUpdateMock, router, renderWorkspace, pickerSummary, choosePeriod, periodSettingsButton, gradeCell, waitForGrid, registerJournalDetailHooks } from "./JournalDetailTestSupport";

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

  it("keeps an archived course read-only for a superadmin too, with the same explanation", async () => {
    getCourseMock.mockResolvedValue(buildCourse({ status: "archived" }));
    renderWorkspace();
    await waitForGrid();
    expect(screen.getByTestId("journal-archived-notice").textContent).toContain("read-only");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
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
