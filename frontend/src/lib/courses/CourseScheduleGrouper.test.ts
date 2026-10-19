import { describe, expect, it } from "vitest";
import { CourseScheduleGrouper, type ScheduleGroup } from "./CourseScheduleGrouper";
import type { CourseScheduleResponse } from "./types";

function schedule(day: number, start: string, end: string): CourseScheduleResponse {
  return { id: day, course_id: 1, day_of_week: day, time_start: start, time_end: end };
}

describe("CourseScheduleGrouper", () => {
  it("groups identical time ranges across days in weekday order", () => {
    const groups: ScheduleGroup[] = CourseScheduleGrouper.group([
      schedule(4, "14:00:00", "15:30:00"),
      schedule(0, "14:00:00", "15:30:00"),
      schedule(2, "14:00:00", "15:30:00"),
    ]);
    expect(groups).toEqual([{ days: [0, 2, 4], timeStart: "14:00", timeEnd: "15:30" }]);
  });

  it("keeps separate groups when times differ per day", () => {
    const groups: ScheduleGroup[] = CourseScheduleGrouper.group([
      schedule(1, "10:00:00", "11:00:00"),
      schedule(0, "14:00:00", "15:30:00"),
      schedule(3, "10:00:00", "11:00:00"),
    ]);
    expect(groups).toEqual([
      { days: [0], timeStart: "14:00", timeEnd: "15:30" },
      { days: [1, 3], timeStart: "10:00", timeEnd: "11:00" },
    ]);
  });

  it("returns no groups for an empty schedule", () => {
    expect(CourseScheduleGrouper.group([])).toEqual([]);
  });
});
