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
    expect(screen.getByText(/Results appear when your first period starts/)).toBeTruthy();
    state.progress.history!.hasUpcoming = true;
    view.rerender(<MemoryRouter><StudentProgressPanel studentId={42} courses={mockProfileResponse.courses} role="student" currentUserId={42} /></MemoryRouter>);
    expect(screen.getByText(/Your periods have not started yet/)).toBeTruthy();
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
    expect(screen.getByTestId("student-history").textContent).toContain("0%");
    expect(state.progress.history!.loadMore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(state.progress.history!.loadMore).toHaveBeenCalledTimes(1);
  });
  it("uses lifetime attendance, absences and score from profile even when older periods are not loaded", (): void => {
    const entry: StudentCourseProfile = { ...mockProfileResponse.courses[0], my_total_score: 900, my_total_max_score: 1000, performance: { ...mockProfileResponse.courses[0].performance!, attendance_denominator: 100, attended_lessons: 80, total_lessons: 100, absences: 20 } };
    render(<CourseDetailStats entry={entry} />);
    const stats: HTMLElement = screen.getByTestId("course-stats");
    expect(stats.textContent).toContain("900/ 1,000");
    expect(stats.textContent).toContain("80%");
    expect(stats.textContent).toContain("20");
    expect(stats.textContent).toContain("100");
  });
});
