import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { formatSchoolLessonDate } from "../i18n/formatters";
import { COURSE_ID, AUGUST, OCTOBER, PERIODS, getCourseMock, getCourseJournalsMock, getJournalMock, batchUpdateMock, router, renderWorkspace, periodPicker, pickerSummary, optionTextOf, choosePeriod, gradeCell, waitForGrid, registerJournalDetailHooks } from "./JournalDetailTestSupport";
import { schoolToday } from "./JournalDetailTestState";

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

  it("shows the translated label, the dd.MM.yyyy range and the timing in the trigger and in the options", async () => {
    renderWorkspace();
    await waitForGrid();
    const summary: string = pickerSummary();
    expect(summary).toContain("Month 10");
    expect(summary).toContain(`${formatSchoolLessonDate("2026-10-01")} – ${formatSchoolLessonDate("2026-10-31")}`);
    expect(summary).toContain("Current");
    expect(optionTextOf("Month 10")).toContain("Current");
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
    expect(options[0].textContent).not.toMatch(/Current|Latest|Upcoming/);
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
