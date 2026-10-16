import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, Target } from "lucide-react";
import type { StudentCourseProfile } from "../../lib/users/types";
import type { CourseResultSummary } from "../../lib/students/CourseResultSummary";
import { resolveMediaUrl } from "../../lib/users/media";
import { ScoreBand, type ScoreBandStyle } from "../../lib/students/ScoreBand";
import { formatNumber, formatSchoolLessonDate } from "../../i18n/formatters";
import { CourseCover, InitialsTile } from "./CourseCover";
import { PeriodStepper } from "./PeriodStepper";
import { TeacherLine } from "./TeacherLine";

export type CourseResultState = CourseResultSummary | "loading" | "unavailable";

interface StudentCourseCardProps {
  entry: StudentCourseProfile;
  variant: "active" | "archive";
  results: CourseResultState;
}

export function StudentCourseCard({ entry, variant, results }: StudentCourseCardProps) {
  const { t, i18n } = useTranslation(["student", "common"]);
  const { course, enrollment_status: enrollmentStatus, periods_total: periodsTotal } = entry;
  const [imageFailed, setImageFailed] = useState<boolean>(false);
  const photoUrl: string | null = resolveMediaUrl(course.photo_path) ?? null;
  const hasCover: boolean = photoUrl !== null && !imageFailed;
  const isArchive: boolean = variant === "archive";
  const summary: CourseResultSummary | null = typeof results === "object" ? results : null;
  const average: number | null = summary ? summary.averagePercentage : null;
  const band: ScoreBandStyle | null = average === null ? null : ScoreBand.of(average);
  const statusLabel: string =
    enrollmentStatus === "completed" ? t("status.completed") : enrollmentStatus === "withdrawn" ? t("status.left") : t("status.archived");

  return (
    <Link
      to={`/my/courses/${course.id}`}
      className={`group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border-warm shadow-xs hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
        isArchive ? "bg-strip" : "bg-card"
      }`}
    >
      {hasCover && photoUrl && <CourseCover photoUrl={photoUrl} muted={isArchive} onFailed={() => setImageFailed(true)} />}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {!hasCover && <InitialsTile title={course.title} />}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="line-clamp-2 break-words text-base font-semibold text-ink">{course.title}</h2>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {formatSchoolLessonDate(course.start_date, i18n.language)} – {formatSchoolLessonDate(course.end_date, i18n.language)}
              </span>
              {isArchive && (
                <span className="rounded-full bg-beige px-2 py-0.5 font-semibold text-ink" data-testid="course-status-chip">
                  {statusLabel}
                </span>
              )}
            </p>
          </div>
          <ChevronRight
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-muted motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:group-hover:translate-x-0.5"
          />
        </div>

        <TeacherLine mentorId={course.mentor_id} />

        <div className="mt-auto flex flex-col gap-2">
          <div className="flex items-end justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Target className="h-4 w-4" aria-hidden="true" />
              {t("myAverage")}
            </span>
            {results === "loading" ? (
              <span className="h-6 w-14 rounded-md bg-beige-dark motion-safe:animate-pulse" data-testid="course-score" data-band="loading" />
            ) : results === "unavailable" ? (
              <span className="text-sm font-medium text-muted" data-testid="course-score" data-band="unavailable">{t("metricUnavailable")}</span>
            ) : average !== null && band ? (
              <span className={`text-2xl font-semibold leading-none tabular-nums ${band.textClass}`} data-testid="course-score" data-band={band.name}>
                {formatNumber(average, i18n.language, { maximumFractionDigits: 0 })}%
              </span>
            ) : (
              <span className="text-sm font-medium text-muted" data-testid="course-score" data-band="none">
                {t("notGradedYet")}
              </span>
            )}
          </div>
          {band && average !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-beige" aria-hidden="true">
              <div className={`h-full rounded-full ${band.barClass}`} style={{ width: `${Math.min(100, Math.max(0, average))}%` }} />
            </div>
          )}
          {summary && <PeriodStepper graded={summary.gradedPeriods} total={periodsTotal} />}
        </div>
      </div>
    </Link>
  );
}
