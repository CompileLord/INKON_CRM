import type { CourseListItemResponse } from "../courses/types";
import { getSchoolCalendarDate, getSchoolWeekdayIndex, SCHOOL_TIMEZONE } from "../../i18n/formatters";

export interface NextLesson {
  dayOffset: number;
  date: Date;
  timeStart: string;
}

const MILLISECONDS_PER_DAY: number = 24 * 60 * 60 * 1000;
const LOOKAHEAD_DAYS: number = 7;

function schoolClockTime(moment: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: SCHOOL_TIMEZONE,
  }).format(moment);
}

export class NextLessonFinder {
  static find(courses: CourseListItemResponse[], now: Date): NextLesson | null {
    const nowClock: string = schoolClockTime(now);
    for (let dayOffset = 0; dayOffset <= LOOKAHEAD_DAYS; dayOffset += 1) {
      const date: Date = new Date(now.getTime() + dayOffset * MILLISECONDS_PER_DAY);
      const schoolDate: string = getSchoolCalendarDate(date);
      const weekday: number = getSchoolWeekdayIndex(date);
      const starts: string[] = [];
      for (const course of courses) {
        if (course.status !== "active" || course.start_date > schoolDate || course.end_date < schoolDate) continue;
        for (const schedule of course.schedules) {
          if (schedule.day_of_week !== weekday) continue;
          const timeStart: string = schedule.time_start.slice(0, 5);
          if (dayOffset === 0 && timeStart <= nowClock) continue;
          starts.push(timeStart);
        }
      }
      if (starts.length > 0) return { dayOffset, date, timeStart: starts.sort()[0] };
    }
    return null;
  }
}
