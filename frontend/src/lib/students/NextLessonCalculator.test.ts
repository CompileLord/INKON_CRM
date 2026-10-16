import { describe, expect, it } from "vitest";
import { NextLessonCalculator } from "./NextLessonCalculator";
import type { CourseScheduleResponse } from "../courses/types";

const schedule = (day: number, start: string, end: string): CourseScheduleResponse => ({ id: day, course_id: 1, day_of_week: day, time_start: start, time_end: end });
const MWF: CourseScheduleResponse[] = [schedule(0, "09:00:00", "10:30:00"), schedule(2, "09:00:00", "10:30:00"), schedule(4, "09:00:00", "10:30:00")];

describe("NextLessonCalculator", () => {
  it("finds the next weekday lesson in school time", () => {
    const fridayEvening: Date = new Date("2026-10-16T18:00:00+05:00");
    expect(NextLessonCalculator.next(MWF, "2026-12-31", fridayEvening)).toEqual({ date: "2026-10-19", weekdayIndex: 0, timeStart: "09:00:00" });
  });

  it("keeps a lesson that has not ended today and skips one that has", () => {
    expect(NextLessonCalculator.next(MWF, "2026-12-31", new Date("2026-10-16T10:00:00+05:00"))?.date).toBe("2026-10-16");
    expect(NextLessonCalculator.next(MWF, "2026-12-31", new Date("2026-10-16T10:31:00+05:00"))?.date).toBe("2026-10-19");
  });

  it("never returns a lesson after the course end date", () => {
    expect(NextLessonCalculator.next(MWF, "2026-10-18", new Date("2026-10-16T18:00:00+05:00"))).toBeNull();
  });

  it("returns nothing without a schedule", () => {
    expect(NextLessonCalculator.next([], "2026-12-31", new Date("2026-10-16T08:00:00+05:00"))).toBeNull();
  });

  it("groups weekdays that share a time range", () => {
    expect(NextLessonCalculator.groupByTime([...MWF, schedule(1, "14:00:00", "15:30:00")])).toEqual([
      { weekdayIndexes: [0, 2, 4], timeStart: "09:00:00", timeEnd: "10:30:00" },
      { weekdayIndexes: [1], timeStart: "14:00:00", timeEnd: "15:30:00" },
    ]);
  });
});
