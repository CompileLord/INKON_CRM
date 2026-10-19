import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StudentJournalPeriod } from "../../lib/users/types";
import { formatSchoolLessonDate, formatNumber } from "../../i18n/formatters";
import { useJournal } from "../../lib/journals/hooks";
import { Button } from "../ui/Button";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";

interface StudentResultCardProps {
  journal?: StudentJournalPeriod;
  hasLoadedData?: boolean;
  hasUpcomingPeriods?: boolean;
  isLoading: boolean;
  isError: boolean;
  isRefetching?: boolean;
  onRetry?: () => void;
}

export function StudentResultCard({ journal, hasLoadedData = journal !== undefined, hasUpcomingPeriods = false, isLoading, isError, isRefetching = false, onRetry }: StudentResultCardProps) {
  const { t, i18n } = useTranslation(["student", "common"]);
  const detail = useJournal(journal?.journal_id);
  const summary = detail.data?.students.length === 1 ? detail.data.students[0].summary : null;
  const contributions = [summary?.homework_score, summary?.attendance_score, summary?.exam_score, summary?.bonus_score];
  const retry = onRetry ? <Button variant="secondary" loading={isRefetching} onClick={onRetry}>{t("common:retry")}</Button> : null;
  const warning = isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-surface p-3 text-sm text-warning"><p>{t("journalsRefreshError")}</p>{retry}</div> : null;

  if (!hasLoadedData && isLoading) {
    return <div role="status" aria-busy="true" className="min-h-72 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-muted"><BrandActivityIndicator size={20} aria-hidden="true" /><span>{t("common:loading")}</span></div>
      <div className="mt-4 space-y-4 motion-safe:animate-pulse" aria-hidden="true"><div className="h-12 rounded bg-strip" /><div className="h-16 rounded bg-strip" /><div className="h-16 rounded bg-strip" /><div className="h-11 rounded bg-strip" /></div>
    </div>;
  }
  if (!hasLoadedData && isError) {
    return <div role="alert" className="flex min-h-72 flex-col items-start gap-4 rounded-2xl border border-border bg-card p-5"><p className="text-sm text-destructive">{t("journalsRefreshError")}</p><p className="text-sm text-muted">{t("common:error")}</p>{retry}</div>;
  }
  if (!journal) {
    return <div className="min-h-72 rounded-2xl border border-border bg-card p-5">{warning}<h3 className="mt-2 text-base font-semibold text-ink">{t(hasUpcomingPeriods ? "upcomingPeriodsTitle" : "noAvailablePeriodsTitle")}</h3><p className="mt-2 text-sm text-muted">{t(hasUpcomingPeriods ? "upcomingPeriodsBody" : "noAvailablePeriodsBody")}</p></div>;
  }
  return <div className="flex min-h-72 flex-col gap-4 rounded-2xl border border-border bg-card p-5">
    {warning}
    <header className="min-w-0 space-y-1"><h3 className="break-words text-base font-semibold text-ink">{journal.course_title}</h3><p className="break-words text-sm text-ink">{journal.period_label}</p><p className="text-sm text-muted">{formatSchoolLessonDate(journal.period_start, i18n.language)} – {formatSchoolLessonDate(journal.period_end, i18n.language)}</p></header>
    <div className="rounded-xl bg-strip p-3"><p className="text-sm font-semibold text-ink">{t("gradingStateUnavailable")}</p><p className="mt-1 text-sm text-muted">{t("gradingStateUnavailableBody")}</p></div>
    {detail.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm text-destructive"><p>{t("recordedResultError")}</p><Button variant="secondary" loading={detail.isFetching} onClick={() => detail.refetch()}>{t("common:retry")}</Button></div>}
    {detail.isLoading && !detail.data ? <div role="status" className="h-28 rounded-xl bg-strip motion-safe:animate-pulse"><span className="sr-only">{t("common:loading")}</span></div> : <>
      {summary ? <div><p className="text-sm text-muted">{t("recordedResult")}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{formatNumber(summary.sum_score, i18n.language)} <span className="text-base font-normal text-muted">/ {formatNumber(summary.max_period_score, i18n.language)}</span></p></div> : <p className="text-sm text-muted">{t(detail.isError ? "scoreUnavailable" : "recordedResultMissing")}</p>}
      <dl className="space-y-2 border-t border-border pt-3">{["homework", "attendance", "exam", "bonus"].map((key, index) => <div key={key} className="flex items-baseline justify-between gap-4 text-sm"><dt className="text-muted">{t(key)}</dt><dd className="tabular-nums text-ink" aria-label={contributions[index] === undefined ? t("scoreUnavailable") : undefined}>{contributions[index] === undefined ? t("metricUnavailable") : formatNumber(contributions[index], i18n.language)}</dd></div>)}</dl>
    </>}
    <details className="group border-t border-border"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronRight size={16} aria-hidden="true" className="shrink-0 group-open:rotate-90 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out" />{t("howCalculated")}</summary><p className="rounded-xl bg-strip p-3 text-sm leading-relaxed text-muted">{t("howCalculatedExplanation")}</p></details>
    <Link to={"/my/journal/" + journal.journal_id} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-control-border bg-card px-4 py-2 text-sm font-medium text-maroon-text hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]">{t("journalDetails")}<ChevronRight size={16} aria-hidden="true" /></Link>
  </div>;
}
