import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { useCourseProgressChart } from "../../lib/courses/hooks";
import { CourseProgressChart, type SortOption, type ViewMode } from "./CourseProgressChart";
import { Button } from "../ui/Button";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";

interface CourseProgressPaneProps {
  courseId: number;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  sortOption?: SortOption;
  onSortOptionChange?: (sort: SortOption) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (view: ViewMode) => void;
  onReady?: () => void;
}

export function CourseProgressPane({
  courseId,
  searchQuery,
  onSearchQueryChange,
  sortOption,
  onSortOptionChange,
  viewMode,
  onViewModeChange,
  onReady,
}: CourseProgressPaneProps) {
  const { t } = useTranslation(["courses", "common"]);
  const {
    data: progressChart,
    isLoading,
    isError,
    refetch,
  } = useCourseProgressChart(courseId);

  useEffect(() => {
    if (!isLoading) {
      onReady?.();
    }
  }, [isLoading, onReady]);

  if (isLoading && !progressChart) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-14 rounded-2xl border border-border-warm bg-card p-4 flex items-center px-6">
          <BrandActivityIndicator size={20} />
        </div>
        <div className="h-80 rounded-2xl border border-border-warm bg-card p-6 flex flex-col justify-center items-center gap-3">
          <BrandActivityIndicator size={28} />
          <div className="h-4 w-32 rounded bg-strip motion-safe:animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError && !progressChart) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 text-center">
        <p className="text-sm text-destructive">
          {t("loadError")}
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

  if (!progressChart || !progressChart.datasets || progressChart.datasets.length === 0) {
    return (
      <div className="rounded-2xl border border-border-warm bg-card p-8 text-center text-muted">
        <p className="text-base font-semibold text-ink">
          {t("noProgressData")}
        </p>
        <p className="mt-1 text-sm text-muted">
          {t("noProgressSub")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isError && progressChart ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span>{t("loadError")}</span>
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
      ) : null}
      <CourseProgressChart
        data={progressChart}
        courseId={courseId}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        sortOption={sortOption}
        onSortOptionChange={onSortOptionChange}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
      />
    </div>
  );
}
