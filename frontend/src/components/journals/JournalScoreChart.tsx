import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Loader2 } from "lucide-react";
import type { CourseProgressChartResponse } from "../../lib/courses/types";

interface JournalScoreChartProps {
  data: CourseProgressChartResponse | undefined;
  isLoading?: boolean;
}

const COLOR_PALETTE = [
  "#2A78D6", // Blue
  "#E05252", // Red
  "#27AE60", // Green
  "#F2994A", // Orange
  "#9B51E0", // Purple
  "#2F80ED", // Sky Blue
  "#10B981", // Teal
  "#EC4899", // Pink
];

type SortMode = "avgDesc" | "name" | "latest";

export const JournalScoreChart: React.FC<JournalScoreChartProps> = ({ data, isLoading = false }) => {
  const { t } = useTranslation("journals");

  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("avgDesc");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Slice off the "Average" summary column from plotted periods if present
  const { periodLabels, studentStats, classAverageByPeriod, overallClassAvg } = useMemo(() => {
    if (!data || !data.datasets || data.datasets.length === 0) {
      return { periodLabels: [], studentStats: [], classAverageByPeriod: [], overallClassAvg: 0 };
    }

    const rawLabels = data.labels;
    const hasAverageLabel = rawLabels[rawLabels.length - 1]?.toLowerCase().includes("average") ||
      rawLabels[rawLabels.length - 1]?.toLowerCase().includes("среднее");

    const periodLabels = hasAverageLabel ? rawLabels.slice(0, -1) : rawLabels;

    const stats = data.datasets.map((ds, idx) => {
      const rawValues = ds.percentages || ds.scores || (ds as unknown as { values?: number[] }).values || [];
      const studentName = ds.name || (ds as unknown as { label?: string }).label || "";
      const values = hasAverageLabel ? rawValues.slice(0, -1) : rawValues;
      const averageValue = hasAverageLabel
        ? rawValues[rawValues.length - 1]
        : values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;

      return {
        studentId: ds.student_id,
        name: studentName,
        colorHex: ds.color_hex,
        values,
        averageValue,
        originalIndex: idx,
      };
    });

    const periodCount = periodLabels.length;
    const classAvgByPeriod: number[] = [];
    for (let p = 0; p < periodCount; p++) {
      let sum = 0;
      let count = 0;
      stats.forEach((s) => {
        if (s.values[p] !== undefined) {
          sum += s.values[p];
          count += 1;
        }
      });
      classAvgByPeriod.push(count > 0 ? sum / count : 0);
    }

    const totalAvgSum = stats.reduce((acc, s) => acc + s.averageValue, 0);
    const overallClassAvg = stats.length > 0 ? totalAvgSum / stats.length : 0;

    return {
      periodLabels,
      studentStats: stats,
      classAverageByPeriod: classAvgByPeriod,
      overallClassAvg,
    };
  }, [data]);

  // Color mapping: assign palette colors to top 8 by average, neutral to rest
  const colorMap = useMemo(() => {
    const map = new Map<number, string>();
    const topByAvg = [...studentStats].sort((a, b) => b.averageValue - a.averageValue);

    topByAvg.forEach((s, idx) => {
      if (s.colorHex) {
        map.set(s.studentId, s.colorHex);
      } else if (idx < COLOR_PALETTE.length) {
        map.set(s.studentId, COLOR_PALETTE[idx]);
      } else {
        map.set(s.studentId, "var(--color-dot-gray, #9CA3AF)");
      }
    });

    return map;
  }, [studentStats]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const matchesQuery = useMemo(() => {
    const set = new Set<number>();
    studentStats.forEach((s) => {
      if (!normalizedQuery || s.name.toLowerCase().includes(normalizedQuery)) {
        set.add(s.studentId);
      }
    });
    return set;
  }, [studentStats, normalizedQuery]);

  /** Roster shown inside the hover tooltip, ordered by the active sort mode. */
  const tooltipRows = useMemo(() => {
    const rows = studentStats.filter((s) => matchesQuery.has(s.studentId));

    if (sortMode === "avgDesc") {
      rows.sort((a, b) => b.averageValue - a.averageValue);
    } else if (sortMode === "name") {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "latest") {
      rows.sort((a, b) => {
        const lastA = a.values[a.values.length - 1] ?? 0;
        const lastB = b.values[b.values.length - 1] ?? 0;
        return lastB - lastA;
      });
    }

    return rows;
  }, [studentStats, matchesQuery, sortMode]);

  const yMax = useMemo(() => {
    let highest = 100;
    studentStats.forEach((s) => {
      s.values.forEach((v) => {
        if (v > highest) highest = v;
      });
    });
    return Math.ceil(highest / 10) * 10;
  }, [studentStats]);

  if (isLoading) {
    return (
      <div className="p-8 border border-border rounded-xl bg-card shadow-sm flex flex-col items-center justify-center text-muted gap-2 min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <p className="text-xs font-medium">{t("chart.loading")}</p>
      </div>
    );
  }

  if (!data || studentStats.length === 0) {
    return (
      <div className="p-8 border border-border rounded-xl bg-card shadow-sm flex flex-col items-center justify-center text-muted gap-2 min-h-[250px]">
        <p className="text-sm font-medium">{t("chart.noData")}</p>
      </div>
    );
  }

  const svgWidth = 900;
  const svgHeight = 300;
  const padding = { top: 20, right: 24, bottom: 36, left: 44 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const getX = (index: number) => {
    if (periodLabels.length <= 1) return padding.left + graphWidth / 2;
    return padding.left + (index / (periodLabels.length - 1)) * graphWidth;
  };

  const getY = (val: number) => {
    return padding.top + graphHeight - (val / yMax) * graphHeight;
  };

  const hoveredOnRightHalf = hoveredIndex !== null && hoveredIndex > (periodLabels.length - 1) / 2;

  return (
    <div
      className="border border-border rounded-xl bg-card shadow-sm"
      role="img"
      aria-label={t("chart.ariaSummary", { students: studentStats.length, periods: periodLabels.length })}
    >
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-ink">{t("chart.title")}</h3>
          <p className="text-[11px] text-muted mt-0.5">
            {t("chart.hoverHint", "Наведите на период, чтобы увидеть баллы всех студентов")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("chart.searchStudent")}
              className="pl-8 pr-3 py-1 text-xs border border-border rounded-lg bg-card text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent w-40"
            />
          </div>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            aria-label={t("chart.sortBy")}
            className="px-2.5 py-1 text-xs border border-border rounded-lg bg-card text-ink font-medium focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
          >
            <option value="avgDesc">{t("chart.sortAvgDesc")}</option>
            <option value="name">{t("chart.sortName")}</option>
            <option value="latest">{t("chart.sortLatest")}</option>
          </select>
        </div>
      </div>

      <div className="p-4 relative">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto select-none"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((tick) => {
            if (tick > yMax) return null;
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

          {/* Vertical guide for the hovered period */}
          {hoveredIndex !== null && (
            <line
              x1={getX(hoveredIndex)}
              y1={padding.top}
              x2={getX(hoveredIndex)}
              y2={padding.top + graphHeight}
              stroke="currentColor"
              strokeOpacity={0.25}
              strokeWidth={1}
            />
          )}

          {/* X-axis period labels */}
          {periodLabels.map((label, idx) => {
            const x = getX(idx);
            return (
              <text
                key={label}
                x={x}
                y={svgHeight - 10}
                textAnchor="middle"
                className={`text-[10px] font-medium ${hoveredIndex === idx ? "fill-ink" : "fill-muted"}`}
              >
                {label}
              </text>
            );
          })}

          {/* Class Average line */}
          {classAverageByPeriod.length > 0 && (
            <path
              d={classAverageByPeriod
                .map((val, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(val)}`)
                .join(" ")}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}

          {/* Student dataset lines */}
          {studentStats.map((student) => {
            const color = colorMap.get(student.studentId) || "#9CA3AF";
            const isMatch = matchesQuery.has(student.studentId);
            const opacity = normalizedQuery ? (isMatch ? 1 : 0.12) : 0.85;

            const points = student.values.map((val, i) => ({
              x: getX(i),
              y: getY(val),
            }));

            const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

            return (
              <g key={student.studentId} style={{ opacity, transition: "opacity 0.2s" }}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {points.map((p, i) => {
                  // Endpoints always anchor the line; the rest surface on hover.
                  const show = hoveredIndex === i || i === 0 || i === points.length - 1;
                  if (!show) return null;
                  return (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={hoveredIndex === i ? 4 : 3}
                      fill={color}
                      stroke="var(--color-card)"
                      strokeWidth={hoveredIndex === i ? 1.5 : 0}
                      className="transition-all"
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Hover overlay column trigger */}
          {periodLabels.map((_, idx) => {
            const colWidth = graphWidth / Math.max(1, periodLabels.length - 1);
            const x = getX(idx);
            return (
              <rect
                key={idx}
                x={x - colWidth / 2}
                y={padding.top}
                width={colWidth}
                height={graphHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(idx)}
              />
            );
          })}
        </svg>

        {/* Roster for the hovered period — replaces the old always-on side rail */}
        {hoveredIndex !== null && periodLabels[hoveredIndex] && (
          <div
            className={`absolute top-6 z-20 w-60 bg-card text-ink border border-border rounded-lg shadow-lg text-xs pointer-events-none ${
              hoveredOnRightHalf ? "-translate-x-full -ml-3" : "ml-3"
            }`}
            style={{ left: `${(getX(hoveredIndex) / svgWidth) * 100}%` }}
          >
            <div className="font-bold px-3 py-2 border-b border-border">
              {periodLabels[hoveredIndex]}
            </div>

            <div className="max-h-[220px] overflow-y-auto py-1">
              {tooltipRows.map((student) => {
                const color = colorMap.get(student.studentId) || "#9CA3AF";
                const val = student.values[hoveredIndex];
                const prev = hoveredIndex > 0 ? student.values[hoveredIndex - 1] : undefined;
                const delta = val !== undefined && prev !== undefined ? val - prev : undefined;

                return (
                  <div
                    key={student.studentId}
                    className="flex items-center justify-between gap-2 px-3 py-1"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate">{student.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                      <span className="font-semibold">
                        {val !== undefined ? `${val.toFixed(1)}%` : "—"}
                      </span>
                      {delta !== undefined && Math.abs(delta) >= 0.05 && (
                        <span
                          className={`text-[10px] font-medium ${
                            delta > 0 ? "text-emerald-500" : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {delta > 0 ? "+" : "−"}
                          {Math.abs(delta).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {tooltipRows.length === 0 && (
                <div className="px-3 py-2 text-muted">{t("chart.noMatches")}</div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-beige/50 rounded-b-lg font-semibold">
              <span className="text-muted">{t("chart.classAverage")}</span>
              <span className="tabular-nums text-accent">
                {classAverageByPeriod[hoveredIndex]?.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-3 flex items-center justify-end gap-2 text-xs">
        <span className="text-muted">{t("chart.classAverage")}</span>
        <span className="font-bold tabular-nums text-accent">{overallClassAvg.toFixed(1)}%</span>
      </div>

      {/* Accessible table fallback for screen readers */}
      <table className="sr-only">
        <caption>{t("chart.ariaSummary", { students: studentStats.length, periods: periodLabels.length })}</caption>
        <thead>
          <tr>
            <th>Student</th>
            {periodLabels.map((l) => (
              <th key={l}>{l}</th>
            ))}
            <th>Average</th>
          </tr>
        </thead>
        <tbody>
          {studentStats.map((s) => (
            <tr key={s.studentId}>
              <td>{s.name}</td>
              {s.values.map((v, i) => (
                <td key={i}>{v}%</td>
              ))}
              <td>{s.averageValue}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
