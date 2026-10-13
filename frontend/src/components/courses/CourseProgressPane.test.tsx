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

describe("CourseProgressPane Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("renders matching geometry skeletons while loading and fires onReady when resolved", () => {
    const onReadySpy = vi.fn();
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    const { rerender } = wrap(<CourseProgressPane courseId={10} onReady={onReadySpy} />);

    expect(screen.getAllByTestId("brand-activity-indicator").length).toBeGreaterThan(0);
    expect(onReadySpy).not.toHaveBeenCalled();

    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: mockStaffData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <CourseProgressPane courseId={10} onReady={onReadySpy} />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(onReadySpy).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Farrukh Saidov").length).toBeGreaterThan(0);
  });

  it("renders error container with working 44px retry button on initial query failure", () => {
    const refetchSpy = vi.fn();
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("500 internal server error"),
      refetch: refetchSpy,
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    wrap(<CourseProgressPane courseId={10} />);

    expect(screen.getByText(i18n.t("courses:progress.loadError"))).toBeDefined();
    const retryBtn = screen.getByRole("button", { name: i18n.t("common:retry") });
    expect(retryBtn.className).toContain("min-h-[44px]");
    expect(retryBtn.className).toContain("min-w-[44px]");

    fireEvent.click(retryBtn);
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it("renders empty state with guidance when no periods are configured", () => {
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: { course_id: 10, periods: [], students: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    const { unmount } = wrap(<CourseProgressPane courseId={10} />);

    expect(screen.getByText(i18n.t("courses:progress.emptyPeriods"))).toBeDefined();
    expect(screen.getByText(i18n.t("courses:progress.emptyPeriodsHelpStaff"))).toBeDefined();
    const journalLink = screen.getByRole("link", { name: i18n.t("courses:openJournal") });
    expect(journalLink.getAttribute("href")).toBe("/journals/10");

    unmount();
    useAuthStore.setState({ role: "student" });
    wrap(<CourseProgressPane courseId={10} />);
    expect(screen.getByText(i18n.t("courses:progress.emptyPeriodsHelp"))).toBeDefined();
    expect(screen.queryByRole("link", { name: i18n.t("courses:openJournal") })).toBeNull();
    useAuthStore.setState({ role: "superadmin" });
  });

  it("renders empty state when periods exist but no students are enrolled", () => {
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: {
        course_id: 10,
        periods: [{ id: 1, period_label: "Week 1", period_start: "2026-09-01", period_end: "2026-09-07" }],
        students: [],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    wrap(<CourseProgressPane courseId={10} />);

    expect(screen.getByText(i18n.t("courses:progress.emptyStudents"))).toBeDefined();
    expect(screen.getByText(i18n.t("courses:progress.emptyStudentsHelp"))).toBeDefined();
  });

  it("renders empty search state with working reset button when search yields no matches", () => {
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: mockStaffData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    wrap(<CourseProgressPane courseId={10} />);

    const searchInput = screen.getByPlaceholderText(i18n.t("courses:progress.searchPlaceholder"));
    fireEvent.change(searchInput, { target: { value: "Nonexistent" } });

    expect(
      screen.getByText(i18n.t("courses:progress.noMatches", { query: "Nonexistent" })),
    ).toBeDefined();

    const resetBtn = screen.getByRole("button", { name: i18n.t("courses:progress.resetSearch") });
    fireEvent.click(resetBtn);

    expect(searchInput.getAttribute("value")).toBe("");
    expect(screen.getAllByText("Farrukh Saidov").length).toBeGreaterThan(0);
  });

  it("renders desktop table with sticky opaque identity column, local overflow region, and tabular numbers", () => {
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: mockStaffData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    wrap(<CourseProgressPane courseId={10} />);

    const region = screen.getByRole("region", {
      name: i18n.t("courses:progress.tableRegionLabel"),
    });
    expect(region).toBeDefined();
    expect(region.getAttribute("tabindex")).toBe("0");

    const identityHeader = screen.getByRole("columnheader", {
      name: i18n.t("courses:progress.student"),
    });
    expect(identityHeader.className).toContain("sticky");
    expect(identityHeader.className).toContain("w-60");
    expect(identityHeader.className).toContain("bg-card");

    const summaryHeader = screen.getByRole("columnheader", {
      name: i18n.t("courses:progress.summary"),
    });
    expect(summaryHeader.className).toContain("min-w-[112px]");

    const summaryCells = screen.getAllByTitle(i18n.t("courses:progress.summaryUnavailable"));
    expect(summaryCells.length).toBe(3);
    summaryCells.forEach((cell) => {
      expect(cell.textContent).toContain("—");
    });
  });

  it("strictly enforces score semantics: stored 0 displays 0%, missing displays dash, >100 unclamped, nonpositive denominator unavailable", () => {
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: mockStaffData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    wrap(<CourseProgressPane courseId={10} />);

    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 / 100").length).toBeGreaterThan(0);

    expect(screen.getAllByText("110%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("110 / 100").length).toBeGreaterThan(0);

    expect(screen.getByText(i18n.t("courses:progress.provenanceNotice"))).toBeDefined();

    expect(screen.getAllByText("50 / 0").length).toBeGreaterThan(0);
  });

  it("renders period selector before search and sort on phone, inputs at 48px, and wraps names", () => {
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: mockStaffData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    wrap(<CourseProgressPane courseId={10} />);

    const searchInput = screen.getByLabelText(i18n.t("courses:progress.searchLabel"));
    expect(searchInput.className).toContain("min-h-[48px]");

    const sortSelect = screen.getByLabelText(i18n.t("courses:progress.sortLabel"));
    expect(sortSelect.className).toContain("min-h-[48px]");

    const phonePeriodSelect = screen.getByLabelText(i18n.t("courses:progress.selectPeriod"));
    expect(phonePeriodSelect.className).toContain("min-h-[48px]");

    const periodContainer = phonePeriodSelect.closest("div");
    const searchContainer = searchInput.closest("div.border-b");
    expect(periodContainer).toBeDefined();
    expect(searchContainer).toBeDefined();

    if (periodContainer && searchContainer) {
      expect(
        periodContainer.compareDocumentPosition(searchContainer) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    const studentLinks = screen.getAllByRole("link", { name: /Farrukh Saidov/ });
    studentLinks.forEach((link) => {
      expect(link.className).not.toContain("truncate");
      expect(link.className).toContain("break-words");
      expect(link.className).toContain("min-h-[44px]");
    });
  });

  it("updates sort order when active language changes", async () => {
    const localeTestData: CourseStaffProgressResponse = {
      course_id: 10,
      periods: [{ id: 1, period_label: "Week 1", period_start: "2026-09-01", period_end: "2026-09-07" }],
      students: [
        {
          student_id: 1,
          first_name: "Ёқуб",
          last_name: "Валиев",
          period_results: [],
          grading_provenance: "unknown",
        },
        {
          student_id: 2,
          first_name: "Алишер",
          last_name: "Самадов",
          period_results: [],
          grading_provenance: "unknown",
        },
      ],
    };

    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: localeTestData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    await i18n.changeLanguage("tg");
    const { rerender } = wrap(<CourseProgressPane courseId={10} sortOption="name_asc" />);

    let rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("Алишер");

    await i18n.changeLanguage("en");
    rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <CourseProgressPane courseId={10} sortOption="name_asc" />
        </MemoryRouter>
      </I18nextProvider>,
    );

    rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("Алишер");
  });

  it("sorts by score placing missing results strictly after graded values with tie-breaking", () => {
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: mockStaffData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    wrap(<CourseProgressPane courseId={10} sortOption="score_desc" selectedPeriodId={2} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("Farrukh Saidov");
    expect(rows[1].textContent).toContain("Anisa Nazarova");
    expect(rows[2].textContent).toContain("Zara Karimova");
  });

  it("records return context when navigating to student profile", () => {
    vi.mocked(courseHooks.useCourseStaffProgress).mockReturnValue({
      data: mockStaffData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof courseHooks.useCourseStaffProgress>);

    wrap(<CourseProgressPane courseId={10} searchQuery="Farrukh" sortOption="name_asc" selectedPeriodId={1} />);

    const studentLinks = screen.getAllByRole("link", { name: /Farrukh Saidov/ });
    expect(studentLinks[0].getAttribute("href")).toBe("/students/101");

    fireEvent.click(studentLinks[0]);

    const saved = returnContext.getSavedCourseDetailContext(10);
    expect(saved).not.toBeNull();
    expect(saved?.tab).toBe("progress");
    expect(saved?.periodId).toBe(1);
    expect(saved?.search).toBe("Farrukh");
    expect(saved?.sort).toBe("name_asc");
  });
});
