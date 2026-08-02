import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CourseProgressChartResponse } from "../../lib/courses/types";

interface JournalScoreChartProps {
  data: CourseProgressChartResponse | undefined;
}

const WIDTH = 1000;
const HEIGHT = 300;
const PADDING = { top: 20, right: 20, bottom: 32, left: 40 };
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;
const GRID_LINES = 4; // 5 ticks: 0, 25%, 50%, 75%, 100% of niceMax

/** Rounds a max value up to a "nice" round number so gridlines read cleanly (0/25/50/75/100-style spacing). */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function xFor(index: number, count: number): number {
  if (count <= 1) return PADDING.left + PLOT_WIDTH / 2;
  return PADDING.left + (index / (count - 1)) * PLOT_WIDTH;
}

function yFor(value: number, max: number): number {
  return PADDING.top + PLOT_HEIGHT - (value / max) * PLOT_HEIGHT;
}

export function JournalScoreChart({ data }: JournalScoreChartProps) {
  const { t } = useTranslation("journals");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hiddenStudents, setHiddenStudents] = useState<Set<number>>(new Set());

  const labels = useMemo(() => data?.labels ?? [], [data]);
  const datasets = useMemo(() => data?.datasets ?? [], [data]);

  const max = useMemo(() => {
    const allScores = datasets.flatMap((d) => d.scores);
    return niceCeil(Math.max(...allScores, 1));
  }, [datasets]);

  if (labels.length === 0 || datasets.length === 0) {
    return (
      <div className="rounded-xl border border-border-warm bg-card px-5 py-10 text-center text-sm text-muted">
        {t("chart.noData")}
      </div>
    );
  }

  const visibleDatasets = datasets.filter((d) => !hiddenStudents.has(d.student_id));
  const lastIndex = labels.length - 1;

  const toggleStudent = (studentId: number) => {
    setHiddenStudents((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const closest = labels.reduce(
      (best, _, i) => {
        const dist = Math.abs(xFor(i, labels.length) - relativeX);
        return dist < best.dist ? { index: i, dist } : best;
      },
      { index: 0, dist: Infinity },
    );
    setHoverIndex(closest.index);
  };

  const tooltipRows =
    hoverIndex !== null
      ? [...visibleDatasets]
          .map((d) => ({ name: d.name, color: d.color_hex, value: d.scores[hoverIndex] ?? 0 }))
          .sort((a, b) => b.value - a.value)
      : [];

  return (
    <div className="overflow-hidden rounded-xl border border-border-warm bg-card">
      <div className="border-b border-border-warm bg-strip px-5 py-3.5">
        <h3 className="text-[15px] font-semibold text-ink">{t("chart.title")}</h3>
      </div>

      <div className="relative p-5">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {/* Gridlines + y-axis labels */}
          {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
            const value = (max / GRID_LINES) * i;
            const y = yFor(value, max);
            return (
              <g key={i}>
                <line
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-border"
                  strokeDasharray="3 3"
                />
                <text x={PADDING.left - 8} y={y + 4} textAnchor="end" className="fill-muted text-[10px]">
                  {Math.round(value)}
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          {labels.map((label, i) => (
            <text
              key={i}
              x={xFor(i, labels.length)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-muted text-[10px]"
            >
              {i === lastIndex ? t("chart.average") : label}
            </text>
          ))}

          {/* Hover guideline */}
          {hoverIndex !== null && (
            <line
              x1={xFor(hoverIndex, labels.length)}
              x2={xFor(hoverIndex, labels.length)}
              y1={PADDING.top}
              y2={PADDING.top + PLOT_HEIGHT}
              stroke="currentColor"
              className="text-border-warm"
            />
          )}

          {/* Lines + points */}
          {visibleDatasets.map((dataset) => {
            const points = dataset.scores.map((score, i) => `${xFor(i, labels.length)},${yFor(score, max)}`);
            return (
              <g key={dataset.student_id}>
                <path d={`M ${points.join(" L ")}`} fill="none" stroke={dataset.color_hex} strokeWidth={2} />
                {dataset.scores.map((score, i) => (
                  <circle
                    key={i}
                    cx={xFor(i, labels.length)}
                    cy={yFor(score, max)}
                    r={hoverIndex === i ? 5 : 3}
                    fill={dataset.color_hex}
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {hoverIndex !== null && tooltipRows.length > 0 && (
          <div
            className="pointer-events-none absolute top-5 z-10 flex flex-col gap-0.5 rounded-lg border border-border-warm bg-card px-3 py-2 text-xs shadow-md"
            style={{
              left: `${(xFor(hoverIndex, labels.length) / WIDTH) * 100}%`,
              transform: "translateX(8px)",
            }}
          >
            {tooltipRows.map((row) => (
              <span key={row.name} className="font-medium" style={{ color: row.color }}>
                {row.name} — {row.value}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border-warm px-5 py-3.5">
        {datasets.map((dataset) => (
          <button
            key={dataset.student_id}
            type="button"
            onClick={() => toggleStudent(dataset.student_id)}
            className={`flex items-center gap-1.5 text-xs font-medium transition-opacity ${
              hiddenStudents.has(dataset.student_id) ? "opacity-40" : ""
            }`}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dataset.color_hex }} />
            <span className="text-ink">{dataset.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
