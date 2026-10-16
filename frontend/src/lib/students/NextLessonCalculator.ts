import { SCHOOL_TIMEZONE } from "../../i18n/formatters";
import type { CourseScheduleResponse } from "../courses/types";

export interface UpcomingLesson {
  date: string;
  weekdayIndex: number;
  timeStart: string;
}

interface SchoolClock {
  date: string;
  time: string;
}

export interface ScheduleGroup {
  weekdayIndexes: number[];
  timeStart: string;
  timeEnd: string;
}

const MAXIMUM_LOOKAHEAD_DAYS: number = 366;

export class NextLessonCalculator {
  static schoolClock(now: Date): SchoolClock {
    const parts: Intl.DateTimeFormatPart[] = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: SCHOOL_TIMEZONE,
    }).formatToParts(now);
    const valueOf = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
    return {
      date: `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`,
      time: `${valueOf("hour")}:${valueOf("minute")}`,
    };
  }

  static weekdayIndexOf(calendarDate: string): number {
    const [year, month, day]: number[] = calendarDate.split("-").map(Number);
    return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  }

  static addDays(calendarDate: string, days: number): string {
    const [year, month, day]: number[] = calendarDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  }

  static next(schedules: readonly CourseScheduleResponse[], courseEndDate: string, now: Date): UpcomingLesson | null {
    const clock: SchoolClock = NextLessonCalculator.schoolClock(now);
    for (let offset: number = 0; offset < MAXIMUM_LOOKAHEAD_DAYS; offset += 1) {
      const candidateDate: string = NextLessonCalculator.addDays(clock.date, offset);
      if (candidateDate > courseEndDate) return null;
      const weekdayIndex: number = NextLessonCalculator.weekdayIndexOf(candidateDate);
      const sameDay: CourseScheduleResponse[] = schedules
        .filter((schedule) => schedule.day_of_week === weekdayIndex)
        .sort((first, second) => first.time_start.localeCompare(second.time_start));
      const remaining: CourseScheduleResponse | undefined = sameDay.find(
        (schedule) => offset > 0 || schedule.time_end.slice(0, 5) > clock.time,
      );
      if (remaining) return { date: candidateDate, weekdayIndex, timeStart: remaining.time_start };
    }
    return null;
  }

  static groupByTime(schedules: readonly CourseScheduleResponse[]): ScheduleGroup[] {
    const groups: Map<string, ScheduleGroup> = new Map();
    [...schedules]
      .sort((first, second) => first.day_of_week - second.day_of_week)
      .forEach((schedule) => {
        const key: string = `${schedule.time_start}|${schedule.time_end}`;
        const group: ScheduleGroup | undefined = groups.get(key);
        if (group) group.weekdayIndexes.push(schedule.day_of_week);
        else groups.set(key, { weekdayIndexes: [schedule.day_of_week], timeStart: schedule.time_start, timeEnd: schedule.time_end });
      });
    return [...groups.values()];
  }
}
