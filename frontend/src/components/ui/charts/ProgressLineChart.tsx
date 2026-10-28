import { useEffect, useId, useRef, useState } from "react";
import { MonotoneCurve } from "./MonotoneCurve";

export interface ProgressLineSeries {
  key: string;
  name: string;
  slot: number;
  values: (number | null)[];
  pointLabels: string[];
}

interface ProgressLineChartProps {
  series: ProgressLineSeries[];
  axisLabels: string[];
  chartLabel: string;
  keyboardHint: string;
  noValuesLabel: string;
  formatValue: (value: number) => string;
  formatAxisValue: (value: number) => string;
  describeEntry: (name: string, formattedValue: string) => string;
  showLegend?: boolean;
}

interface TooltipEntry {
  key: string;
  name: string;
  slot: number;
  value: number;
  pointLabel: string;
}

const SERIES_STROKE: readonly string[] = [
  "stroke-series-1", "stroke-series-2", "stroke-series-3", "stroke-series-4",
  "stroke-series-5", "stroke-series-6", "stroke-series-7", "stroke-series-8",
];
const SERIES_FILL: readonly string[] = [
  "fill-series-1", "fill-series-2", "fill-series-3", "fill-series-4",
  "fill-series-5", "fill-series-6", "fill-series-7", "fill-series-8",
];
const SERIES_BACKGROUND: readonly string[] = [
  "bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4",
  "bg-series-5", "bg-series-6", "bg-series-7", "bg-series-8",
];
const GRID_VALUES: readonly number[] = [0, 25, 50, 75, 100];
const GLIDE_EASING: string = "ease-[cubic-bezier(0.16,1,0.3,1)]";
const GLIDE_TRANSITION: string = `transition-opacity duration-150 ${GLIDE_EASING} motion-safe:transition-[transform,opacity]`;

export function ProgressLineChart({
  series,
  axisLabels,
  chartLabel,
  keyboardHint,
  noValuesLabel,
  formatValue,
  formatAxisValue,
  describeEntry,
  showLegend = true,
}: ProgressLineChartProps) {
  const hintId: string = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(640);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [lastIndex, setLastIndex] = useState<number>(0);

  useEffect(() => {
    const container: HTMLDivElement | null = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;
    const observer: ResizeObserver = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const periodCount: number = axisLabels.length;
  const compact: boolean = width < 520;
  const height: number = compact ? 220 : 260;
  const marginLeft: number = compact ? 34 : 40;
  const marginRight: number = compact ? 16 : 24;
  const marginTop: number = 16;
  const marginBottom: number = 30;
  const plotWidth: number = width - marginLeft - marginRight;
  const plotHeight: number = height - marginTop - marginBottom;
  const pointRadius: number = compact ? 3.5 : 3;
  const drawnMaximum: number = Math.max(0, ...series.flatMap((entry) => entry.values.filter((value): value is number => value !== null)));
  const domainMaximum: number = drawnMaximum > 100 ? Math.ceil(drawnMaximum / 25) * 25 : 100;
  const xFor = (index: number): number => (periodCount === 1 ? marginLeft + plotWidth / 2 : marginLeft + (plotWidth * index) / (periodCount - 1));
  const yFor = (value: number): number => marginTop + plotHeight * (1 - value / domainMaximum);
  const spacing: number = periodCount > 1 ? plotWidth / (periodCount - 1) : plotWidth;
  const labelStep: number = Math.max(1, Math.ceil((compact ? 56 : 72) / spacing));

  const entriesAt = (index: number): TooltipEntry[] =>
    series
      .flatMap((entry) => {
        const value: number | null | undefined = entry.values[index];
        return value === null || value === undefined
          ? []
          : [{ key: entry.key, name: entry.name, slot: entry.slot, value, pointLabel: entry.pointLabels[index] ?? "" }];
      })
      .sort((first, second) => second.value - first.value);

  const activate = (index: number | null): void => {
    setActiveIndex(index);
    if (index !== null) setLastIndex(index);
  };
  const moveTo = (index: number): void => activate(Math.min(Math.max(index, 0), periodCount - 1));
  const indexFromPointer = (clientX: number, element: Element): number => {
    const box: DOMRect = element.getBoundingClientRect();
    const ratio: number = box.width === 0 ? 0 : (clientX - box.left) / box.width;
    return Math.round(Math.min(Math.max(ratio, 0), 1) * (periodCount - 1));
  };

  const shownIndex: number = Math.min(lastIndex, periodCount - 1);
  const isActive: boolean = activeIndex !== null;
  const activeEntries: TooltipEntry[] = entriesAt(shownIndex);
  const narrow: boolean = width < 640;
  const tooltipWidth: number = narrow ? 188 : 248;
  const guideX: number = xFor(shownIndex);
  const flipped: boolean = narrow ? guideX > width / 2 : guideX + 12 + tooltipWidth > width - 4;
  const tooltipLeft: number = Math.min(
    Math.max(flipped ? guideX - 12 - tooltipWidth : guideX + 12, 0),
    Math.max(width - tooltipWidth, 0),
  );
  const liveSummary: string = !isActive
    ? ""
    : `${axisLabels[shownIndex]}: ${activeEntries.length === 0 ? noValuesLabel : activeEntries.map((entry) => describeEntry(entry.name, formatValue(entry.value))).join(", ")}`;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div ref={containerRef} className="relative min-w-0" data-testid="student-progress-chart">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="group"
          tabIndex={0}
          aria-label={chartLabel}
          aria-describedby={hintId}
          className="block max-w-full touch-pan-y overflow-visible rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") moveTo((activeIndex ?? -1) + 1);
            else if (event.key === "ArrowLeft") moveTo((activeIndex ?? periodCount) - 1);
            else if (event.key === "Home") moveTo(0);
            else if (event.key === "End") moveTo(periodCount - 1);
            else if (event.key === "Escape") activate(null);
            else return;
            event.preventDefault();
          }}
          onFocus={() => activate(activeIndex ?? periodCount - 1)}
          onBlur={() => activate(null)}
        >
          {GRID_VALUES.map((gridValue) => (
            <g key={gridValue}>
              <line
                x1={marginLeft}
                x2={width - marginRight}
                y1={yFor(gridValue)}
                y2={yFor(gridValue)}
                className="stroke-border"
                strokeWidth={1}
                strokeDasharray={gridValue === 0 ? undefined : "2 4"}
              />
              <text x={marginLeft - 8} y={yFor(gridValue) + 4} textAnchor="end" className="fill-muted tabular-nums" fontSize={11}>
                {formatAxisValue(gridValue)}
              </text>
            </g>
          ))}
          {axisLabels.map((label, index) =>
            index % labelStep === 0 ? (
              <text key={`${label}-${index}`} x={xFor(index)} y={height - 8} textAnchor="middle" className="fill-muted" fontSize={11}>
                {label}
              </text>
            ) : null,
          )}
          <line
            x1={0}
            x2={0}
            y1={marginTop}
            y2={marginTop + plotHeight}
            className={`stroke-muted ${GLIDE_TRANSITION}`}
            strokeWidth={1}
            data-testid="student-chart-crosshair"
            data-active={isActive}
            style={{ transform: `translateX(${guideX}px)`, opacity: isActive ? 1 : 0 }}
          />
          {series.map((entry) => (
            <g key={entry.key} data-testid="student-chart-series" data-series={entry.key} style={{ pointerEvents: "none" }}>
              {MonotoneCurve.splitIntoRuns(entry.values).map((run) =>
                run.length > 1 ? (
                  <path
                    key={run[0].index}
                    data-testid="student-chart-line"
                    d={MonotoneCurve.pathThrough(run.map((vertex) => ({ x: xFor(vertex.index), y: yFor(vertex.value) })))}
                    fill="none"
                    className={SERIES_STROKE[entry.slot % SERIES_STROKE.length]}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null,
              )}
              {entry.values.map((value, index) =>
                value === null ? null : (
                  <circle
                    key={index}
                    data-testid="student-chart-point"
                    cx={xFor(index)}
                    cy={yFor(value)}
                    r={pointRadius}
                    className={`${SERIES_FILL[entry.slot % SERIES_FILL.length]} stroke-card origin-center [transform-box:fill-box] motion-safe:transition-transform motion-safe:duration-150 ${GLIDE_EASING}`}
                    style={{ transform: activeIndex === index ? "scale(1.4)" : "scale(1)" }}
                    strokeWidth={1.5}
                  />
                ),
              )}
            </g>
          ))}
          <rect
            x={marginLeft}
            y={0}
            width={plotWidth}
            height={height}
            fill="transparent"
            onPointerMove={(event) => activate(indexFromPointer(event.clientX, event.currentTarget))}
            onPointerDown={(event) => activate(indexFromPointer(event.clientX, event.currentTarget))}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") activate(null);
            }}
          />
        </svg>
        <span id={hintId} className="sr-only">{keyboardHint}</span>
        <p role="status" className="sr-only">{liveSummary}</p>
        <div
          data-testid="student-chart-tooltip"
          data-active={isActive}
          aria-hidden="true"
          style={{ left: 0, top: marginTop, width: tooltipWidth, transform: `translateX(${tooltipLeft}px)`, opacity: isActive ? 1 : 0 }}
          className={`pointer-events-none absolute z-10 rounded-[10px] bg-card shadow-lg ring-1 ring-border ${narrow ? "p-2 text-xs" : "p-2.5 text-sm"} ${GLIDE_TRANSITION}`}
        >
          <div className="mb-1 text-xs font-semibold text-muted">{axisLabels[shownIndex]}</div>
          {activeEntries.length === 0 ? (
            <div className="text-xs text-muted">{noValuesLabel}</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {activeEntries.map((entry) => (
                <li key={entry.key} className="flex items-center gap-2 text-ink">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${SERIES_BACKGROUND[entry.slot % SERIES_BACKGROUND.length]}`} />
                  <span className="min-w-0 flex-1 truncate" title={entry.name}>{entry.name}</span>
                  {entry.pointLabel !== axisLabels[shownIndex] && entry.pointLabel !== "" ? (
                    <span className="text-xs text-muted">{entry.pointLabel}</span>
                  ) : null}
                  <span className="font-semibold tabular-nums">{formatValue(entry.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {showLegend ? <ul className="flex flex-wrap gap-x-4 gap-y-1.5" data-testid="student-chart-legend">
        {series.map((entry) => (
          <li key={entry.key} className="flex min-w-0 items-center gap-2 text-sm text-muted">
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${SERIES_BACKGROUND[entry.slot % SERIES_BACKGROUND.length]}`} />
            <span className="truncate" title={entry.name}>{entry.name}</span>
          </li>
        ))}
      </ul> : null}
    </div>
  );
}
