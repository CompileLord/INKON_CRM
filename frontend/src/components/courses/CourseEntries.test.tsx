import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { CourseCard } from "./CourseCard";
import { CourseListRow } from "./CourseListRow";
import type { CourseMenuHandlers } from "./useCourseMenu";
import type { CourseListItemResponse } from "../../lib/courses/types";

const baseCourse: CourseListItemResponse = {
  id: 7,
  title: "Algebra 8A",
  description: "",
  photo_path: null,
  start_date: "2026-09-01",
  end_date: "2026-12-31",
  exam_type: "weekly",
  price: "700.00",
  mentor_id: 3,
  status: "active",
  is_deleted: false,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  schedules: [
    { id: 1, course_id: 7, day_of_week: 0, time_start: "14:00:00", time_end: "15:30:00" },
    { id: 2, course_id: 7, day_of_week: 2, time_start: "14:00:00", time_end: "15:30:00" },
  ],
  active_student_count: 12,
};

const mentor = { id: 3, first_name: "Sitora", last_name: "Alieva" } as never;

function handlers(): CourseMenuHandlers {
  return { onEdit: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() };
}

describe("course entries on shared primitives", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });
  afterEach(cleanup);

  it("shows an initial tile and no placeholder banner for a course without a photo", () => {
    const { container } = render(
      <MemoryRouter>
        <CourseCard course={baseCourse} mentor={mentor} isMentor={false} menuHandlers={null} />
      </MemoryRouter>,
    );
    const tile: HTMLElement | null = container.querySelector("[data-initial-tile]");
    expect(tile?.textContent).toBe("A");
    expect(container.querySelector("svg.lucide-book-open")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the lesson days and time compactly with price, students and mentor", () => {
    render(
      <MemoryRouter>
        <CourseCard course={baseCourse} mentor={mentor} isMentor={false} menuHandlers={null} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Mon, Wed · 14:00–15:30")).toBeTruthy();
    expect(screen.getByText("12 students")).toBeTruthy();
    expect(screen.getByText("Sitora Alieva")).toBeTruthy();
    expect(screen.getByText("700 TJS / mo")).toBeTruthy();
  });

  it("marks active courses with emerald status badge and archived courses with archived badge", () => {
    const { rerender, container } = render(
      <MemoryRouter>
        <CourseCard course={baseCourse} isMentor={false} menuHandlers={null} />
      </MemoryRouter>,
    );
    expect(container.querySelector("[data-badge-status='active']")).not.toBeNull();
    rerender(
      <MemoryRouter>
        <CourseCard course={{ ...baseCourse, status: "archived" }} isMentor={false} menuHandlers={null} />
      </MemoryRouter>,
    );
    expect(container.querySelector("[data-badge-status='archived']")).not.toBeNull();
  });

  it("makes the whole card a link and puts admin actions in one menu", async () => {
    const adminHandlers: CourseMenuHandlers = handlers();
    render(
      <MemoryRouter>
        <CourseCard course={baseCourse} isMentor={false} menuHandlers={adminHandlers} />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Algebra 8A" });
    expect(link.getAttribute("href")).toBe("/courses/7");
    expect(link.className).toContain("after:absolute");
    fireEvent.click(screen.getByRole("button", { name: /Course actions: Algebra 8A/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    expect(adminHandlers.onDuplicate).toHaveBeenCalledTimes(1);
    expect((adminHandlers.onDuplicate as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBeInstanceOf(HTMLElement);
  });

  it("renders the list row as one link without wrapping columns into the next row", () => {
    const { container } = render(
      <MemoryRouter>
        <CourseListRow course={baseCourse} mentor={mentor} showMentor isMentor={false} menuHandlers={handlers()} />
      </MemoryRouter>,
    );
    const grid: HTMLElement | null = container.querySelector("a > span.grid");
    expect(grid?.className).toContain("md:grid-cols-[");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.textContent).toContain("Sitora Alieva");
    expect(container.textContent).toContain("700 TJS / mo");
  });

  it("gives mentors the journal action in the row menu", async () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <CourseListRow course={baseCourse} showMentor={false} isMentor menuHandlers={null} onNavigate={onNavigate} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Course actions/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Go to journal" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
