import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { CourseCard } from "./CourseCard";
import { CourseListRow } from "./CourseListRow";
import { courseLifecycleStatus } from "./courseLifecycleStatus";
import type { CourseListItemResponse } from "../../lib/courses/types";

const runningCourse: CourseListItemResponse = {
  id: 7,
  title: "Algebra 8A",
  description: "",
  photo_path: null,
  start_date: "2026-09-01",
  end_date: "2999-12-31",
  exam_type: "weekly",
  price: "700.00",
  mentor_id: 3,
  status: "active",
  is_deleted: false,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  schedules: [],
  active_student_count: 12,
};
const endedCourse: CourseListItemResponse = { ...runningCourse, end_date: "2025-06-01" };

describe("course lifecycle status", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });
  afterEach(cleanup);

  it("derives ended only when active and the end date is before today", () => {
    const now: Date = new Date(2026, 9, 28);
    expect(courseLifecycleStatus({ status: "active", end_date: "2026-10-27" }, now)).toBe("completed");
    expect(courseLifecycleStatus({ status: "active", end_date: "2026-10-28" }, now)).toBe("active");
    expect(courseLifecycleStatus({ status: "archived", end_date: "2020-01-01" }, now)).toBe("archived");
  });

  it("shows a completed badge on an ended card and none on a running one, without the exam type", () => {
    const { rerender } = render(<MemoryRouter><CourseCard course={endedCourse} isMentor={false} menuHandlers={null} /></MemoryRouter>);
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.queryByText(/exams/i)).toBeNull();
    rerender(<MemoryRouter><CourseCard course={runningCourse} isMentor={false} menuHandlers={null} /></MemoryRouter>);
    expect(screen.queryByText("Completed")).toBeNull();
  });

  it("shows the completed badge on an ended list row without the exam type", () => {
    render(<MemoryRouter><CourseListRow course={endedCourse} showMentor={false} isMentor={false} menuHandlers={null} /></MemoryRouter>);
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.queryByText(/exams/i)).toBeNull();
  });
});
