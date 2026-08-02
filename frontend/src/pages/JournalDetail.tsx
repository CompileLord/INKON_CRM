import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Users, TrendingUp, CalendarCheck, AlertTriangle } from "lucide-react";
import { useCourse, useCourseJournals, useCourseProgressChart } from "../lib/courses/hooks";
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

  // Compute metrics for the metrics strip
  const metrics = useMemo(() => {
    if (!progressChart || !progressChart.datasets || progressChart.datasets.length === 0) {
      return { classAvg: 0, attendanceRate: 0, completedPeriods: 0, atRiskCount: 0 };
    }

    const datasets = progressChart.datasets;
    let totalScoreSum = 0;
    let studentCount = datasets.length;
    let atRisk = 0;

    datasets.forEach((ds) => {
      const vals = ds.values;
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      totalScoreSum += avg;
      if (avg < 60) atRisk += 1;
    });

    const classAvg = studentCount > 0 ? totalScoreSum / studentCount : 0;
    const today = todayDateOnly();
    const completedPeriods = orderedPeriods.filter((p) => p.period_end < today).length;

    return {
      classAvg,
      attendanceRate: Math.min(100, classAvg * 0.95),
      completedPeriods,
      atRiskCount: atRisk,
    };
  }, [progressChart, orderedPeriods]);

  const backLink = (
    <Link
      to="/journals"
      className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-primary hover:underline transition-colors"
    >
      <ArrowLeft size={14} /> {t("backToJournals")}
    </Link>
  );

  if (!courseId) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="rounded-2xl border border-border bg-card p-6 text-muted-foreground">{t("notFound")}</div>
      </div>
    );
  }

  if (courseLoading) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="rounded-2xl border border-border bg-card p-6 text-muted-foreground">{t("common:loading")}</div>
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("loadFailedCourse")}</p>
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
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border py-3 px-1 -mx-1 flex flex-wrap items-center justify-between gap-4 transition-all">
        <div className="flex items-center gap-4">
          {backLink}
          <div className="h-4 w-px bg-border" />
          <h1 className="text-lg font-bold text-foreground">{course.title}</h1>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {mentorProfile && (
            <span className="flex items-center gap-2">
              <PersonAvatar
                firstName={mentorProfile.user.first_name}
                lastName={mentorProfile.user.last_name}
                photoUrl={resolveMediaUrl(mentorProfile.user.thumbnail_path ?? mentorProfile.user.photo_path) ?? undefined}
                size={22}
              />
              <span className="font-medium text-foreground">
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
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground font-medium">{t("metrics.classAverage")}</div>
            <div className="text-base font-bold text-foreground tabular-nums">
              {metrics.classAvg > 0 ? `${metrics.classAvg.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CalendarCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground font-medium">{t("metrics.attendanceRate")}</div>
            <div className="text-base font-bold text-foreground tabular-nums">
              {metrics.attendanceRate > 0 ? `${metrics.attendanceRate.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground font-medium">{t("metrics.periodsDone")}</div>
            <div className="text-base font-bold text-foreground tabular-nums">
              {metrics.completedPeriods} / {orderedPeriods.length}
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground font-medium">{t("metrics.atRisk")}</div>
            <div className="text-base font-bold text-foreground tabular-nums">{metrics.atRiskCount}</div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <JournalScoreChart data={progressChart} isLoading={chartLoading} />

      {/* Period accordion list */}
      {periodsLoading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t("common:loading")}
        </div>
      ) : periodsError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("loadFailed")}</p>
          <Button type="button" variant="secondary" onClick={() => refetchPeriods()}>
            {t("common:retry")}
          </Button>
        </div>
      ) : orderedPeriods.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("noPeriodsYet")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...orderedPeriods].reverse().map((period) => (
            <JournalPeriodSection
              key={period.id}
              courseId={courseId}
              period={period}
              isCurrentPeriod={defaultExpandedId === period.id}
              defaultExpanded={defaultExpandedId === period.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
