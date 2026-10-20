import { CourseScheduleGrouper, type ScheduleGroup } from "../../lib/courses/CourseScheduleGrouper";
import type { CourseScheduleResponse } from "../../lib/courses/types";

export class ScheduleSummary {
  static line(schedule: CourseScheduleResponse[], dayLabel: (day: number) => string): string {
    return CourseScheduleGrouper.group(schedule)
      .map((group: ScheduleGroup) => `${group.days.map(dayLabel).join(", ")} · ${group.timeStart}–${group.timeEnd}`)
      .join("; ");
  }
}
