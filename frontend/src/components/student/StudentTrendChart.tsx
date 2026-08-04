import { useTranslation } from "react-i18next";
import type { StudentCourseProgressChartResponse } from "../../lib/courses/types";
import { StudentEmptyState } from "./StudentEmptyState";
import { TrendingUp } from "lucide-react";

interface StudentTrendChartProps {
  data: StudentCourseProgressChartResponse | undefined;
  isLoading?: boolean;
}

export function StudentTrendChart({ data, isLoading }: StudentTrendChartProps) {
  const { t } = useTranslation(["student", "common"]);

  if (isLoading) {
    return <div className="h-64 w-full rounded-2xl bg-card border border-border-warm animate-pulse" />;
  }

  const gradedCount = data?.class_avg_series
    ? data.class_avg_series.slice(0, data.periods?.length ?? 0).filter((val) => val > 0).length
    : 0;

  if (!data || !data.periods || gradedCount < 2 || !data.my_series || data.my_series.length < 2) {
    return (
      <StudentEmptyState
        icon={<TrendingUp size={24} />}
        title={t("notEnoughTrendTitle", "Недостаточно данных для графика")}
        body={t("notEnoughTrendBody", "График появится после завершения минимум 2 оценочных периодов.")}
      />
    );
  }

  const { periods, my_series, class_avg_series } = data;
  const myPoints = my_series.slice(0, periods.length);
  const classAvgPoints = class_avg_series.slice(0, periods.length);

  const svgWidth = 600;
  const svgHeight = 220;
  const padding = { top: 20, right: 30, bottom: 35, left: 40 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const getX = (index: number) => {
    if (periods.length <= 1) return padding.left + graphWidth / 2;
    return padding.left + (index / (periods.length - 1)) * graphWidth;
  };

  const getY = (val: number) => {
    const clamped = Math.min(100, Math.max(0, val));
    return padding.top + graphHeight - (clamped / 100) * graphHeight;
  };

  const myPathD = myPoints
    .map((val, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(val)}`)
    .join(" ");

  const classAvgPathD = classAvgPoints
    .map((val, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(val)}`)
    .join(" ");

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-warm bg-card p-5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-ink">{t("trendTitle", "Динамика успеваемости")}</h4>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-maroon dark:bg-accent" />
            <span className="text-muted">{t("myTrend", "Мой балл")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-muted border-t border-dashed" />
            <span className="text-muted">{t("classAvgTrend", "Средний по группе")}</span>
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto select-none">
          {/* Y grid lines */}
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={svgWidth - padding.right}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] fill-muted tabular-nums"
                >
                  {tick}%
                </text>
              </g>
            );
          })}

          {/* X axis labels */}
          {periods.map((p, idx) => {
            const x = getX(idx);
            return (
              <text
                key={p.id}
                x={x}
                y={svgHeight - 10}
                textAnchor="middle"
                className="text-[10px] fill-muted font-medium"
              >
                {p.period_label}
              </text>
            );
          })}

          {/* Class Avg path */}
          {classAvgPoints.length > 0 && (
            <path
              d={classAvgPathD}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.4}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          )}

          {/* My series path */}
          {myPoints.length > 0 && (
            <path
              d={myPathD}
              fill="none"
              className="stroke-maroon dark:stroke-accent"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* My points circles */}
          {myPoints.map((val, idx) => (
            <circle
              key={idx}
              cx={getX(idx)}
              cy={getY(val)}
              r={4}
              className="fill-maroon dark:fill-accent stroke-card"
              strokeWidth={2}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
