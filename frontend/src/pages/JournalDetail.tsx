import { useMemo, useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Users, TrendingUp, CalendarCheck, AlertTriangle, Target } from "lucide-react";
import { useCourse, useCourseJournals, useCourseJournalMetrics, useCourseProgressChart } from "../lib/courses/hooks";
import { useMentorProfile } from "../lib/users/hooks";
import { useCourseRoster } from "../lib/enrollments/hooks";
import { resolveMediaUrl } from "../lib/users/media";
import { PersonAvatar } from "../components/ui/PersonAvatar";
import { Button } from "../components/ui/Button";
import { JournalScoreChart } from "../components/journals/JournalScoreChart";
import { JournalPeriodSection } from "../components/journals/JournalPeriodSection";
import { useTranslation } from "react-i18next";

function todayDateOnly(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function JournalDetail() {
  const { t } = useTranslation(["journals", "common"]);
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const numericId = id ? Number(id) : undefined;
  const courseId = Number.isFinite(numericId) ? numericId : undefined;

  const { data: course, isLoading: courseLoading, isError: courseError, refetch: refetchCourse } = useCourse(courseId);
  const { data: mentorProfile } = useMentorProfile(course?.mentor_id);
  const { rows: roster } = useCourseRoster(courseId);
  const {
    data: periods,
    isLoading: periodsLoading,
    isError: periodsError,
    refetch: refetchPeriods,
  } = useCourseJournals(courseId);
  const { data: progressChart, isLoading: chartLoading } = useCourseProgressChart(courseId);
  const { data: metrics } = useCourseJournalMetrics(courseId);

  const orderedPeriods = useMemo(
    () => [...(periods ?? [])].sort((a, b) => a.period_start.localeCompare(b.period_start)),
    [periods]
  );

  const defaultExpandedId = useMemo(() => {
    if (orderedPeriods.length === 0) return undefined;
    const today = todayDateOnly();
    const current = orderedPeriods.find((p) => p.period_end >= today);
    return (current ?? orderedPeriods[orderedPeriods.length - 1]).id;
  }, [orderedPeriods]);

  const periodQueryParam = searchParams.get("period");
  const activePeriodId = periodQueryParam ? Number(periodQueryParam) : defaultExpandedId;

  const periodRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (periodQueryParam && periodRefs.current[Number(periodQueryParam)]) {
      periodRefs.current[Number(periodQueryParam)]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [periodQueryParam]);

  const handleJumpToCurrent = () => {
    if (defaultExpandedId) {
      setSearchParams({ period: String(defaultExpandedId) });
      periodRefs.current[defaultExpandedId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const backLink = (
    <Link
      to="/journals"
      className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-maroon dark:text-accent hover:underline transition-colors"
    >
      <ArrowLeft size={14} /> {t("backToJournals")}
    </Link>
  );

  if (!courseId) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="rounded-2xl border border-border bg-card p-6 text-muted">{t("notFound")}</div>
      </div>
    );
  }

  if (courseLoading) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="rounded-2xl border border-border bg-card p-6 text-muted">{t("common:loading")}</div>
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted">{t("loadFailedCourse")}</p>
          <Button type="button" variant="secondary" onClick={() => refetchCourse()}>
            {t("common:retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Sticky header bar */}
      <div className="sticky top-0 z-20 bg-cream/95 backdrop-blur border-b border-border py-3 px-1 -mx-1 flex flex-wrap items-center justify-between gap-4 transition-all">
        <div className="flex items-center gap-4">
          {backLink}
          <div className="h-4 w-px bg-border" />
          <h1 className="text-lg font-bold text-ink">{course.title}</h1>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted">
          {defaultExpandedId && (
            <button
              type="button"
              onClick={handleJumpToCurrent}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-warm bg-card px-2.5 py-1 text-xs font-semibold text-ink hover:bg-strip transition-colors shadow-xs"
            >
              <Target size={14} className="text-maroon dark:text-accent" />
              {t("jumpToCurrent")}
            </button>
          )}
          {mentorProfile && (
            <span className="flex items-center gap-2">
              <PersonAvatar
                firstName={mentorProfile.user.first_name}
                lastName={mentorProfile.user.last_name}
                photoUrl={resolveMediaUrl(mentorProfile.user.thumbnail_path ?? mentorProfile.user.photo_path) ?? undefined}
                size={22}
              />
              <span className="font-medium text-ink">
                {mentorProfile.user.first_name} {mentorProfile.user.last_name}
              </span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {t("studentsCount", { count: roster.length })}
          </span>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex items-center gap-3">
          <div className="p-2 rounded-lg bg-maroon/10 text-maroon dark:bg-accent/10 dark:text-accent">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-muted font-medium">{t("metrics.classAverage")}</div>
            <div className="text-base font-bold text-ink tabular-nums">
              {metrics && metrics.class_avg_percentage > 0 ? `${metrics.class_avg_percentage.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CalendarCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-muted font-medium">{t("metrics.attendanceRate")}</div>
            <div className="text-base font-bold text-ink tabular-nums">
              {metrics && metrics.attendance_rate > 0 ? `${metrics.attendance_rate.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-muted font-medium">{t("metrics.periodsDone")}</div>
            <div className="text-base font-bold text-ink tabular-nums">
              {metrics ? metrics.periods_complete : 0} / {metrics ? metrics.periods_total : orderedPeriods.length}
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-muted font-medium">{t("metrics.atRisk")}</div>
            <div className="text-base font-bold text-ink tabular-nums">
              {metrics ? metrics.at_risk_count : 0}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <JournalScoreChart data={progressChart} isLoading={chartLoading} />

      {/* Period accordion list */}
      {periodsLoading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">
          {t("common:loading")}
        </div>
      ) : periodsError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted">{t("loadFailed")}</p>
          <Button type="button" variant="secondary" onClick={() => refetchPeriods()}>
            {t("common:retry")}
          </Button>
        </div>
      ) : orderedPeriods.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted">
          {t("noPeriodsYet")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...orderedPeriods].reverse().map((period) => (
            <div key={period.id} ref={(el) => { periodRefs.current[period.id] = el; }}>
              <JournalPeriodSection
                courseId={courseId}
                period={period}
                isCurrentPeriod={defaultExpandedId === period.id}
                defaultExpanded={activePeriodId === period.id}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
