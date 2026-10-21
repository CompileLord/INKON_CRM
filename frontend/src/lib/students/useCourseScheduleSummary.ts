import { useTranslation } from "react-i18next";
import { useCourseSchedule } from "../courses/hooks";
import type { CourseResponse } from "../courses/types";
import { formatSchoolLessonDate, formatTime } from "../../i18n/formatters";
import { NextLessonCalculator, type ScheduleGroup, type UpcomingLesson } from "./NextLessonCalculator";

export interface CourseScheduleSummary {
  scheduleLine: string;
  nextLessonLabel: string | null;
  isLoading: boolean;
}

export function useCourseScheduleSummary(course: CourseResponse | undefined): CourseScheduleSummary {
  const { t } = useTranslation("student");
  const scheduleQuery = useCourseSchedule(course?.id);
  const schedule = scheduleQuery.data;
  const groups: ScheduleGroup[] = schedule ? NextLessonCalculator.groupByTime(schedule) : [];
  const scheduleLine: string = groups
    .map((group: ScheduleGroup) => `${group.weekdayIndexes.map((index: number) => t(`weekdays.${index}`)).join(" · ")} ${formatTime(group.timeStart)}–${formatTime(group.timeEnd)}`)
    .join("; ");
  const next: UpcomingLesson | null =
    schedule && course !== undefined && course.status === "active" ? NextLessonCalculator.next(schedule, course.end_date, new Date()) : null;
  const nextLessonLabel: string | null =
    next === null ? null : `${t(`weekdays.${next.weekdayIndex}`)}, ${formatSchoolLessonDate(next.date)} · ${formatTime(next.timeStart)}`;
  return { scheduleLine, nextLessonLabel, isLoading: scheduleQuery.isLoading };
}
