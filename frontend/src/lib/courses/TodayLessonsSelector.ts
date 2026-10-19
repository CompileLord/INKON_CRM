import type { CourseListItemResponse } from "./types";

export interface TodayLesson {
  courseId: number;
  title: string;
  mentorId: number;
  timeStart: string;
  timeEnd: string;
  activeStudentCount: number;
}

export class TodayLessonsSelector {
  static select(
    courses: CourseListItemResponse[],
    schoolDate: string,
    weekdayIndex: number,
  ): TodayLesson[] {
    const lessons: TodayLesson[] = [];
    for (const course of courses) {
      if (course.status !== "active" || course.start_date > schoolDate || course.end_date < schoolDate) {
        continue;
      }
      for (const schedule of course.schedules) {
        if (schedule.day_of_week !== weekdayIndex) continue;
        lessons.push({
          courseId: course.id,
          title: course.title,
          mentorId: course.mentor_id,
          timeStart: schedule.time_start,
          timeEnd: schedule.time_end,
          activeStudentCount: course.active_student_count,
        });
      }
    }
    return lessons.sort(
      (left, right) => left.timeStart.localeCompare(right.timeStart) || left.title.localeCompare(right.title),
    );
  }
}
