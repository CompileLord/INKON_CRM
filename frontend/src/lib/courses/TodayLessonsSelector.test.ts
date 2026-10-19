import { describe, expect, it } from "vitest";
import { TodayLessonsSelector, type TodayLesson } from "./TodayLessonsSelector";
import type { CourseListItemResponse } from "./types";

function course(overrides: Partial<CourseListItemResponse>): CourseListItemResponse {
  return {
    id: 1,
    title: "Course",
    description: "",
    photo_path: null,
    start_date: "2026-09-01",
    end_date: "2026-12-31",
    exam_type: "weekly",
    price: "100.00",
    mentor_id: 7,
    status: "active",
    is_deleted: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    schedules: [],
    active_student_count: 3,
    ...overrides,
  };
}

describe("TodayLessonsSelector", () => {
  it("returns only today's weekday lessons sorted by start time", () => {
    const lessons: TodayLesson[] = TodayLessonsSelector.select(
      [
        course({ id: 1, title: "Late", schedules: [{ id: 1, course_id: 1, day_of_week: 0, time_start: "16:00:00", time_end: "17:00:00" }] }),
        course({
          id: 2,
          title: "Early",
          schedules: [
            { id: 2, course_id: 2, day_of_week: 0, time_start: "09:00:00", time_end: "10:00:00" },
            { id: 3, course_id: 2, day_of_week: 2, time_start: "09:00:00", time_end: "10:00:00" },
          ],
        }),
      ],
      "2026-10-19",
      0,
    );
    expect(lessons.map((lesson) => lesson.title)).toEqual(["Early", "Late"]);
    expect(lessons[0]).toMatchObject({ courseId: 2, timeStart: "09:00:00", timeEnd: "10:00:00", activeStudentCount: 3, mentorId: 7 });
  });

  it("excludes archived courses and courses outside their date range", () => {
    const todaySchedule = [{ id: 1, course_id: 1, day_of_week: 0, time_start: "09:00:00", time_end: "10:00:00" }];
    const lessons: TodayLesson[] = TodayLessonsSelector.select(
      [
        course({ id: 1, status: "archived", schedules: todaySchedule }),
        course({ id: 2, start_date: "2026-10-20", schedules: todaySchedule }),
        course({ id: 3, end_date: "2026-10-18", schedules: todaySchedule }),
      ],
      "2026-10-19",
      0,
    );
    expect(lessons).toEqual([]);
  });
});
