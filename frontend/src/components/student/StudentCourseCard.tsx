import { Link } from "react-router-dom";
import { CalendarClock, ClipboardCheck, Clock, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { StudentCourseProfile } from "../../lib/users/types";
import { useMentorProfile } from "../../lib/users/hooks";
import { useCourseScheduleSummary } from "../../lib/students/useCourseScheduleSummary";
import { formatSchoolLessonTime, formatSchoolLessonWeekday, formatSchoolLessonDate } from "../../i18n/formatters";
import { WholePercent } from "../../lib/students/WholePercent";
import { CourseThumb } from "./CourseThumb";
import { ScoreFraction } from "./ScoreFraction";

interface StudentCourseCardProps {
  entry: StudentCourseProfile;
}

interface FactRowProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

function FactRow({ icon, label, children }: FactRowProps) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <span className="sr-only">{label}</span>
      <span className="min-w-0 break-words tabular-nums text-ink">{children}</span>
    </div>
  );
}

export function StudentCourseCard({ entry }: StudentCourseCardProps) {
  const { t } = useTranslation("student");
  const { course } = entry;
  const mentor = useMentorProfile(course.mentor_id).data?.user;
  const summary = useCourseScheduleSummary(course);
  const fallbackLesson: string | null =
    entry.next_lesson_at === null ? null : `${formatSchoolLessonWeekday(entry.next_lesson_at)}, ${formatSchoolLessonDate(entry.next_lesson_at)} · ${formatSchoolLessonTime(entry.next_lesson_at)}`;
  const nextLesson: string | null = summary.nextLessonLabel ?? fallbackLesson;
  const hasScore: boolean = entry.my_total_score !== undefined && entry.my_total_max_score !== undefined && entry.my_total_max_score > 0;

  return (
    <article data-testid="student-course-card" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <CourseThumb title={course.title} photoPath={course.photo_path} />
        <h3 className="min-w-0 break-words text-base font-semibold text-ink">{course.title}</h3>
      </div>
      <div className="flex flex-col gap-2">
        {mentor !== undefined && <FactRow icon={<UserRound size={16} />} label={t("card.mentor")}>{mentor.first_name} {mentor.last_name}</FactRow>}
        {summary.scheduleLine !== "" && <FactRow icon={<CalendarClock size={16} />} label={t("card.schedule")}>{summary.scheduleLine}</FactRow>}
        <FactRow icon={<Clock size={16} />} label={t("nextLesson")}>
          {nextLesson ?? <span className="text-muted">{t("card.noNextLesson")}</span>}
        </FactRow>
        <FactRow icon={<ClipboardCheck size={16} />} label={t("attendance")}>
          {t("card.attendanceValue", { value: WholePercent.format(entry.attendance_percentage) })}
        </FactRow>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div data-testid="course-card-score" className="text-sm">
          {hasScore ? <ScoreFraction score={entry.my_total_score!} maximum={entry.my_total_max_score!} showPercentage /> : <span className="text-muted">{t("metricUnavailable")}</span>}
        </div>
        <Link
          to={`/my/courses/${course.id}/journal`}
          className="inline-flex min-h-11 items-center rounded-[10px] bg-maroon px-4 text-sm font-semibold text-on-primary hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
        >
          {t("card.openJournal")}
        </Link>
      </div>
    </article>
  );
}
