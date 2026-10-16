import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { MyCourses } from "./MyCourses";
import { CoursePeriodList } from "../../components/student/CoursePeriodList";
import { StudentPeriodOrdering } from "../../lib/students/StudentPeriodOrdering";
import { PeriodScoreSummary } from "../../components/student/PeriodScoreSummary";
import { OwnLessonNotes } from "../../components/student/OwnLessonNotes";
import type { StudentCourseProfile, StudentJournalPeriod } from "../../lib/users/types";
import type { JournalEmbeddedSummary, JournalEntryResponse } from "../../lib/journals/types";

const profileState = vi.hoisted(() => ({ current: {} as Record<string, unknown>, journals: { data: [], isError: false } as Record<string, unknown> }));

vi.mock("../../lib/users/hooks", () => ({
  useMyStudentProfile: () => profileState.current,
  useMyStudentJournals: () => profileState.journals,
  useMentorProfile: () => ({ data: undefined, isLoading: false }),
}));

function entry(id: number, bucket: "active" | "archive", graded: number, average: number): StudentCourseProfile {
  return {
    course: { id, title: `Course ${id}`, description: "", photo_path: null, start_date: "2026-08-03", end_date: "2026-12-31", exam_type: "monthly", price: "1.00", mentor_id: 9, status: "active", is_deleted: false, created_at: "", updated_at: "" },
    enrollment_status: bucket === "archive" ? "completed" : "active",
    bucket,
    my_avg_percentage: average,
    attendance_percentage: 90,
    absences: 1,
    periods_total: 3,
    periods_graded: graded,
    my_rank: 1,
    class_size: 4,
    class_avg_percentage: 50,
    next_lesson_at: null,
  };
}

function renderCourses(url = "/my/courses") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <MyCourses />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => cleanup());

describe("MyCourses", () => {
  function journals(rows: Array<[number, StudentJournalPeriod["state"], number, number?]>): void {
    profileState.journals = {
      isError: false,
      data: rows.map(([courseId, state, percentage, totalLessons = 3], index) => ({
        journal_id: index + 1, course_id: courseId, course_title: "C", period_label: `P${index}`, period_start: "2026-01-01", period_end: "2026-01-31",
        sum_score: percentage > 0 ? 1 : 0, max_period_score: 70, percentage, attendance_count: totalLessons > 0 ? 1 : 0, total_lessons: totalLessons, state,
      })),
    };
  }

  it("shows real bucket counts, one link per course and a graded zero as a number", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active", 2, 0), entry(2, "active", 0, 0), entry(3, "archive", 1, 80)] } };
    journals([[1, "graded", 0], [1, "graded", 0]]);
    renderCourses();
    expect(screen.getByTestId("bucket-count-active").textContent).toBe("2");
    expect(screen.getByTestId("bucket-count-archive").textContent).toBe("1");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    const scores = screen.getAllByTestId("course-score");
    expect(scores[0].textContent).toBe("0%");
    expect(scores[1].textContent).toBe("Not graded yet");
  });

  it("uses the same definition as the class table: the card averages started periods and ignores upcoming zero rows", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active", 5, 27.8)] } };
    journals([[1, "graded", 47], [1, "graded", 53], [1, "graded", 39], [1, "upcoming", 0], [1, "upcoming", 0]]);
    renderCourses();
    expect(screen.getByTestId("course-score").textContent).toBe("46%");
    expect(screen.queryByText("28%")).toBeNull();
    expect(screen.getByTestId("period-stepper").textContent).toContain("3 of 3 periods");
  });

  it("reads Not graded yet, not 0%, when the only started period has an empty summary", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active", 1, 0)] } };
    journals([[1, "graded", 0, 0], [1, "upcoming", 0]]);
    renderCourses();
    expect(screen.getByTestId("course-score").textContent).toBe("Not graded yet");
  });

  it("shows a loading placeholder then an unavailable dash instead of inventing a score", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active", 1, 90)] } };
    profileState.journals = { data: undefined, isError: false };
    const { unmount } = renderCourses();
    expect(screen.getByTestId("course-score").getAttribute("data-band")).toBe("loading");
    unmount();
    profileState.journals = { data: undefined, isError: true };
    renderCourses();
    expect(screen.getByTestId("course-score").textContent).toBe("—");
  });

  it("uses a compact initials tile without a cover band when there is no image, and a cover only with an image", () => {
    const withImage = entry(2, "active", 1, 10);
    withImage.course.photo_path = "/storage/courses/x.png";
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active", 1, 10), withImage] } };
    journals([[1, "graded", 10], [2, "graded", 10]]);
    renderCourses();
    expect(screen.getAllByTestId("course-initials")).toHaveLength(1);
    expect(screen.getAllByTestId("course-cover")).toHaveLength(1);
  });

  it("keeps each card a single link with no nested interactive control", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active", 1, 90)] } };
    journals([[1, "graded", 90]]);
    renderCourses();
    expect(screen.getByRole("link").querySelectorAll("a, button")).toHaveLength(0);
  });

  it("colors the score by band instead of always one color", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active", 1, 90), entry(2, "active", 1, 60), entry(3, "active", 1, 10)] } };
    journals([[1, "graded", 90], [2, "graded", 60], [3, "graded", 10]]);
    renderCourses();
    expect(screen.getAllByTestId("course-score").map((node) => node.getAttribute("data-band"))).toEqual(["good", "ok", "risk"]);
  });

  it("reads the archive bucket from the URL and lists only archived courses with a status chip", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active", 1, 90), entry(3, "archive", 1, 80)] } };
    renderCourses("/my/courses?bucket=archive");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByTestId("course-status-chip").textContent).toBe("Completed");
    expect(screen.getByRole("tab", { name: /Archive/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("normalizes an unsupported bucket to Active", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active", 1, 90)] } };
    renderCourses("/my/courses?bucket=bogus");
    expect(screen.getByRole("tab", { name: /Active/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("explains an empty archive and returns to Active with one action", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active", 1, 90)] } };
    renderCourses("/my/courses?bucket=archive");
    expect(screen.getByText("Nothing archived yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to active courses" }));
    expect(screen.getByRole("tab", { name: /Active/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows a loading skeleton with dash counts rather than zeros", () => {
    profileState.journals = { data: undefined, isError: false };
    profileState.current = { isLoading: true, isError: false, refetch: vi.fn(), data: undefined };
    renderCourses();
    expect(screen.getByTestId("courses-skeleton")).toBeTruthy();
    expect(screen.getByTestId("bucket-count-active").textContent).toBe("–");
  });

  it("shows an error with a working Retry", () => {
    const refetch = vi.fn();
    profileState.current = { isLoading: false, isError: true, refetch, data: undefined };
    renderCourses();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("explains an empty active list", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [] } };
    renderCourses();
    expect(screen.getByText(/not enrolled in any course/i)).toBeTruthy();
  });
});

function period(id: number, start: string, state: StudentJournalPeriod["state"], percentage = 0): StudentJournalPeriod {
  return { journal_id: id, course_id: 1, course_title: "C", period_label: `P${id}`, period_start: start, period_end: start, sum_score: 0, max_period_score: 0, percentage, attendance_count: 0, total_lessons: 0, state };
}

describe("CoursePeriodList", () => {
  const periods = [period(1, "2026-08-01", "graded", 80), period(2, "2026-09-01", "graded", 30), period(3, "2026-12-01", "upcoming")];

  it("orders available periods latest first and upcoming last", () => {
    expect(StudentPeriodOrdering.order(periods).map((item) => item.journal_id)).toEqual([2, 1, 3]);
  });

  it("links only started periods, marks the latest once and leaves upcoming without a link", () => {
    render(<MemoryRouter><CoursePeriodList periods={periods} /></MemoryRouter>);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/my/journal/2", "/my/journal/1"]);
    expect(screen.getAllByTestId("latest-period-chip")).toHaveLength(1);
    expect(within(screen.getByTestId("period-row-upcoming")).queryByRole("link")).toBeNull();
    expect(screen.getAllByTestId("period-score-chip").map((node) => node.getAttribute("data-band"))).toEqual(["risk", "good"]);
  });
});

const summary: JournalEmbeddedSummary = { id: 1, homework_score: 20, attendance_score: 5, exam_score: 40, bonus_score: 10, sum_score: 75, max_period_score: 70, percentage: 107.14, attendance_count: 5, total_lessons: 5, version: 1 };

describe("PeriodScoreSummary", () => {
  it("leads with points over maximum, keeps a bonus above 100 percent and lists four contributions", () => {
    render(<PeriodScoreSummary summary={summary} rank={2} classSize={5} classAveragePercentage={40} />);
    expect(screen.getByTestId("period-total").textContent).toBe("75");
    expect(screen.getByTestId("period-maximum").textContent).toContain("70");
    expect(screen.getByTestId("period-percentage").textContent).toContain("107");
    expect(["homework", "attendance", "exam", "bonus"].map((key) => screen.getByTestId(`contribution-${key}`).textContent)).toEqual(["20", "5", "40", "10"]);
    expect(screen.getByTestId("period-rank").textContent).toContain("2 of 5");
  });

  it("does not invent a percentage for a nonpositive maximum", () => {
    render(<PeriodScoreSummary summary={{ ...summary, max_period_score: 0 }} rank={undefined} classSize={undefined} classAveragePercentage={undefined} />);
    expect(screen.queryByTestId("period-percentage")).toBeNull();
    expect(screen.queryByTestId("period-maximum")).toBeNull();
    expect(screen.queryByTestId("period-rank")).toBeNull();
  });

  it("says results were not recorded when there is no own summary", () => {
    render(<PeriodScoreSummary summary={null} rank={undefined} classSize={undefined} classAveragePercentage={undefined} />);
    expect(screen.getByTestId("period-summary-empty")).toBeTruthy();
  });
});

function note(date: string, comment: string | null): JournalEntryResponse {
  return { id: 1, lesson_date: date, attendance: true, score: 3, comment, has_comment: comment !== null, version: 1 };
}

describe("OwnLessonNotes", () => {
  it("renders nothing without comments", () => {
    const { container } = render(<OwnLessonNotes entries={[note("2026-10-12", null), note("2026-10-13", "  ")]} />);
    expect(container.innerHTML).toBe("");
  });

  it("collapses a long comment behind an accessible Show comment control", () => {
    render(<OwnLessonNotes entries={[note("2026-10-12", "word ".repeat(60))]} />);
    const toggle = screen.getByRole("button", { name: /Show comment/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Hide comment/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("shows a short comment inline without a toggle", () => {
    render(<OwnLessonNotes entries={[note("2026-10-12", "Well done")]} />);
    expect(screen.getByText("Well done")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
