import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/formatters";
import type { MentorAnalyticsResponse, MentorProfileResponse } from "../../lib/users/types";
import { Button } from "../ui/Button";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";
import { Link } from "react-router-dom";

export function MentorPerformance({ profile, analytics, loading, failed, onRetry }: {
  profile: MentorProfileResponse;
  analytics?: MentorAnalyticsResponse;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { t, i18n } = useTranslation(["mentors", "common"]);
  const number = (value: number) => formatNumber(value, i18n.language, { maximumFractionDigits: 1 });
  return <div className="flex min-w-0 flex-col gap-4">
    <section className="rounded-2xl border border-border-warm bg-card p-4 md:p-5">
      <h2 className="text-base font-bold text-ink">{t("profile.performanceTitle")}</h2>
      <p className="mt-2 text-sm text-muted">{t("profile.normalizedBasis")}</p>
      <p className="mt-2 text-xs text-muted tabular-nums">{t("profile.ratioEligibility", { included: number(profile.avg_score_defined_ratio_count), excluded: number(profile.avg_score_undefined_ratio_count), total: number(profile.avg_score_summary_count) })}</p>
      <p className="mt-2 text-xs text-muted">{t(profile.avg_score_grading_state === "missing" ? "profile.noRecordedSummaries" : "profile.unknownProvenance")}</p>
      {profile.avg_score_defined_ratios_mean === null && <p className="mt-2 text-sm text-muted">{t("profile.scoreUnavailable")}</p>}
      <p className="mt-2 text-xs text-muted">{t("profile.activeStudentsBasis")}</p>
    </section>
    <section className="rounded-2xl border border-border-warm bg-card p-4 md:p-5" aria-busy={loading}>
      <h2 className="text-base font-bold text-ink">{t("profile.analyticsTitle")}</h2>
      {loading ? <div role="status" className="mt-3 flex items-center gap-2 text-sm text-muted"><BrandActivityIndicator size={20} /><span>{t("profile.analyticsLoading")}</span></div>
        : failed || !analytics ? <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"><p>{t("profile.analyticsError")}</p><Button variant="secondary" onClick={onRetry}>{t("common:retry")}</Button></div>
          : <dl className="mt-3 flex flex-col gap-4">
            <div><dt className="text-sm font-medium text-ink">{t("profile.totalStudents")}</dt><dd className="mt-1 text-sm text-muted"><span className="font-semibold text-ink tabular-nums">{number(analytics.total_students_count)}</span> · {t("profile.totalStudentsBasis")}</dd></div>
            <div><dt className="text-sm font-medium text-ink">{t("profile.rawPoints")}</dt><dd className="mt-1 text-sm text-muted"><span className="font-semibold text-ink tabular-nums">{analytics.average_student_score_summary_count > 0 ? number(analytics.average_student_score) : t("profile.scoreUnavailable")}</span> · {t("profile.rawPointsBasis")}</dd><dd className="mt-1 text-xs text-muted">{t(analytics.average_student_score_grading_state === "missing" ? "profile.noRecordedSummaries" : "profile.unknownProvenance")}</dd></div>
            <div><dt className="text-sm font-medium text-ink">{t("profile.activeCourses")}</dt><dd className="mt-1 text-sm text-muted"><span className="font-semibold text-ink tabular-nums">{number(analytics.active_courses_count)}</span> · {t("profile.activeCoursesBasis")}</dd></div>
          </dl>}
    </section>
    {profile.active_courses.length > 0 && <nav aria-label={t("profile.courseContext")} className="rounded-2xl border border-border-warm bg-card p-4">
      <p className="text-sm font-medium text-ink">{t("profile.courseContext")}</p>
      <div className="mt-1 flex min-w-0 flex-col">{profile.active_courses.map(course => <Link key={course.id} to={`/courses/${course.id}`} className="inline-flex min-h-11 min-w-0 items-center text-sm text-nav hover:underline [overflow-wrap:anywhere]">{course.title}</Link>)}</div>
    </nav>}
  </div>;
}
