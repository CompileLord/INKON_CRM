import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { CourseProgressPane } from "./CourseProgressPane";
import * as courseHooks from "../../lib/courses/hooks";
import * as returnContext from "../../lib/courses/returnContext";
import type { CourseStaffProgressResponse } from "../../lib/courses/types";
import { useAuthStore } from "../../store/authStore";

vi.mock("../../lib/courses/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/courses/hooks")>();
  return {
    ...actual,
    useCourseStaffProgress: vi.fn(),
  };
});

function wrap(ui: React.ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nextProvider>,
  );
}

const mockStaffData: CourseStaffProgressResponse = {
  course_id: 10,
  periods: [
    {
      id: 1,
      period_label: "Week 1",
      period_start: "2026-09-01",
      period_end: "2026-09-07",
    },
    {
      id: 2,
      period_label: "Week 2",
      period_start: "2026-09-08",
      period_end: "2026-09-14",
    },
  ],
  students: [
    {
      student_id: 101,
      first_name: "Farrukh",
      last_name: "Saidov",
      period_results: [
        { period_id: 1, grading_state: "unknown", score: 80, max_score: 100, percentage: 80 },
        { period_id: 2, grading_state: "unknown", score: 95, max_score: 100, percentage: 95 },
      ],
      grading_provenance: "unknown",
    },
    {
      student_id: 102,
      first_name: "Anisa",
      last_name: "Nazarova",
      period_results: [
        { period_id: 1, grading_state: "unknown", score: 0, max_score: 100, percentage: 0 },
        { period_id: 2, grading_state: "missing", score: null, max_score: null, percentage: null },
      ],
      grading_provenance: "unknown",
    },
    {
      student_id: 103,
      first_name: "Zara",
      last_name: "Karimova",
      period_results: [
        { period_id: 1, grading_state: "unknown", score: 110, max_score: 100, percentage: 110 },
        { period_id: 2, grading_state: "unknown", score: 50, max_score: 0, percentage: null },
      ],
      grading_provenance: "unknown",
    },
  ],
};

function mockProgress(overrides: Record<string, unknown>) {
  vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
    data: mockStaffData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);
}

function studentNames(): string[] {
  return Array.from(document.querySelectorAll("table tbody tr")).map((row) => row.querySelector("a")?.textContent ?? "");
}

describe("CourseProgressPane Component", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    useAuthStore.setState({ role: "superadmin", userId: 1 });
    mockProgress({});
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("renders a row skeleton while loading and fires onReady only when resolved", () => {
    const onReadySpy = vi.fn();
    mockProgress({ data: undefined, isLoading: true });
    const { rerender } = wrap(<CourseProgressPane courseId={10} onReady={onReadySpy} />);
    expect(document.querySelector("[data-progress-state='loading']")?.getAttribute("aria-busy")).toBe("true");
    expect(onReadySpy).not.toHaveBeenCalled();

    mockProgress({});
    rerender(<I18nextProvider i18n={i18n}><MemoryRouter><CourseProgressPane courseId={10} onReady={onReadySpy} /></MemoryRouter></I18nextProvider>);
    expect(onReadySpy).toHaveBeenCalled();
    expect(document.querySelector("[data-progress-state='loading']")).toBeNull();
  });

  it("shows an error state with a working retry on the initial failure", () => {
    const refetch = vi.fn();
    mockProgress({ data: undefined, isError: true, refetch });
    wrap(<CourseProgressPane courseId={10} />);
    expect(screen.getByText("Couldn't load the results")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the loaded table and shows a retry banner when a refetch fails", () => {
    const refetch = vi.fn();
    mockProgress({ isError: true, refetch });
    wrap(<CourseProgressPane courseId={10} />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load the results");
    expect(screen.getAllByText("Farrukh Saidov").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("explains an empty period list and links staff to the journal", () => {
    mockProgress({ data: { course_id: 10, periods: [], students: [] } });
    wrap(<CourseProgressPane courseId={10} />);
    expect(screen.getByText("No journal periods yet")).toBeDefined();
    expect(screen.getByText("Set up periods in the journal to track results.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Open journal" }).getAttribute("href")).toContain("/journals/10");
  });

  it("explains an empty period list to a student without a journal link", () => {
    useAuthStore.setState({ role: "student", userId: 5 });
    mockProgress({ data: { course_id: 10, periods: [], students: [] } });
    wrap(<CourseProgressPane courseId={10} />);
    expect(screen.getByText("Results appear here once lessons are graded.")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Open journal" })).toBeNull();
  });

  it("explains an empty cohort when periods exist but nobody is enrolled", () => {
    mockProgress({ data: { ...mockStaffData, students: [] } });
    wrap(<CourseProgressPane courseId={10} />);
    expect(screen.getByText("No students in this course yet")).toBeDefined();
  });

  it("shows scores first as score over maximum with a muted percentage and no summary column", () => {
    wrap(<CourseProgressPane courseId={10} />);
    const headers = Array.from(document.querySelectorAll("table thead th")).map((header) => header.textContent);
    expect(headers).toEqual(["Student", "Week 1", "Week 2"]);
    const firstRow = Array.from(document.querySelectorAll("table tbody tr")).find((row) => row.textContent?.includes("Farrukh")) as HTMLElement;
    const cells = Array.from(firstRow.querySelectorAll("td")).map((cell) => cell.textContent);
    expect(cells[1]).toBe("80 / 10080%");
    expect(cells[2]).toBe("95 / 10095%");
    expect(firstRow.querySelector("td:nth-child(2) .text-muted")?.textContent).toBe("80%");
    expect(document.body.textContent).not.toContain("Summary");
  });

  it("keeps a stored zero as 0 / 100, a missing result as a dash and hides percentages above 100 or without a maximum", () => {
    wrap(<CourseProgressPane courseId={10} />);
    const rowFor = (name: string) => Array.from(document.querySelectorAll("table tbody tr")).find((row) => row.textContent?.includes(name)) as HTMLElement;
    const anisa = Array.from(rowFor("Anisa").querySelectorAll("td")).map((cell) => cell.textContent);
    expect(anisa[1]).toBe("0 / 1000%");
    expect(anisa[2]).toBe("—");
    const zara = Array.from(rowFor("Zara").querySelectorAll("td")).map((cell) => cell.textContent);
    expect(zara[1]).toBe("110 / 100");
    expect(zara[2]).toBe("—");
    expect(document.body.textContent).not.toMatch(/1[1-9]\d%/);
  });

  it("translates the period names in Russian and Tajik", async () => {
    await i18n.changeLanguage("ru");
    const { unmount } = wrap(<CourseProgressPane courseId={10} />);
    expect(Array.from(document.querySelectorAll("table thead th")).map((header) => header.textContent)).toEqual(["Студент", "Неделя 1", "Неделя 2"]);
    unmount();
    await i18n.changeLanguage("tg");
    wrap(<CourseProgressPane courseId={10} />);
    expect(Array.from(document.querySelectorAll("table thead th")).map((header) => header.textContent)).toEqual(["Донишҷӯ", "Ҳафтаи 1", "Ҳафтаи 2"]);
  });

  it("sorts by the selected period with the highest score first and stable ties", () => {
    wrap(<CourseProgressPane courseId={10} />);
    expect(studentNames()).toEqual(["Farrukh Saidov", "Anisa Nazarova", "Zara Karimova"]);
  });

  it("filters by name and offers a working reset when nothing matches", () => {
    const onSearch = vi.fn();
    wrap(<CourseProgressPane courseId={10} searchQuery="zzz" onSearchQueryChange={onSearch} />);
    expect(screen.getByText("No students match “zzz”")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("shows the filtered count and filters case-insensitively", () => {
    wrap(<CourseProgressPane courseId={10} searchQuery="FARR" />);
    expect(screen.getByText("1 of 3 students")).toBeDefined();
    expect(studentNames()).toEqual(["Farrukh Saidov"]);
  });

  it("uses the shared pickers instead of native selects", () => {
    wrap(<CourseProgressPane courseId={10} />);
    expect(document.querySelector("select")).toBeNull();
    expect(screen.getByRole("button", { name: "Period" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Order" })).toBeDefined();
    expect(screen.getByRole("searchbox")).toBeDefined();
  });

  it("records the return context and links each student to the profile", () => {
    const recordSpy = vi.spyOn(returnContext, "recordCourseDetailNavigation");
    wrap(<CourseProgressPane courseId={10} />);
    const link = screen.getAllByRole("link", { name: "Farrukh Saidov" })[0];
    expect(link.getAttribute("href")).toBe("/students/101");
    fireEvent.click(link);
    expect(recordSpy).toHaveBeenCalledWith(10, expect.objectContaining({ tab: "progress", periodId: 2 }));
  });

  it("reports a period choice to the page and renders the phone list for that period", () => {
    const onPeriod = vi.fn();
    wrap(<CourseProgressPane courseId={10} selectedPeriodId={1} onSelectedPeriodIdChange={onPeriod} />);
    const phoneList = document.querySelector("ul") as HTMLElement;
    expect(phoneList.textContent).toContain("80 / 100");
    fireEvent.click(screen.getByRole("button", { name: "Period" }));
    fireEvent.click(screen.getByRole("option", { name: "Week 2" }));
    expect(onPeriod).toHaveBeenCalledWith(2);
  });
});
