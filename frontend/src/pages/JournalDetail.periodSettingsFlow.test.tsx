import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AuthApiError } from "../lib/auth/errors";
import { createDeferred } from "../lib/journals/journalQueueTestSupport";
import { formatSchoolLessonDate } from "../i18n/formatters";
import type { JournalBatchUpdateResponse, JournalExamMaxScoreUpdateResponse } from "../lib/journals/types";
import { OCTOBER, batchUpdateMock, updateExamMaxMock, renderWorkspace, waitForGrid, settingsButton, openSettings, maximumInput, saveButton, typeMaximum, examResponse, gradeAnvar, registerJournalDetailHooks } from "./JournalDetailTestSupport";

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

describe("Period settings: exam maximum", () => {
  beforeEach(() => {
    updateExamMaxMock.mockImplementation(async (_journalId, payload) => examResponse(payload.exam_max_score ?? 100));
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

  it("sends only the bonus maximum when only the bonus maximum is edited", async () => {
    const dialog = await openSettings();
    const bonusInput = within(dialog).getByLabelText("Bonus maximum") as HTMLInputElement;
    expect(bonusInput.value).toBe("20");
    fireEvent.change(bonusInput, { target: { value: "35" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateExamMaxMock).toHaveBeenCalledTimes(1));
    expect(updateExamMaxMock).toHaveBeenCalledWith(OCTOBER, { bonus_max_score: 35 });
  });

  it("rejects a bonus maximum above 100 inline and keeps Save disabled", async () => {
    const dialog = await openSettings();
    fireEvent.change(within(dialog).getByLabelText("Bonus maximum"), { target: { value: "101" } });
    expect(within(dialog).getByText("The bonus maximum must be between 0 and 100.")).toBeDefined();
    expect(saveButton().disabled).toBe(true);
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
});
