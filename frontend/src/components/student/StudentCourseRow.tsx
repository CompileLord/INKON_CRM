import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StudentCourseProfile } from "../../lib/users/types";
import { resolveMediaUrl } from "../../lib/users/media";
import { formatSchoolLessonDate, formatSchoolLessonTime } from "../../i18n/formatters";

interface StudentCourseRowProps {
  entry: StudentCourseProfile;
}

export function StudentCourseRow({ entry }: StudentCourseRowProps) {
  const { t, i18n } = useTranslation(["student", "common"]);
  const { course } = entry;
  const [imageError, setImageError] = useState(false);

  const photoUrl = resolveMediaUrl(course.photo_path);
  const showImage = Boolean(photoUrl) && !imageError;

  const cadenceText = t(`common:enums.examType.${course.exam_type}`, course.exam_type);
  const dateRangeText = `${formatSchoolLessonDate(course.start_date, i18n.language)} – ${formatSchoolLessonDate(course.end_date, i18n.language)}`;
  const nextLessonInfo = entry.next_lesson_at
    ? `${t("nextLesson")}: ${formatSchoolLessonDate(entry.next_lesson_at, i18n.language)} ${formatSchoolLessonTime(entry.next_lesson_at, i18n.language)}`
    : t("noUpcomingLessonTitle");
  const scheduleMetaText = `${t("assessmentSchedule", { cadence: cadenceText })} · ${dateRangeText} · ${nextLessonInfo}`;

  return (
    <Link
      to={`/my/courses/${course.id}`}
      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 rounded-2xl border border-border-warm bg-card p-3 sm:p-4 hover:bg-row-hover motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
    >
      <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
        <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-strip border border-border-warm flex items-center justify-center">
          {showImage ? (
            <img
              src={photoUrl!}
              alt=""
              onError={() => setImageError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              role="img"
              className="flex items-center justify-center w-full h-full text-muted"
              aria-label={t("courseImagePlaceholder")}
            >
              <BookOpen size={24} aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <h3 className="text-sm sm:text-base font-semibold text-ink break-words group-hover:text-maroon">
            {course.title}
          </h3>
          <p className="text-xs text-muted mt-0.5 break-words">
            {scheduleMetaText}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t border-border-warm/60 sm:border-t-0">
        <div className="text-left sm:text-right">
          <span className="block text-xs font-medium uppercase tracking-wider text-muted">
            {t("myAverage")}
          </span>
          <span className="text-sm text-muted" title={t("gradingStateUnavailableBody")}>{t("scoreUnavailable")}</span>
        </div>

        <div className="flex items-center gap-1 text-muted group-hover:text-ink">
          <span className="text-xs font-semibold">
            {t("openCourse")}
          </span>
          <ChevronRight
            size={16}
            className="motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </div>
    </Link>
  );
}
