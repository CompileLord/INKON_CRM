import { useTranslation } from "react-i18next";
import { BookOpen, CalendarCheck, Percent, Users } from "lucide-react";
import type { CourseProgressChartResponse } from "../../lib/courses/types";

interface CourseDetailMetricsStripProps {
  enrolledCount: number;
  progressChart?: CourseProgressChartResponse;
}

export function CourseDetailMetricsStrip({
  enrolledCount,
  progressChart,
}: CourseDetailMetricsStripProps) {
  const { t } = useTranslation(["courses", "common"]);

  const totalPeriods = progressChart?.labels ? Math.max(0, progressChart.labels.length - 1) : 0;
  
  let classAveragePct = 0;
  let attendanceRatePct = 0;

  if (progressChart?.datasets && progressChart.datasets.length > 0) {
    let totalPcts = 0;
    let countPcts = 0;
    let nonZeroPeriods = 0;

    progressChart.datasets.forEach((dataset) => {
      if (dataset.percentages && dataset.percentages.length > 0) {
        const avgVal = dataset.percentages[dataset.percentages.length - 1];
        totalPcts += avgVal ?? 0;
        countPcts++;

        const periodPcts = dataset.percentages.slice(0, -1);
        periodPcts.forEach((p) => {
          if (p > 0) nonZeroPeriods++;
        });
      }
    });

    classAveragePct = countPcts > 0 ? Math.round(totalPcts / countPcts) : 0;
    
    const possibleCellCount = progressChart.datasets.length * totalPeriods;
    attendanceRatePct = possibleCellCount > 0 ? Math.round((nonZeroPeriods / possibleCellCount) * 100) : 0;
  }

  const labelClass = "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted";
  const valueClass = "mt-2 text-2xl font-bold text-ink";
  const cardClass = "flex flex-col justify-center rounded-2xl border border-border-warm bg-card px-5 py-4 transition-all duration-200";

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div className={cardClass}>
        <div className={labelClass}>
          <Users size={15} className="text-maroon dark:text-maroon-dark" />
          <span>{t("metrics.students", "Студенты")}</span>
        </div>
        <p className={valueClass}>
          {enrolledCount}{" "}
          <span className="text-sm font-normal text-muted">
            {t("metrics.enrolled", "зачислено")}
          </span>
        </p>
      </div>

      <div className={cardClass}>
        <div className={labelClass}>
          <Percent size={15} className="text-amber-600 dark:text-amber-400" />
          <span>{t("metrics.classAverage", "Средний балл")}</span>
        </div>
        <p className={valueClass}>
          {classAveragePct}%
        </p>
      </div>

      <div className={cardClass}>
        <div className={labelClass}>
          <CalendarCheck size={15} className="text-emerald-600 dark:text-emerald-400" />
          <span>{t("metrics.attendance", "Посещаемость")}</span>
        </div>
        <p className={valueClass}>
          {attendanceRatePct}%
        </p>
      </div>

      <div className={cardClass}>
        <div className={labelClass}>
          <BookOpen size={15} className="text-indigo-600 dark:text-indigo-400" />
          <span>{t("metrics.periods", "Периоды")}</span>
        </div>
        <p className={valueClass}>
          {totalPeriods}{" "}
          <span className="text-sm font-normal text-muted">
            {t("metrics.journalPeriods", "периодов")}
          </span>
        </p>
      </div>
    </div>
  );
}
