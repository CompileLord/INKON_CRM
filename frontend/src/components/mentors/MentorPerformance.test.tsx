import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { MentorPerformance } from "./MentorPerformance";
import type { MentorAnalyticsResponse, MentorProfileResponse } from "../../lib/users/types";

const mockProfile: MentorProfileResponse = {
  user: {
    id: 1,
    role: "mentor",
    first_name: "Gulnora",
    last_name: "Saidova",
    email: "mentor@test.com",
    phone: "+992900000001",
    date_of_birth: null,
    parent_phone: null,
    photo_path: null,
    thumbnail_path: null,
    payment_day_of_month: null,
    must_set_password: false,
    is_deleted: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  active_courses: [],
  active_students_count: 8,
  avg_score: 61,
  active_students_population: "active_enrollments_on_assigned_courses_including_soft_deleted_courses",
  avg_score_grading_state: "unknown",
  avg_score_provenance: "unknown",
  avg_score_basis: "all_summaries_on_courses_currently_assigned_including_soft_deleted_and_archived",
  avg_score_summary_count: 24,
  avg_score_defined_ratio_count: 24,
  avg_score_undefined_ratio_count: 0,
  avg_score_defined_ratios_mean: 61,
};

const mockAnalytics: MentorAnalyticsResponse = {
  active_courses_count: 2,
  active_courses_population: "active_non_deleted_courses",
  total_students_count: 8,
  total_students_population: "non_deleted_enrollments_on_assigned_courses_all_statuses_including_soft_deleted_courses",
  average_student_score: 62.1,
  average_student_score_summary_count: 24,
  average_student_score_grading_state: "unknown",
  average_student_score_provenance: "unknown",
  average_student_score_basis: "all_summaries_on_non_deleted_courses_including_archived_raw_points",
};

describe("MentorPerformance", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru");
  });

  afterEach(cleanup);

  it("renders compact performance tab with progress bar and tooltips, without sentences under numbers", async () => {
    const user = userEvent.setup();
    render(
      <MentorPerformance
        profile={mockProfile}
        analytics={mockAnalytics}
        loading={false}
        failed={false}
        onRetry={vi.fn()}
      />
    );

    const title: HTMLElement = screen.getByRole("heading", { level: 2 });
    expect(title.textContent).toContain("Успеваемость");

    const pointsValue: HTMLElement = screen.getByText("62,1");
    expect(pointsValue).toBeDefined();

    expect(screen.queryByText(/Все, кто записан на курсы/)).toBeNull();
    expect(screen.queryByText(/^Студентов$/)).toBeNull();

    const progressbar: HTMLElement = screen.getByRole("progressbar");
    expect(progressbar.getAttribute("aria-valuenow")).toBe("61");
    expect(progressbar.getAttribute("aria-valuemin")).toBe("0");
    expect(progressbar.getAttribute("aria-valuemax")).toBe("100");

    const tooltipButtons: HTMLElement[] = screen.getAllByRole("button", { name: /Сколько баллов|Доля от максимума/ });
    expect(tooltipButtons.length).toBeGreaterThanOrEqual(1);

    await user.click(tooltipButtons[0]);
    const tooltipContent: HTMLElement = await screen.findByRole("tooltip");
    expect(tooltipContent.textContent).toContain("Считано по 24 оценённым периодам.");
  });

  it("renders loading skeleton when loading", () => {
    const { container } = render(
      <MentorPerformance
        profile={mockProfile}
        analytics={undefined}
        loading={true}
        failed={false}
        onRetry={vi.fn()}
      />
    );

    const status: HTMLElement | null = container.querySelector("[role='status']");
    expect(status?.getAttribute("aria-busy")).toBe("true");
  });

  it("renders error state with retry on failure", async () => {
    const onRetry = vi.fn();
    render(
      <MentorPerformance
        profile={mockProfile}
        analytics={undefined}
        loading={false}
        failed={true}
        onRetry={onRetry}
      />
    );

    const retryButton: HTMLElement = screen.getByRole("button", { name: "Повторить" });
    await userEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
