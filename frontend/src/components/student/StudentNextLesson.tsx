import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatSchoolLessonDate, formatSchoolLessonTime, formatSchoolLessonWeekday } from "../../i18n/formatters";
import type { StudentCourseProfile } from "../../lib/users/types";

interface StudentNextLessonProps {
  activeCourses: StudentCourseProfile[];
}

export class NextLessonPicker {
  static earliest(courses: StudentCourseProfile[]): StudentCourseProfile | null {
    const scheduled: StudentCourseProfile[] = courses.filter((entry: StudentCourseProfile) => entry.next_lesson_at !== null);
    if (scheduled.length === 0) return null;
    return scheduled.reduce((soonest: StudentCourseProfile, entry: StudentCourseProfile) => (new Date(entry.next_lesson_at as string).getTime() < new Date(soonest.next_lesson_at as string).getTime() ? entry : soonest));
  }
}

export function StudentNextLesson({ activeCourses }: StudentNextLessonProps) {
  const { t } = useTranslation("student");
  const next: StudentCourseProfile | null = NextLessonPicker.earliest(activeCourses);
  if (next === null) return null;
  const startsAt: string = next.next_lesson_at as string;
  return (
    <section data-testid="student-next-lesson" aria-label={t("nextLesson")} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <CalendarClock size={20} aria-hidden="true" className="shrink-0 text-muted" />
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted">{t("nextLesson")}</span>
        <span className="break-words text-sm font-semibold text-ink tabular-nums">
          {formatSchoolLessonWeekday(startsAt)}, {formatSchoolLessonDate(startsAt)} · {formatSchoolLessonTime(startsAt)}
        </span>
        <span className="break-words text-sm text-muted">{next.course.title}</span>
      </div>
    </section>
  );
}
