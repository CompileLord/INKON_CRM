import { describe, expect, it } from "vitest";
import { NextLessonFinder } from "./nextLesson";
import type { CourseListItemResponse } from "../courses/types";

function course(dayOfWeek: number, timeStart: string): CourseListItemResponse {
  return {
    id: 1,
    title: "Algebra",
    description: "",
    photo_path: null,
    start_date: "2026-09-01",
    end_date: "2026-12-31",
    exam_type: "weekly",
    price: "100.00",
    mentor_id: 1,
    status: "active",
    is_deleted: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    schedules: [{ id: 1, course_id: 1, day_of_week: dayOfWeek, time_start: timeStart, time_end: "23:00:00" }],
    active_student_count: 3,
    current_period_label: null,
    last_graded_lesson_date: null,
    ungraded_lessons_count: 0,
  };
}

describe("NextLessonFinder", () => {
  const mondayNoonSchoolTime: Date = new Date("2026-10-26T07:00:00Z");

  it("finds a later lesson today", () => {
    const next = NextLessonFinder.find([course(0, "15:00:00")], mondayNoonSchoolTime);
    expect(next?.dayOffset).toBe(0);
    expect(next?.timeStart).toBe("15:00");
  });

  it("skips a lesson that already started today and picks tomorrow", () => {
    const next = NextLessonFinder.find([course(0, "09:00:00"), course(1, "08:30:00")], mondayNoonSchoolTime);
    expect(next?.dayOffset).toBe(1);
    expect(next?.timeStart).toBe("08:30");
  });

  it("returns null when nothing is scheduled within the week", () => {
    expect(NextLessonFinder.find([], mondayNoonSchoolTime)).toBeNull();
  });
});
