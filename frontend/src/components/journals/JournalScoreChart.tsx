import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, TrendingUp, TrendingDown, Minus, Eye, EyeOff, Loader2 } from "lucide-react";
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
  const [hiddenStudents, setHiddenStudents] = useState<Set<number>>(new Set());
  const [hoveredStudentId, setHoveredStudentId] = useState<number | null>(null);
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
      const rawValues = ds.values;
      const values = hasAverageLabel ? rawValues.slice(0, -1) : rawValues;
      const averageValue = hasAverageLabel
        ? rawValues[rawValues.length - 1]
        : values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;

      let trend: "up" | "down" | "flat" = "flat";
      let trendDelta = 0;
      if (values.length >= 2) {
        const last = values[values.length - 1];
        const prev = values[values.length - 2];
        trendDelta = last - prev;
        if (trendDelta >= 3) trend = "up";
        else if (trendDelta <= -3) trend = "down";
      }

      return {
        studentId: ds.student_id,
        name: ds.label,
        colorHex: ds.color_hex,
        values,
        averageValue,
        trend,
        trendDelta: Math.abs(trendDelta),
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

  // Sort and filter students for the rail
  const sortedStudents = useMemo(() => {
    let result = [...studentStats];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => s.name.toLowerCase().includes(q));
    }

    if (sortMode === "avgDesc") {
      result.sort((a, b) => b.averageValue - a.averageValue);
    } else if (sortMode === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "latest") {
      result.sort((a, b) => {
        const lastA = a.values[a.values.length - 1] ?? 0;
        const lastB = b.values[b.values.length - 1] ?? 0;
        return lastB - lastA;
      });
    }

    return result;
  }, [studentStats, searchQuery, sortMode]);

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
        map.set(s.studentId, "var(--color-border, #9CA3AF)");
      }
    });

    return map;
  }, [studentStats]);

  const visibleStats = useMemo(() => {
    return studentStats.filter((s) => !hiddenStudents.has(s.studentId));
  }, [studentStats, hiddenStudents]);

  const yMax = useMemo(() => {
    if (visibleStats.length === 0) return 100;
    let highest = 100;
    visibleStats.forEach((s) => {
      s.values.forEach((v) => {
        if (v > highest) highest = v;
      });
    });
    return Math.ceil(highest / 10) * 10;
  }, [visibleStats]);

  const toggleStudentVisibility = (studentId: number) => {
    setHiddenStudents((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 border border-border rounded-xl bg-card shadow-sm flex flex-col items-center justify-center text-muted-foreground gap-2 min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-xs font-medium">{t("chart.loading")}</p>
      </div>
    );
  }

  if (!data || studentStats.length === 0) {
    return (
      <div className="p-8 border border-border rounded-xl bg-card shadow-sm flex flex-col items-center justify-center text-muted-foreground gap-2 min-h-[250px]">
        <p className="text-sm font-medium">{t("chart.noData")}</p>
      </div>
    );
  }

  const svgWidth = 600;
  const svgHeight = 240;
  const padding = { top: 20, right: 30, bottom: 35, left: 40 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const getX = (index: number) => {
    if (periodLabels.length <= 1) return padding.left + graphWidth / 2;
    return padding.left + (index / (periodLabels.length - 1)) * graphWidth;
  };

  const getY = (val: number) => {
    return padding.top + graphHeight - (val / yMax) * graphHeight;
  };

  return (
    <div
      className="border border-border rounded-xl bg-card shadow-sm overflow-hidden"
      role="img"
      aria-label={t("chart.ariaSummary", { students: studentStats.length, periods: periodLabels.length })}
    >
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-base text-foreground">{t("chart.title")}</h3>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("chart.searchStudent")}
              className="pl-8 pr-3 py-1 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary w-40"
            />
          </div>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="px-2.5 py-1 text-xs border border-border rounded-lg bg-background font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="avgDesc">{t("chart.sortAvgDesc")}</option>
            <option value="name">{t("chart.sortName")}</option>
            <option value="latest">{t("chart.sortLatest")}</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Left rail / student list */}
        <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-border bg-muted/20 flex flex-col shrink-0">
          <div className="max-h-[280px] overflow-y-auto divide-y divide-border/50 p-2 space-y-1">
            {sortedStudents.map((student) => {
              const isHidden = hiddenStudents.has(student.studentId);
              const color = colorMap.get(student.studentId) || "#9CA3AF";
              const isHovered = hoveredStudentId === student.studentId;

              return (
                <button
                  key={student.studentId}
                  type="button"
                  onClick={() => toggleStudentVisibility(student.studentId)}
                  onMouseEnter={() => setHoveredStudentId(student.studentId)}
                  onMouseLeave={() => setHoveredStudentId(null)}
                  aria-pressed={!isHidden}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors ${
                    isHidden
                      ? "opacity-50 bg-transparent"
                      : isHovered
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 border"
                      style={{
                        backgroundColor: isHidden ? "transparent" : color,
                        borderColor: color,
                      }}
                    />
                    <span className="truncate font-medium">{student.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="font-semibold tabular-nums">
                      {student.averageValue.toFixed(1)}%
                    </span>

                    {student.trend === "up" && (
                      <TrendingUp className="w-3 h-3 text-emerald-500" title={t("chart.trendUp", { delta: student.trendDelta.toFixed(1) })} />
                    )}
                    {student.trend === "down" && (
                      <TrendingDown className="w-3 h-3 text-red-500" title={t("chart.trendDown", { delta: student.trendDelta.toFixed(1) })} />
                    )}
                    {student.trend === "flat" && (
                      <Minus className="w-3.5 h-3.5 text-muted-foreground" title={t("chart.trendFlat")} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-3 border-t border-border bg-card flex items-center justify-between text-xs font-semibold">
            <span className="text-muted-foreground">{t("chart.classAverage")}</span>
            <span className="tabular-nums text-primary">{overallClassAvg.toFixed(1)}%</span>
          </div>
        </div>

        {/* Right pane / Line chart */}
        <div className="flex-1 p-4 relative overflow-hidden flex flex-col justify-center">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto overflow-visible select-none"
            onMouseLeave={() => {
              setHoveredIndex(null);
            }}
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
                    className="text-[10px] fill-muted-foreground tabular-nums"
                  >
                    {tick}%
                  </text>
                </g>
              );
            })}

            {/* X-axis period labels */}
            {periodLabels.map((label, idx) => {
              const x = getX(idx);
              return (
                <text
                  key={label}
                  x={x}
                  y={svgHeight - 10}
                  textAnchor="middle"
                  className="text-[10px] fill-muted-foreground font-medium"
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
                strokeOpacity={0.3}
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            )}

            {/* Student dataset lines */}
            {visibleStats.map((student) => {
              const color = colorMap.get(student.studentId) || "#9CA3AF";
              const isHovered = hoveredStudentId === student.studentId;
              const opacity = hoveredStudentId !== null ? (isHovered ? 1 : 0.2) : 0.85;
              const strokeWidth = isHovered ? 3 : 2;

              const points = student.values.map((val, i) => ({
                x: getX(i),
                y: getY(val),
                val,
              }));

              const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

              return (
                <g key={student.studentId} style={{ opacity, transition: "opacity 0.2s" }}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {points.map((p, i) => {
                    const isPointHovered = hoveredIndex === i || i === 0 || i === points.length - 1;
                    if (!isPointHovered && !isHovered) return null;
                    return (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={isHovered ? 4 : 3}
                        fill={color}
                        className="transition-all"
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* Hover overlay column trigger */}
            {periodLabels.map((_, idx) => {
              const x = getX(idx);
              const colWidth = graphWidth / Math.max(1, periodLabels.length - 1);
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

          {/* Single focused tooltip */}
          {hoveredIndex !== null && periodLabels[hoveredIndex] && (
            <div
              className={`absolute top-6 z-20 bg-popover text-popover-foreground border border-border rounded-lg shadow-lg p-2.5 text-xs pointer-events-none transition-all duration-150 ${
                hoveredIndex > periodLabels.length / 2 ? "-translate-x-full -ml-3" : "ml-3"
              }`}
              style={{
                left: `${(getX(hoveredIndex) / svgWidth) * 100}%`,
              }}
            >
              <div className="font-bold border-b border-border pb-1 mb-1.5">
                {periodLabels[hoveredIndex]}
              </div>

              {hoveredStudentId !== null ? (
                (() => {
                  const s = studentStats.find((st) => st.studentId === hoveredStudentId);
                  if (!s) return null;
                  const val = s.values[hoveredIndex];
                  return (
                    <div className="space-y-1">
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-primary font-bold tabular-nums">
                        {val !== undefined ? `${val.toFixed(1)}%` : "—"}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="space-y-1">
                  <div className="text-muted-foreground">{t("chart.classAverage")}</div>
                  <div className="font-bold tabular-nums text-primary">
                    {classAverageByPeriod[hoveredIndex]?.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
