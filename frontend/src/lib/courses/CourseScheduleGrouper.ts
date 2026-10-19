import { formatTime } from "../../i18n/formatters";
import type { CourseScheduleResponse } from "./types";

export interface ScheduleGroup {
  days: number[];
  timeStart: string;
  timeEnd: string;
}

export class CourseScheduleGrouper {
  static group(schedules: CourseScheduleResponse[]): ScheduleGroup[] {
    const groupsByRange: Map<string, ScheduleGroup> = new Map();
    const ordered: CourseScheduleResponse[] = [...schedules].sort(
      (left, right) => left.day_of_week - right.day_of_week,
    );
    for (const schedule of ordered) {
      const timeStart: string = formatTime(schedule.time_start);
      const timeEnd: string = formatTime(schedule.time_end);
      const rangeKey: string = `${timeStart}-${timeEnd}`;
      const existing: ScheduleGroup | undefined = groupsByRange.get(rangeKey);
      if (existing) {
        existing.days.push(schedule.day_of_week);
      } else {
        groupsByRange.set(rangeKey, { days: [schedule.day_of_week], timeStart, timeEnd });
      }
    }
    return [...groupsByRange.values()].sort((left, right) => left.days[0] - right.days[0]);
  }
}
