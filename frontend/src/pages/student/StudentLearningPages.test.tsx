import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { MyCourses } from "./MyCourses";
import { CoursePeriodList } from "../../components/student/CoursePeriodList";
import { StudentPeriodOrdering } from "../../lib/students/StudentPeriodOrdering";
import { PeriodScoreSummary } from "../../components/student/PeriodScoreSummary";
import { OwnLessonNotes } from "../../components/student/OwnLessonNotes";
import { StudentLessonRecords } from "../../components/student/StudentLessonRecords";
import type { StudentCourseProfile, StudentJournalPeriod } from "../../lib/users/types";
import type { JournalEmbeddedSummary, JournalEntryResponse } from "../../lib/journals/types";

const profileState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../lib/users/hooks", () => ({
  useMyStudentProfile: () => profileState.current,
  useMentorProfile: () => ({ data: undefined, isLoading: false }),
}));

function entry(id: number, bucket: "active" | "archive", score = 92, maximum = 130): StudentCourseProfile {
  return {
    course: { id, title: `Course ${id}`, description: "", photo_path: null, start_date: "2026-08-03", end_date: "2026-12-31", exam_type: "monthly", price: "1.00", mentor_id: 9, status: "active", is_deleted: false, created_at: "", updated_at: "" },
    enrollment_status: bucket === "archive" ? "completed" : "active",
    bucket,
    my_avg_percentage: 70,
    my_total_score: score,
    my_total_max_score: maximum,
    attendance_percentage: 90,
    absences: 1,
    periods_total: 3,
    periods_graded: 2,
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
  it("shows real counts in the tabs and one row link per course", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active"), entry(2, "active"), entry(3, "archive")] } };
    renderCourses();
    expect(screen.getByRole("tab", { name: /Active/ }).textContent).toContain("2");
    expect(screen.getByRole("tab", { name: /Archive/ }).textContent).toContain("1");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("leads each row with the score over its maximum and keeps a recorded zero as a number", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active", 92, 130), entry(2, "active", 0, 600)] } };
    renderCourses();
    const scores = screen.getAllByTestId("course-score");
    expect(scores[0].textContent).toBe("92/ 130");
    expect(scores[1].textContent).toBe("0/ 600");
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("shows a dash when the backend has no score for a course", () => {
    const unscored = entry(1, "active");
    unscored.my_total_score = undefined;
    unscored.my_total_max_score = undefined;
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [unscored] } };
    renderCourses();
    expect(screen.getByTestId("course-score").textContent).toBe("—");
  });

  it("uses an initial tile without a photo and the photo when there is one", () => {
    const withImage = entry(2, "active");
    withImage.course.photo_path = "/storage/courses/x.png";
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active"), withImage] } };
    const { container } = renderCourses();
    expect(container.querySelectorAll("[data-initial-tile]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-course-photo]")).toHaveLength(1);
  });

  it("keeps each row a single link and builds the page from the shared primitives", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active")] } };
    const { container } = renderCourses();
    expect(screen.getByRole("link").querySelectorAll("a, button")).toHaveLength(0);
    expect(container.querySelectorAll("[data-page-container]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-page-header]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-list-row]")).toHaveLength(1);
    expect(container.querySelectorAll("[role='tablist']")).toHaveLength(1);
  });

  it("reads the archive tab from the URL and lists only archived courses with their status", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active"), entry(3, "archive")] } };
    renderCourses("/my/courses?tab=archive");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByTestId("course-status-chip").textContent).toContain("Completed");
    expect(screen.getByRole("tab", { name: /Archive/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("normalizes an unsupported tab to Active", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active")] } };
    renderCourses("/my/courses?tab=bogus");
    expect(screen.getByRole("tab", { name: /Active/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("explains an empty archive and returns to Active with one action", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [entry(1, "active")] } };
    renderCourses("/my/courses?tab=archive");
    expect(screen.getByText("Nothing archived yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to active courses" }));
    expect(screen.getByRole("tab", { name: /Active/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows a loading skeleton without invented counts", () => {
    profileState.current = { isLoading: true, isError: false, refetch: vi.fn(), data: undefined };
    renderCourses();
    expect(screen.getByTestId("courses-skeleton")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Active" })).toBeTruthy();
  });

  it("shows an error with a working Retry", () => {
    const refetch = vi.fn();
    profileState.current = { isLoading: false, isError: true, refetch, data: undefined };
    renderCourses();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the loaded list and offers a retry when a refresh fails", () => {
    const refetch = vi.fn();
    profileState.current = { isLoading: false, isError: true, refetch, data: { courses: [entry(1, "active")] } };
    renderCourses();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("explains an empty active list", () => {
    profileState.current = { isLoading: false, isError: false, refetch: vi.fn(), data: { courses: [] } };
    renderCourses();
    expect(screen.getByText(/not enrolled in any course/i)).toBeTruthy();
  });
});

function period(id: number, start: string, state: StudentJournalPeriod["state"], score = 0, maximum = 0, label = `Week ${id}`): StudentJournalPeriod {
  return { journal_id: id, course_id: 1, course_title: "C", period_label: label, period_start: start, period_end: start, sum_score: score, max_period_score: maximum, percentage: 0, attendance_count: 0, total_lessons: 0, state };
}

describe("CoursePeriodList", () => {
  const periods = [period(1, "2026-08-01", "graded", 80, 100), period(2, "2026-09-01", "graded", 30, 117), period(3, "2026-12-01", "upcoming")];

  it("orders available periods latest first and upcoming last", () => {
    expect(StudentPeriodOrdering.order(periods).map((item) => item.journal_id)).toEqual([2, 1, 3]);
  });

  it("links only started periods and leaves upcoming without a link", () => {
    render(<MemoryRouter><CoursePeriodList periods={periods} /></MemoryRouter>);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/my/journal/2", "/my/journal/1"]);
    expect(within(screen.getByTestId("period-row-upcoming")).queryByRole("link")).toBeNull();
    expect(screen.getByText("Upcoming")).toBeTruthy();
  });

  it("leads with the score over the maximum and shows no percentage chip", () => {
    render(<MemoryRouter><CoursePeriodList periods={periods} /></MemoryRouter>);
    expect(screen.getAllByTestId("period-score").map((node) => node.textContent)).toEqual(["30/ 117", "80/ 100"]);
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("translates period names", async () => {
    await i18n.changeLanguage("ru");
    render(<MemoryRouter><CoursePeriodList periods={[period(1, "2026-08-01", "graded", 1, 2, "Week 4"), period(2, "2026-09-01", "graded", 1, 2, "Month 2")]} /></MemoryRouter>);
    expect(screen.getByText("Неделя 4")).toBeTruthy();
    expect(screen.getByText("Месяц 2")).toBeTruthy();
    expect(screen.queryByText("Week 4")).toBeNull();
  });
});

const summary: JournalEmbeddedSummary = { id: 1, homework_score: 20, attendance_score: 5, exam_score: 40, bonus_score: 10, sum_score: 75, max_period_score: 117, percentage: 64.1, attendance_count: 5, total_lessons: 5, version: 1 };

describe("PeriodScoreSummary", () => {
  it("leads with points over the maximum, keeps the percentage muted and lists four contributions", () => {
    render(<PeriodScoreSummary summary={summary} />);
    expect(screen.getByTestId("period-total").textContent).toContain("75/ 117");
    const percentage = screen.getByTestId("period-total").querySelector("[data-score-percentage]") as HTMLElement;
    expect(percentage.textContent).toBe("64.1%");
    expect(percentage.className).toContain("text-muted");
    expect(["homework", "attendance", "exam", "bonus"].map((key) => screen.getByTestId(`contribution-${key}`).textContent)).toEqual(["20", "5", "40", "10"]);
  });

  it("never shows a ranking or class comparison", () => {
    render(<PeriodScoreSummary summary={summary} />);
    expect(screen.queryByTestId("period-rank")).toBeNull();
    expect(screen.queryByText(/rank|of 5/i)).toBeNull();
  });

  it("does not invent a percentage or maximum for a nonpositive maximum", () => {
    render(<PeriodScoreSummary summary={{ ...summary, max_period_score: 0 }} />);
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.getByTestId("period-total").textContent).toBe("75");
  });

  it("says results were not recorded when there is no own summary", () => {
    render(<PeriodScoreSummary summary={null} />);
    expect(screen.getByTestId("period-summary-empty")).toBeTruthy();
  });
});

function note(date: string, comment: string | null, attendance = true, score = 3): JournalEntryResponse {
  return { id: 1, lesson_date: date, attendance, score, comment, has_comment: comment !== null, version: 1 };
}

describe("StudentLessonRecords", () => {
  it("lists only own lessons with attendance and the score over the lesson maximum", () => {
    render(<StudentLessonRecords lessonDates={["2026-10-12", "2026-10-14", "2026-10-16"]} entries={[note("2026-10-12", null, true, 4), note("2026-10-14", null, false, 0)]} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("12.10.2026");
    expect(within(rows[0]).getByText("Present")).toBeTruthy();
    expect(within(rows[0]).getByTestId("lesson-score").textContent).toBe("4 / 5");
    expect(within(rows[1]).getByText("Absent")).toBeTruthy();
    expect(within(rows[1]).queryByTestId("lesson-score")).toBeNull();
    expect(within(rows[2]).getByText("Not recorded")).toBeTruthy();
  });

  it("explains a period without lessons", () => {
    render(<StudentLessonRecords lessonDates={[]} entries={[]} />);
    expect(screen.getByText("No lessons in this period")).toBeTruthy();
  });
});

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
    expect(screen.queryByRole("button", { name: /comment/i })).toBeNull();
  });
});
