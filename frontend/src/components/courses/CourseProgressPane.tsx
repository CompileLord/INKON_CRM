import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlertCircle, BookOpen, RotateCcw, Search } from "lucide-react";
import { useCourseStaffProgress } from "../../lib/courses/hooks";
import { buildCourseJournalUrl, recordCourseDetailNavigation } from "../../lib/courses/returnContext";
import { formatDate, formatNumber, getActiveLocale } from "../../i18n/formatters";
import { useAuthStore } from "../../store/authStore";
import { PersonAvatar } from "../ui/PersonAvatar";
import { Button } from "../ui/Button";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";

export type ProgressSortOption = "score_desc" | "score_asc" | "name_asc" | "name_desc";
export type SortOption = ProgressSortOption;

export interface CourseProgressPaneProps {
  courseId: number;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  sortOption?: ProgressSortOption;
  onSortOptionChange?: (sort: ProgressSortOption) => void;
  selectedPeriodId?: number;
  onSelectedPeriodIdChange?: (periodId: number) => void;
  onReady?: () => void;
}

export function CourseProgressPane({
  courseId,
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
  sortOption: externalSortOption,
  onSortOptionChange,
  selectedPeriodId: externalSelectedPeriodId,
  onSelectedPeriodIdChange,
  onReady,
}: CourseProgressPaneProps) {
  const { t, i18n } = useTranslation(["courses", "common"]);
  const role = useAuthStore((s) => s.role);
  const filterId = useId();
  const sortSelectId = useId();
  const phonePeriodSelectId = useId();

  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [internalSortOption, setInternalSortOption] = useState<ProgressSortOption>("score_desc");
  const [internalSelectedPeriodId, setInternalSelectedPeriodId] = useState<number | undefined>(undefined);

  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = onSearchQueryChange || setInternalSearchQuery;

  const sortOption: ProgressSortOption = useMemo(() => {
    const raw = externalSortOption !== undefined ? externalSortOption : internalSortOption;
    if (raw === "score_desc" || raw === "score_asc" || raw === "name_asc" || raw === "name_desc") {
      return raw;
    }
    return "score_desc";
  }, [externalSortOption, internalSortOption]);
  const setSortOption = onSortOptionChange || setInternalSortOption;

  const {
    data: staffProgress,
    isLoading,
    isError,
    refetch,
  } = useCourseStaffProgress(courseId);

  useEffect(() => {
    if (!isLoading) {
      onReady?.();
    }
  }, [isLoading, onReady]);

  const periods = useMemo(() => staffProgress?.periods ?? [], [staffProgress?.periods]);
  const allStudents = useMemo(() => staffProgress?.students ?? [], [staffProgress?.students]);

  const defaultPeriodId = periods.length > 0 ? periods[periods.length - 1].id : undefined;
  const activePeriodId =
    externalSelectedPeriodId !== undefined && periods.some((p) => p.id === externalSelectedPeriodId)
      ? externalSelectedPeriodId
      : internalSelectedPeriodId !== undefined && periods.some((p) => p.id === internalSelectedPeriodId)
        ? internalSelectedPeriodId
        : defaultPeriodId;

  const activePeriod = periods.find((p) => p.id === activePeriodId);

  const handlePeriodChange = (nextPeriodId: number) => {
    setInternalSelectedPeriodId(nextPeriodId);
    onSelectedPeriodIdChange?.(nextPeriodId);
  };

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allStudents;
    return allStudents.filter((student) => {
      const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
      return fullName.includes(q);
    });
  }, [allStudents, searchQuery]);

  const sortedStudents = useMemo(() => {
    if (filteredStudents.length === 0) return [];
    const locale = getActiveLocale(i18n.language);
    const list = [...filteredStudents];

    list.sort((a, b) => {
      if (sortOption === "name_asc" || sortOption === "name_desc") {
        const nameA = `${a.first_name} ${a.last_name}`.trim();
        const nameB = `${b.first_name} ${b.last_name}`.trim();
        const cmp = nameA.localeCompare(nameB, locale);
        if (cmp !== 0) return sortOption === "name_asc" ? cmp : -cmp;
        return a.student_id - b.student_id;
      }

      const resA = a.period_results.find((r) => r.period_id === activePeriodId);
      const resB = b.period_results.find((r) => r.period_id === activePeriodId);

      const hasPctA =
        typeof resA?.percentage === "number" &&
        typeof resA?.max_score === "number" &&
        resA.max_score > 0;
      const hasPctB =
        typeof resB?.percentage === "number" &&
        typeof resB?.max_score === "number" &&
        resB.max_score > 0;

      const valA = hasPctA ? resA!.percentage! : null;
      const valB = hasPctB ? resB!.percentage! : null;

      if (valA === null && valB === null) return a.student_id - b.student_id;
      if (valA === null) return 1;
      if (valB === null) return -1;

      const diff = sortOption === "score_desc" ? valB - valA : valA - valB;
      if (diff !== 0) return diff;
      return a.student_id - b.student_id;
    });

    return list;
  }, [filteredStudents, sortOption, activePeriodId, i18n.language]);

  const handleStudentDeparture = () => {
    recordCourseDetailNavigation(courseId, {
      tab: "progress",
      periodId: activePeriodId,
      search: searchQuery,
      sort: sortOption,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
    });
    if (typeof window !== "undefined") {
      try {
        const currentState = window.history.state;
        const usr =
          typeof currentState === "object" && currentState !== null && "usr" in currentState
            ? (currentState as { usr: Record<string, unknown> }).usr
            : {};
        window.history.replaceState(
          {
            ...currentState,
            usr: {
              ...usr,
              fromInternalReturn: true,
            },
          },
          "",
        );
      } catch {}
    }
  };

  if (isLoading && !staffProgress) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-14 rounded-2xl border border-border-warm bg-card p-4 flex items-center justify-between px-6">
          <div className="h-4 w-36 rounded bg-strip motion-safe:animate-pulse" />
          <BrandActivityIndicator size={20} />
        </div>
        <div className="rounded-2xl border border-border-warm bg-card p-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="h-12 w-60 rounded-xl bg-strip motion-safe:animate-pulse" />
            <div className="h-12 w-44 rounded-xl bg-strip motion-safe:animate-pulse" />
          </div>
          <div className="hidden md:block overflow-hidden rounded-xl border border-border">
            <div className="h-12 bg-strip border-b border-border flex items-center px-4 gap-4">
              <div className="w-60 h-4 bg-card rounded motion-safe:animate-pulse" />
              <div className="flex-1 flex gap-4">
                <div className="w-24 h-4 bg-card rounded motion-safe:animate-pulse" />
                <div className="w-24 h-4 bg-card rounded motion-safe:animate-pulse" />
                <div className="w-28 h-4 bg-card rounded motion-safe:animate-pulse ml-auto" />
              </div>
            </div>
            {[1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="h-[52px] border-b border-border/60 flex items-center px-4 gap-4"
              >
                <div className="w-60 flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-strip motion-safe:animate-pulse" />
                  <div className="h-4 w-32 bg-strip rounded motion-safe:animate-pulse" />
                </div>
                <div className="flex-1 flex gap-4">
                  <div className="w-24 h-4 bg-strip rounded motion-safe:animate-pulse" />
                  <div className="w-24 h-4 bg-strip rounded motion-safe:animate-pulse" />
                  <div className="w-28 h-4 bg-strip rounded motion-safe:animate-pulse ml-auto" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 md:hidden">
            {[1, 2, 3].map((card) => (
              <div
                key={card}
                className="h-20 rounded-xl border border-border bg-card p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-strip motion-safe:animate-pulse" />
                  <div className="h-4 w-28 bg-strip rounded motion-safe:animate-pulse" />
                </div>
                <div className="h-5 w-14 bg-strip rounded motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError && !staffProgress) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 text-center shadow-xs">
        <p className="text-sm font-medium text-destructive">
          {t("courses:progress.loadError")}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => refetch()}
          className="min-h-[44px] min-w-[44px] gap-1.5"
        >
          <RotateCcw size={14} />
          <span>{t("common:retry")}</span>
        </Button>
      </div>
    );
  }

  const retainedErrorBanner =
    isError && staffProgress ? (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
      >
        <span>{t("courses:progress.loadError")}</span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => refetch()}
          className="min-h-[44px] min-w-[44px] gap-1.5"
        >
          <RotateCcw size={14} />
          <span>{t("common:retry")}</span>
        </Button>
      </div>
    ) : null;

  if (!staffProgress || periods.length === 0) {
    const isStaff = role !== "student";
    return (
      <div className="flex flex-col gap-4">
        {retainedErrorBanner}
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 text-center shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-strip text-muted">
            <BookOpen size={22} />
          </div>
          <div className="max-w-md">
            <h3 className="text-base font-semibold text-ink">
              {t("courses:progress.emptyPeriods")}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {isStaff
                ? t("courses:progress.emptyPeriodsHelpStaff")
                : t("courses:progress.emptyPeriodsHelp")}
            </p>
          </div>
          {courseId && isStaff ? (
            <Link
              to={buildCourseJournalUrl(courseId)}
              className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-maroon px-4 py-2.5 text-sm font-semibold text-on-primary shadow-xs hover:bg-maroon-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
            >
              <BookOpen size={16} />
              <span>{t("courses:openJournal")}</span>
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  if (allStudents.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {retainedErrorBanner}
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 text-center shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-strip text-muted">
            <BookOpen size={22} />
          </div>
          <div className="max-w-md">
            <h3 className="text-base font-semibold text-ink">
              {t("courses:progress.emptyStudents")}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {t("courses:progress.emptyStudentsHelp")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {retainedErrorBanner}

      <div className="rounded-2xl border border-border-warm bg-card p-4 sm:p-5 flex flex-col gap-4 shadow-xs">
        <div className="flex flex-col gap-2 md:hidden">
          <label htmlFor={phonePeriodSelectId} className="text-xs font-semibold text-muted">
            {t("courses:progress.selectPeriod")}
          </label>
          <select
            id={phonePeriodSelectId}
            value={activePeriodId ?? ""}
            onChange={(e) => handlePeriodChange(Number(e.target.value))}
            className="h-12 min-h-[48px] w-full rounded-xl border border-border bg-strip px-3 text-base text-ink focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.period_label} ({t("courses:progress.scheduled")})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-warm pb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">
              {t("courses:progress.title")}
            </h2>
            <p className="text-xs text-muted">
              {t("courses:progress.description")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <label htmlFor={filterId} className="sr-only">
                {t("courses:progress.searchLabel")}
              </label>
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                id={filterId}
                type="text"
                placeholder={t("courses:progress.searchPlaceholder")}
                aria-label={t("courses:progress.searchLabel")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 min-h-[48px] w-full rounded-xl border border-border bg-strip pl-10 pr-3 text-base md:text-sm text-ink placeholder:text-muted focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
              />
            </div>

            <div className="min-w-[180px] flex-1 sm:flex-initial">
              <label htmlFor={sortSelectId} className="sr-only">
                {t("courses:progress.sortLabel")}
              </label>
              <select
                id={sortSelectId}
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as ProgressSortOption)}
                aria-label={t("courses:progress.sortLabel")}
                className="h-12 min-h-[48px] w-full rounded-xl border border-border bg-strip px-3 text-base md:text-sm text-ink focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
              >
                <option value="score_desc">{t("courses:progress.sortScoreDesc")}</option>
                <option value="score_asc">{t("courses:progress.sortScoreAsc")}</option>
                <option value="name_asc">{t("courses:progress.sortNameAsc")}</option>
                <option value="name_desc">{t("courses:progress.sortNameDesc")}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums font-medium">
              {filteredStudents.length === allStudents.length
                ? t("courses:progress.allStudentsCount", {
                    count: formatNumber(allStudents.length, i18n.language),
                  })
                : t("courses:progress.filteredCount", {
                    shown: formatNumber(filteredStudents.length, i18n.language),
                    total: formatNumber(allStudents.length, i18n.language),
                  })}
            </span>
            {activePeriod ? (
              <span className="hidden md:inline text-muted font-normal">
                • {t("courses:progress.sortScopeNotice", { period: activePeriod.period_label })}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 text-muted">
            <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
            <span>{t("courses:progress.provenanceNotice")}</span>
          </div>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted">
              {t("courses:progress.noMatches", { query: searchQuery })}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSearchQuery("")}
              className="min-h-[44px] min-w-[44px]"
            >
              {t("courses:progress.resetSearch")}
            </Button>
          </div>
        ) : (
          <>
            <div
              tabIndex={0}
              role="region"
              aria-label={t("courses:progress.tableRegionLabel")}
              className="hidden md:block overflow-x-auto rounded-xl border border-border-warm bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
            >
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border-warm bg-strip/40 text-sm font-semibold text-muted">
                    <th
                      scope="col"
                      className="sticky left-0 z-10 w-60 min-w-[240px] max-w-[240px] border-r border-border-warm bg-card py-3.5 pl-4 pr-3 font-semibold text-ink"
                    >
                      {t("courses:progress.student")}
                    </th>
                    {periods.map((period) => {
                      const hasDates = Boolean(period.period_start && period.period_end);
                      const formattedDates = hasDates
                        ? `${formatDate(period.period_start, i18n.language)} – ${formatDate(period.period_end, i18n.language)}`
                        : null;

                      return (
                        <th
                          key={period.id}
                          scope="col"
                          className="min-w-[104px] px-3 py-3.5 text-center font-medium text-nav"
                        >
                          <span className="block text-sm font-semibold text-ink">
                            {period.period_label}
                          </span>
                          {formattedDates ? (
                            <span className="block text-[11px] text-muted tabular-nums">
                              {formattedDates}
                            </span>
                          ) : null}
                        </th>
                      );
                    })}
                    <th
                      scope="col"
                      className="min-w-[112px] border-l border-border-warm bg-strip/30 px-3 py-3.5 text-center font-semibold text-ink"
                    >
                      {t("courses:progress.summary")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 text-sm">
                  {sortedStudents.map((student) => (
                    <tr
                      key={student.student_id}
                      className="group min-h-[52px] hover:bg-row-hover motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 w-60 min-w-[240px] max-w-[240px] border-r border-border-warm bg-card py-2.5 pl-4 pr-3 font-normal group-hover:bg-row-hover motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 max-w-full">
                          <div className="shrink-0">
                            <PersonAvatar
                              firstName={student.first_name}
                              lastName={student.last_name}
                              size={28}
                            />
                          </div>
                          <Link
                            to={`/students/${student.student_id}`}
                            onClick={handleStudentDeparture}
                            className="min-h-[44px] min-w-0 flex-1 flex items-center text-sm font-medium text-ink hover:text-maroon-text motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out leading-snug break-words [overflow-wrap:anywhere] [word-break:break-word]"
                          >
                            <span className="min-w-0 break-words [overflow-wrap:anywhere] [word-break:break-word]">
                              {student.first_name} {student.last_name}
                            </span>
                          </Link>
                        </div>
                      </th>

                      {periods.map((period) => {
                        const res = student.period_results.find((r) => r.period_id === period.id);
                        const hasPercentage = typeof res?.percentage === "number";
                        const hasScore =
                          typeof res?.score === "number" && typeof res?.max_score === "number";
                        const isNonpositiveDenominator = hasScore && (res!.max_score as number) <= 0;

                        if (!res || res.grading_state === "missing") {
                          return (
                            <td
                              key={period.id}
                              className="min-w-[104px] px-3 py-2.5 text-center text-sm tabular-nums text-muted"
                            >
                              <span aria-label={t("courses:progress.unavailable")}>—</span>
                            </td>
                          );
                        }

                        if (!hasPercentage || isNonpositiveDenominator) {
                          return (
                            <td
                              key={period.id}
                              className="min-w-[104px] px-3 py-2.5 text-center"
                            >
                              <span
                                className="block text-sm font-semibold tabular-nums text-muted"
                                aria-label={t("courses:progress.unavailable")}
                              >
                                —
                              </span>
                              {hasScore ? (
                                <span
                                  className="block text-[11px] text-muted tabular-nums"
                                  aria-label={t("courses:progress.scoreOf", {
                                    score: formatNumber(res.score as number, i18n.language),
                                    max: formatNumber(res.max_score as number, i18n.language),
                                  })}
                                >
                                  {t("courses:progress.scoreRatio", {
                                    score: formatNumber(res.score as number, i18n.language),
                                    max: formatNumber(res.max_score as number, i18n.language),
                                  })}
                                </span>
                              ) : null}
                            </td>
                          );
                        }

                        return (
                          <td
                            key={period.id}
                            className="min-w-[104px] px-3 py-2.5 text-center"
                          >
                            <span className="block text-sm font-semibold tabular-nums text-ink">
                              {t("courses:progress.percentageValue", {
                                value: formatNumber(res.percentage as number, i18n.language),
                              })}
                            </span>
                            {hasScore ? (
                              <span
                                className="block text-[11px] text-muted tabular-nums"
                                aria-label={t("courses:progress.scoreOf", {
                                  score: formatNumber(res.score as number, i18n.language),
                                  max: formatNumber(res.max_score as number, i18n.language),
                                })}
                              >
                                {t("courses:progress.scoreRatio", {
                                  score: formatNumber(res.score as number, i18n.language),
                                  max: formatNumber(res.max_score as number, i18n.language),
                                })}
                              </span>
                            ) : null}
                          </td>
                        );
                      })}

                      <td
                        className="min-w-[112px] border-l border-border-warm bg-strip/30 px-3 py-2.5 text-center text-sm tabular-nums text-muted"
                        title={t("courses:progress.summaryUnavailable")}
                      >
                        <span aria-label={t("courses:progress.summaryUnavailable")}>—</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col divide-y divide-border rounded-xl border border-border-warm bg-card overflow-hidden md:hidden">
              {sortedStudents.map((student) => {
                const res = student.period_results.find((r) => r.period_id === activePeriodId);
                const hasPercentage = typeof res?.percentage === "number";
                const hasScore =
                  typeof res?.score === "number" && typeof res?.max_score === "number";
                const isNonpositiveDenominator = hasScore && (res!.max_score as number) <= 0;

                return (
                  <div
                    key={student.student_id}
                    className="flex min-h-[52px] items-center justify-between gap-3 p-3.5 hover:bg-strip/40 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
                  >
                    <Link
                      to={`/students/${student.student_id}`}
                      onClick={handleStudentDeparture}
                      className="flex min-h-[44px] items-center gap-3 min-w-0 flex-1 hover:text-maroon-text motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out break-words [overflow-wrap:anywhere] [word-break:break-word]"
                    >
                      <div className="shrink-0">
                        <PersonAvatar
                          firstName={student.first_name}
                          lastName={student.last_name}
                          size={36}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="break-words [overflow-wrap:anywhere] [word-break:break-word] text-base font-medium text-ink leading-snug">
                          {student.first_name} {student.last_name}
                        </p>
                      </div>
                    </Link>

                    <div className="flex flex-col items-end shrink-0 text-right">
                      {hasPercentage && !isNonpositiveDenominator ? (
                        <span className="text-base font-semibold tabular-nums text-ink">
                          {t("courses:progress.percentageValue", {
                            value: formatNumber(res!.percentage as number, i18n.language),
                          })}
                        </span>
                      ) : (
                        <span
                          className="text-base text-muted tabular-nums"
                          aria-label={t("courses:progress.unavailable")}
                        >
                          —
                        </span>
                      )}
                      {hasScore ? (
                        <span
                          className="text-xs text-muted tabular-nums"
                          aria-label={t("courses:progress.scoreOf", {
                            score: formatNumber(res!.score as number, i18n.language),
                            max: formatNumber(res!.max_score as number, i18n.language),
                          })}
                        >
                          {t("courses:progress.scoreRatio", {
                            score: formatNumber(res!.score as number, i18n.language),
                            max: formatNumber(res!.max_score as number, i18n.language),
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
