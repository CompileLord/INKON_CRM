import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import { useAuthStore } from "../store/authStore";
import { AuthApiError } from "../lib/auth/errors";
import { createDeferred } from "../lib/journals/journalQueueTestSupport";
import type { JournalExamMaxScoreUpdateResponse } from "../lib/journals/types";
import { OCTOBER, buildCourse, buildJournal, getCourseMock, getStaffProgressMock, getJournalMock, batchUpdateMock, updateExamMaxMock, renderWorkspace, waitForGrid, settingsButton, openSettings, maximumInput, saveButton, typeMaximum, examResponse, registerJournalDetailHooks } from "./JournalDetailTestSupport";

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
