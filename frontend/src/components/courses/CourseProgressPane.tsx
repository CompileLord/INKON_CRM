import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { useCourseJournals, useCourseStaffProgress } from "../../lib/courses/hooks";
import { buildCourseJournalUrl } from "../../lib/courses/returnContext";
import { formatNumber, getActiveLocale, getSchoolCalendarDate } from "../../i18n/formatters";
import { JournalProgressRules } from "../../lib/journals/JournalProgressRules";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { Input } from "../ui/Input";
import { ListboxPicker, type ListboxOption } from "../ui/ListboxPicker";
import { usePeriodName } from "../ui/periodName";
import { ButtonLink } from "../profile/ButtonLink";
import { CourseDetailDeparture } from "./CourseDetailDeparture";
import { CourseProgressChartPanel } from "./CourseProgressChartPanel";
import { CourseProgressTable } from "./CourseProgressTable";
import type { StaffProgressPeriod, StaffProgressPeriodResult, StaffProgressStudent } from "../../lib/courses/types";

export type ProgressSortOption = "score_desc" | "score_asc" | "name_asc" | "name_desc";
export type SortOption = ProgressSortOption;

const SORT_OPTIONS: readonly ProgressSortOption[] = ["score_desc", "score_asc", "name_asc", "name_desc"];

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

class StudentRanking {
  static sort(students: StaffProgressStudent[], option: ProgressSortOption, periodId: number | undefined, locale: string): StaffProgressStudent[] {
    return [...students].sort((first: StaffProgressStudent, second: StaffProgressStudent) => {
      if (option === "name_asc" || option === "name_desc") {
        const comparison: number = `${first.first_name} ${first.last_name}`.trim().localeCompare(`${second.first_name} ${second.last_name}`.trim(), locale);
        if (comparison !== 0) return option === "name_asc" ? comparison : -comparison;
        return first.student_id - second.student_id;
      }
      const firstShare: number | null = StudentRanking.shareOf(first, periodId);
      const secondShare: number | null = StudentRanking.shareOf(second, periodId);
      if (firstShare === null && secondShare === null) return first.student_id - second.student_id;
      if (firstShare === null) return 1;
      if (secondShare === null) return -1;
      const difference: number = option === "score_desc" ? secondShare - firstShare : firstShare - secondShare;
      return difference !== 0 ? difference : first.student_id - second.student_id;
    });
  }

  private static shareOf(student: StaffProgressStudent, periodId: number | undefined): number | null {
    const result: StaffProgressPeriodResult | undefined = student.period_results.find((item: StaffProgressPeriodResult) => item.period_id === periodId);
    if (!result || typeof result.percentage !== "number" || typeof result.max_score !== "number" || result.max_score <= 0) return null;
    return result.percentage;
  }
}

function ProgressSkeleton() {
  return (
    <div data-progress-state="loading" aria-busy="true" className="flex flex-col divide-y divide-border">
      {[0, 1, 2, 3].map((row: number) => (
        <div key={row} className="flex items-center justify-between gap-3 px-3 py-3 motion-safe:animate-pulse">
          <div className="flex items-center gap-3">
            <div className="size-7 rounded-full bg-strip" />
            <div className="h-4 w-36 rounded bg-strip" />
          </div>
          <div className="h-4 w-20 rounded bg-strip" />
        </div>
      ))}
    </div>
  );
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
  const { t, i18n } = useTranslation("courseDetail");
  const { t: tCommon } = useTranslation("common");
  const periodName = usePeriodName();
  const role = useAuthStore((state) => state.role);

  const [internalSearchQuery, setInternalSearchQuery] = useState<string>("");
  const [internalSortOption, setInternalSortOption] = useState<ProgressSortOption>("score_desc");
  const [internalSelectedPeriodId, setInternalSelectedPeriodId] = useState<number | undefined>(undefined);

  const searchQuery: string = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = onSearchQueryChange ?? setInternalSearchQuery;
  const rawSort: ProgressSortOption = externalSortOption !== undefined ? externalSortOption : internalSortOption;
  const sortOption: ProgressSortOption = SORT_OPTIONS.includes(rawSort) ? rawSort : "score_desc";
  const setSortOption = onSortOptionChange ?? setInternalSortOption;

  const { data: staffProgress, isLoading, isError, refetch } = useCourseStaffProgress(courseId);

  useEffect(() => {
    if (!isLoading) onReady?.();
  }, [isLoading, onReady]);

  const periods: StaffProgressPeriod[] = useMemo(() => staffProgress?.periods ?? [], [staffProgress?.periods]);
  const allStudents: StaffProgressStudent[] = useMemo(() => staffProgress?.students ?? [], [staffProgress?.students]);
  const journalPeriodsQuery = useCourseJournals(courseId, role !== "student");
  const gradedDefaultId: number | undefined = journalPeriodsQuery.data
    ? JournalProgressRules.latestGradedPeriodId(journalPeriodsQuery.data, getSchoolCalendarDate())
    : undefined;
  const defaultPeriodId: number | undefined =
    gradedDefaultId !== undefined && periods.some((period: StaffProgressPeriod) => period.id === gradedDefaultId)
      ? gradedDefaultId
      : periods.length > 0
        ? periods[periods.length - 1].id
        : undefined;
  const knownPeriod = (periodId: number | undefined): boolean => periodId !== undefined && periods.some((period: StaffProgressPeriod) => period.id === periodId);
  const activePeriodId: number | undefined = knownPeriod(externalSelectedPeriodId) ? externalSelectedPeriodId : knownPeriod(internalSelectedPeriodId) ? internalSelectedPeriodId : defaultPeriodId;

  const visibleStudents: StaffProgressStudent[] = useMemo(() => {
    const query: string = searchQuery.trim().toLowerCase();
    const matching: StaffProgressStudent[] = query ? allStudents.filter((student: StaffProgressStudent) => `${student.first_name} ${student.last_name}`.toLowerCase().includes(query)) : allStudents;
    return StudentRanking.sort(matching, sortOption, activePeriodId, getActiveLocale(i18n.language));
  }, [allStudents, searchQuery, sortOption, activePeriodId, i18n.language]);

  const periodOptions: ListboxOption[] = periods.map((period: StaffProgressPeriod) => ({ value: String(period.id), label: periodName(period.period_label) }));
  const sortChoices: ListboxOption[] = SORT_OPTIONS.map((value: ProgressSortOption) => ({ value, label: t(`progress.sort.${value}`) }));
  const isStaff: boolean = role !== "student";

  const recordDeparture = (): void => {
    CourseDetailDeparture.record(courseId, { tab: "progress", periodId: activePeriodId, search: searchQuery, sort: sortOption });
  };

  const retainedError = isError && staffProgress ? (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-strip px-3 py-2 text-sm">
      <span className="text-destructive">{t("progress.loadError")}</span>
      <Button type="button" variant="secondary" onClick={() => refetch()}>{tCommon("retry")}</Button>
    </div>
  ) : null;

  const renderBody = () => {
    if (isLoading && !staffProgress) return <ProgressSkeleton />;
    if (isError && !staffProgress) return <ErrorState message={t("progress.loadError")} onRetry={() => refetch()} />;
    if (periods.length === 0) {
      return (
        <EmptyState
          title={t("progress.emptyPeriods")}
          description={isStaff ? t("progress.emptyPeriodsStaff") : t("progress.emptyPeriodsHelp")}
          action={isStaff ? <ButtonLink to={buildCourseJournalUrl(courseId)}>{t("openJournal")}</ButtonLink> : undefined}
        />
      );
    }
    if (allStudents.length === 0) return <EmptyState title={t("progress.emptyStudents")} description={t("progress.emptyStudentsHelp")} />;
    return (
      <>
        <CourseProgressChartPanel courseId={courseId} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[200px] flex-1 sm:max-w-sm">
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("progress.searchPlaceholder")}
              aria-label={t("progress.searchLabel")}
              leftAddon={<Search size={16} aria-hidden="true" />}
            />
          </div>
          <ListboxPicker
            label={t("progress.periodLabel")}
            ariaLabel={t("progress.periodLabel")}
            icon={null}
            options={periodOptions}
            value={activePeriodId !== undefined ? String(activePeriodId) : ""}
            onChange={(value: string) => {
              setInternalSelectedPeriodId(Number(value));
              onSelectedPeriodIdChange?.(Number(value));
            }}
          />
          <ListboxPicker
            label={t("progress.sortLabel")}
            ariaLabel={t("progress.sortLabel")}
            icon={null}
            options={sortChoices}
            value={sortOption}
            onChange={(value: string) => setSortOption(value as ProgressSortOption)}
            popupAlign="end"
          />
        </div>
        <p className="text-sm tabular-nums text-muted">
          {visibleStudents.length === allStudents.length
            ? t("progress.studentsCount", { count: allStudents.length, formatted: formatNumber(allStudents.length, i18n.language) })
            : t("progress.filteredCount", { shown: formatNumber(visibleStudents.length, i18n.language), total: formatNumber(allStudents.length, i18n.language) })}
        </p>
        {visibleStudents.length === 0 ? (
          <EmptyState
            title={t("progress.noMatches", { query: searchQuery })}
            action={<Button type="button" variant="secondary" onClick={() => setSearchQuery("")}>{t("progress.resetSearch")}</Button>}
          />
        ) : (
          <CourseProgressTable periods={periods} students={visibleStudents} activePeriodId={activePeriodId} onStudentOpen={recordDeparture} />
        )}
      </>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {retainedError}
      {renderBody()}
    </div>
  );
}
