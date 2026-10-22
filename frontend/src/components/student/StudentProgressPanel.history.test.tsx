import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { StudentProgressPanel } from "./StudentProgressPanel";
import { CourseDetailStats } from "./CourseDetailStats";
import type { StudentCourseProfile } from "../../lib/users/types";
import type { StudentProgressSeriesState } from "../../lib/students/useStudentProgressSeries";
import { mockProfileResponse } from "../../pages/StudentProfileTestSupport";

const state = vi.hoisted(() => ({ progress: {} as StudentProgressSeriesState }));
vi.mock("../../lib/students/useStudentProgressSeries", () => ({ useStudentProgressSeries: () => state.progress }));
class ProgressFixture {
  static render(): ReturnType<typeof render> { return render(<MemoryRouter><StudentProgressPanel studentId={42} courses={mockProfileResponse.courses} role="student" currentUserId={42} /></MemoryRouter>); }
}
beforeEach(async (): Promise<void> => {
  await i18n.changeLanguage("en");
  state.progress = { series: [], isLoading: false, isError: false, refetch: vi.fn(), history: { items: [], hasMore: false, loadingMore: false, loadMore: vi.fn(), hasUpcoming: false } };
});
afterEach((): void => cleanup());
describe("history presentation and lifetime summaries", (): void => {
  it("shows loading geometry then an explained empty history including future-only copy", (): void => {
    state.progress.isLoading = true;
    const view: ReturnType<typeof render> = ProgressFixture.render();
    expect(screen.getByTestId("progress-chart-skeleton")).toBeTruthy();
    state.progress.isLoading = false;
    view.rerender(<MemoryRouter><StudentProgressPanel studentId={42} courses={mockProfileResponse.courses} role="student" currentUserId={42} /></MemoryRouter>);
    expect(screen.getByText("No history yet")).toBeTruthy();
    expect(screen.queryByText(/All 0 started periods loaded|Showing 0 periods/)).toBeNull();
    expect(screen.getByText(/Results appear when your first period starts/)).toBeTruthy();
    state.progress.history!.hasUpcoming = true;
    view.rerender(<MemoryRouter><StudentProgressPanel studentId={42} courses={mockProfileResponse.courses} role="student" currentUserId={42} /></MemoryRouter>);
    expect(screen.getByText(/Your periods have not started yet/)).toBeTruthy();
  });
  it("hides either completeness message for empty history and shows complete totals for populated history", (): void => {
    state.progress.history!.hasMore = true;
    const view: ReturnType<typeof render> = ProgressFixture.render();
    expect(screen.queryByText(/Showing .* periods|All .* started periods loaded/)).toBeNull();
    state.progress.history!.hasMore = false;
    state.progress.history!.items = [{ journal_id: 1, course_id: 4, course_title: "Own history", period_label: "Week 1", period_start: "2026-01-01", period_end: "2026-01-07", state: "graded", percentage: 0, sum_score: 0, max_period_score: 100, attendance_count: 0, total_lessons: 1 }];
    view.rerender(<MemoryRouter><StudentProgressPanel studentId={42} courses={mockProfileResponse.courses} role="student" currentUserId={42} /></MemoryRouter>);
    expect(screen.getByText("All 1 started periods loaded.")).toBeTruthy();
  });
  it("offers working retry on errors", (): void => {
    state.progress.isError = true;
    ProgressFixture.render();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.progress.refetch).toHaveBeenCalledTimes(1);
  });
  it("exposes partial completeness and loads older history only on click, preserving zero", (): void => {
    state.progress.history!.hasMore = true;
    state.progress.history!.items = [{ journal_id: 1, course_id: 4, course_title: "Own history", period_label: "Week 1", period_start: "2026-01-01", period_end: "2026-01-07", state: "graded", percentage: 0, sum_score: 0, max_period_score: 100, attendance_count: 0, total_lessons: 1 }];
    ProgressFixture.render();
    expect(screen.getByTestId("student-history").textContent).toContain("Showing 1 periods");
    expect(screen.getByTestId("period-total").textContent).toBe("0");
    expect(state.progress.history!.loadMore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(state.progress.history!.loadMore).toHaveBeenCalledTimes(1);
  });
  it("shows each history row as course, short period span and only the period total", (): void => {
    state.progress.history!.items = [
      { journal_id: 1, course_id: 4, course_title: "Algebra", period_label: "Month 3", period_start: "2026-03-01", period_end: "2026-03-31", state: "graded", percentage: 82.5, sum_score: 99, max_period_score: 120, attendance_count: 0, total_lessons: 1 },
      { journal_id: 2, course_id: 4, course_title: "Geometry", period_label: "Month 4", period_start: "2026-04-01", period_end: "2026-04-30", state: "in_progress", percentage: 0, sum_score: 0, max_period_score: 120, attendance_count: 0, total_lessons: 0 },
    ];
    ProgressFixture.render();
    const rows: HTMLElement[] = screen.getAllByRole("listitem").filter((row: HTMLElement) => row.textContent?.includes("Algebra") || row.textContent?.includes("Geometry"));
    const graded: HTMLElement = rows.find((row: HTMLElement) => row.textContent?.includes("Algebra"))!;
    expect(graded.textContent).toContain("99");
    expect(graded.textContent).toContain("Mar 2026");
    expect(graded.textContent).not.toMatch(/Month/);
    expect(graded.textContent).not.toContain("/ 120");
    expect(graded.textContent).not.toContain("%");
    expect(graded.getAttribute("title")).toContain("Month 3");
    const ungraded: HTMLElement = rows.find((row: HTMLElement) => row.textContent?.includes("Geometry"))!;
    expect(ungraded.querySelector("[data-testid='period-total']")).toBeNull();
  });
  it("uses lifetime attendance, absences and score from profile even when older periods are not loaded", (): void => {
    const entry: StudentCourseProfile = { ...mockProfileResponse.courses[0], my_total_score: 900, my_total_max_score: 1000, performance: { ...mockProfileResponse.courses[0].performance!, attendance_denominator: 100, attended_lessons: 80, total_lessons: 100, absences: 20 } };
    render(<CourseDetailStats entry={entry} />);
    const stats: HTMLElement = screen.getByTestId("course-stats");
    expect(stats.textContent).toContain("900");
    expect(stats.textContent).not.toContain("1,000");
    expect(stats.textContent).toContain("80%");
    expect(stats.textContent).toContain("20");
    expect(stats.textContent).toContain("100");
  });
});
