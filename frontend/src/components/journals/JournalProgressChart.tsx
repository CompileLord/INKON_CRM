import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  JournalProgressRules,
  type ProgressChartStudent,
  type ProgressPeriodRow,
  type ScoreDomain,
  type StoredPeriodResult,
} from "../../lib/journals/JournalProgressRules";
import { formatNumber, formatSchoolPeriodSpan } from "../../i18n/formatters";
import { usePeriodName } from "../ui/periodName";

export const SERIES_STROKE: readonly string[] = [
  "stroke-series-1", "stroke-series-2", "stroke-series-3", "stroke-series-4",
  "stroke-series-5", "stroke-series-6", "stroke-series-7", "stroke-series-8",
];
const SERIES_FILL: readonly string[] = [
  "fill-series-1", "fill-series-2", "fill-series-3", "fill-series-4",
  "fill-series-5", "fill-series-6", "fill-series-7", "fill-series-8",
];
export const SERIES_BACKGROUND: readonly string[] = [
  "bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4",
  "bg-series-5", "bg-series-6", "bg-series-7", "bg-series-8",
];

const GLIDE_TRANSITION: string = "transition-opacity duration-150 ease-out motion-safe:transition-[transform,opacity]";
const FADE_DURATION_MILLISECONDS: number = 150;
const FADE_EASING: string = "ease-out";
const SCORE_DIGITS: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

interface StudentSwatchProps {
  student: ProgressChartStudent;
  muted?: boolean;
}

export const StudentSwatch: React.FC<StudentSwatchProps> = ({ student, muted = false }) => {
  const dash: string | undefined = JournalProgressRules.dashPattern(student.dashVariant);
  if (dash === undefined) {
    return <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${muted ? "border border-muted" : SERIES_BACKGROUND[student.slot]}`} />;
  }
  return (
    <svg aria-hidden="true" width="14" height="2" viewBox="0 0 14 2" className="shrink-0" data-testid="swatch-dashed">
      <line x1="0" x2="14" y1="1" y2="1" strokeWidth={2} strokeDasharray={dash} className={muted ? "stroke-muted" : SERIES_STROKE[student.slot]} />
    </svg>
  );
};

export const AverageSwatch: React.FC = () => <span aria-hidden="true" className="h-0 w-4 shrink-0 border-t-2 border-dashed border-muted" />;
export const MaximumSwatch: React.FC = () => <span aria-hidden="true" className="h-0 w-4 shrink-0 border-t-2 border-ink/50" />;

interface TooltipEntry {
  key: string;
  name: string;
  value: number;
  label: string;
  swatch: React.ReactNode;
}

interface ProgressChartProps {
  periods: ProgressPeriodRow[];
  students: ProgressChartStudent[];
  visibleIds: Set<number>;
  showAverage: boolean;
  showMaximum: boolean;
  selfStudentId: number | null;
}

export const ProgressChart: React.FC<ProgressChartProps> = ({ periods, students, visibleIds, showAverage, showMaximum, selfStudentId }) => {
  const { t } = useTranslation("journals");
  const periodName: (label: string) => string = usePeriodName();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(640);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [lastIndex, setLastIndex] = useState<number>(0);
  const linesRef = useRef<SVGGElement>(null);
  const fadeRef = useRef<Animation | null>(null);

  useEffect(() => {
    const container: HTMLDivElement | null = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;
    const observer: ResizeObserver = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const dataSignature: string = periods.map((row) => `${row.period.id}:${row.averageScore}:${row.maxScore}`).join("|") + students.map((student) => student.studentId).join(",");

  useEffect(() => {
    const lines: SVGGElement | null = linesRef.current;
    if (!lines || typeof lines.animate !== "function") return undefined;
    fadeRef.current?.cancel();
    fadeRef.current = lines.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE_DURATION_MILLISECONDS,
      easing: FADE_EASING,
    });
    return () => {
      fadeRef.current?.cancel();
      fadeRef.current = null;
    };
  }, [dataSignature]);

  const compact: boolean = width < 520;
  const height: number = compact ? 280 : 300;
  const marginLeft: number = compact ? 34 : 42;
  const marginRight: number = compact ? 16 : 24;
  const marginTop: number = 16;
  const marginBottom: number = 30;
  const plotWidth: number = width - marginLeft - marginRight;
  const plotHeight: number = height - marginTop - marginBottom;
  const pointRadius: number = compact ? 3.5 : 3;
  const visibleStudents: ProgressChartStudent[] = students.filter((student) => visibleIds.has(student.studentId));
  const averageValues: (number | null)[] = periods.map((row) => row.averageScore);
  const maximumValues: (number | null)[] = periods.map((row) => row.maxScore);
  const drawn: (number | null)[] = [
    ...(showMaximum ? maximumValues : []),
    ...(showAverage ? averageValues : []),
    ...visibleStudents.flatMap((student) => student.results.map((result) => (result ? result.score : null))),
  ];
  const presentMaximums: number[] = maximumValues.filter((value): value is number => value !== null);
  const domain: ScoreDomain = JournalProgressRules.fittedDomain(drawn, presentMaximums.length > 0 ? Math.max(...presentMaximums) : null);
  const ticks: number[] = JournalProgressRules.domainTicks(domain);
  const xFor = (index: number): number =>
    periods.length === 1 ? marginLeft + plotWidth / 2 : marginLeft + (plotWidth * index) / (periods.length - 1);
  const yFor = (value: number): number => marginTop + plotHeight * (1 - (value - domain.lower) / (domain.upper - domain.lower));
  const spacing: number = periods.length > 1 ? plotWidth / (periods.length - 1) : plotWidth;
  const labelStep: number = Math.max(1, Math.ceil((compact ? 64 : 84) / spacing));
  const formatScore = (value: number): string => formatNumber(value, undefined, SCORE_DIGITS);

  const entriesAt = (index: number): TooltipEntry[] => {
    const entries: TooltipEntry[] = visibleStudents.flatMap((student) => {
      const result: StoredPeriodResult | null = student.results[index];
      return result
        ? [{
            key: `s${student.studentId}`,
            name: student.studentId === selfStudentId ? `${student.name} (${t("readOnly.you")})` : student.name,
            value: result.score,
            label: formatScore(result.score),
            swatch: <StudentSwatch student={student} />,
          }]
        : [];
    });
    const average: number | null = averageValues[index];
    const averageEntry: TooltipEntry | null =
      showAverage && average !== null
        ? { key: "average", name: t("progress.classAverage"), value: average, label: formatScore(average), swatch: <AverageSwatch /> }
        : null;
    const ranked: TooltipEntry[] = entries.sort((first, second) => second.value - first.value);
    return averageEntry === null ? ranked : [...ranked, averageEntry];
  };

  const activate = (index: number | null): void => {
    setActiveIndex(index);
    if (index !== null) setLastIndex(index);
  };
  const moveTo = (index: number): void => activate(Math.min(Math.max(index, 0), periods.length - 1));
  const indexFromPointer = (clientX: number, element: Element): number => {
    const box: DOMRect = element.getBoundingClientRect();
    const ratio: number = box.width === 0 ? 0 : (clientX - box.left) / box.width;
    return Math.round(Math.min(Math.max(ratio, 0), 1) * (periods.length - 1));
  };

  const shownIndex: number = Math.min(lastIndex, periods.length - 1);
  const isActive: boolean = activeIndex !== null;
  const activeEntries: TooltipEntry[] = entriesAt(shownIndex);
  const narrow: boolean = width < 640;
  const tooltipWidth: number = narrow ? 192 : 252;
  const guideX: number = xFor(shownIndex);
  const flipped: boolean = narrow ? guideX > width / 2 : guideX + 12 + tooltipWidth > width - 4;
  const tooltipLeft: number = Math.min(
    Math.max(flipped ? guideX - 12 - tooltipWidth : guideX + 12, 0),
    Math.max(width - tooltipWidth, 0),
  );
  const shownLabel: string = periodName(periods[shownIndex].period.period_label);
  const shownSpan: string = formatSchoolPeriodSpan(periods[shownIndex].period.period_start, periods[shownIndex].period.period_end);
  const sharedMaximum: number | null =
    presentMaximums.length > 0 && presentMaximums.every((value) => value === presentMaximums[0]) ? presentMaximums[0] : null;
  const liveSummary: string = !isActive
    ? ""
    : `${shownLabel}: ${
        activeEntries.length === 0
          ? t("progress.chart.noValues")
          : activeEntries.map((entry) => t("progress.chart.entry", { name: entry.name, value: entry.label })).join(", ")
      }`;

  return (
    <div ref={containerRef} className="relative min-w-0" data-testid="progress-chart">
      <p data-testid="progress-axis-label" className="mb-1 text-xs text-muted">{t("progress.axisLabel")}</p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="group"
        tabIndex={0}
        aria-label={t("progress.chart.label")}
        aria-describedby="progress-chart-hint"
        className="block max-w-full touch-pan-y overflow-visible rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") moveTo((activeIndex ?? -1) + 1);
          else if (event.key === "ArrowLeft") moveTo((activeIndex ?? periods.length) - 1);
          else if (event.key === "Home") moveTo(0);
          else if (event.key === "End") moveTo(periods.length - 1);
          else if (event.key === "Escape") activate(null);
          else return;
          event.preventDefault();
        }}
        onFocus={() => activate(activeIndex ?? periods.length - 1)}
        onBlur={() => activate(null)}
      >
        {ticks.map((gridValue) => (
          <g key={gridValue}>
            <line
              x1={marginLeft}
              x2={width - marginRight}
              y1={yFor(gridValue)}
              y2={yFor(gridValue)}
              className="stroke-border"
              strokeOpacity={gridValue === domain.lower ? 1 : 0.5}
              strokeWidth={1}
              strokeDasharray={gridValue === domain.lower ? undefined : "2 4"}
              data-testid="chart-gridline"
              data-value={gridValue}
            />
            <text x={marginLeft - 8} y={yFor(gridValue) + 4} textAnchor="end" className="fill-muted tabular-nums" fontSize={11}>
              {formatNumber(gridValue)}
            </text>
          </g>
        ))}
        {periods.map((row, index) =>
          index % labelStep === 0 ? (
            <text key={row.period.id} x={xFor(index)} y={height - 8} textAnchor="middle" className="fill-muted" fontSize={11}>
              {periodName(row.period.period_label)}
            </text>
          ) : null,
        )}
        {showMaximum && sharedMaximum !== null && (
          <text x={width - marginRight} y={yFor(sharedMaximum) - 6} textAnchor="end" className="fill-muted tabular-nums" fontSize={11} data-testid="chart-maximum-label">
            {t("progress.chart.maximumLabel", { max: formatScore(sharedMaximum) })}
          </text>
        )}
        <line
          x1={0}
          x2={0}
          y1={marginTop}
          y2={marginTop + plotHeight}
          className={`stroke-muted ${GLIDE_TRANSITION}`}
          strokeWidth={1}
          data-testid="chart-crosshair"
          data-active={isActive}
          style={{ transform: `translateX(${guideX}px)`, opacity: isActive ? 1 : 0 }}
        />
        <g ref={linesRef} data-testid="chart-lines">
          <g
            data-testid="chart-series-maximum"
            data-visible={showMaximum}
            aria-hidden={!showMaximum}
            className="transition-opacity duration-150 ease-out"
            style={{ opacity: showMaximum ? 1 : 0 }}
          >
            {JournalProgressRules.lineRuns(maximumValues).map((run) => (
              <path
                key={run[0].index}
                data-testid="chart-maximum-line"
                d={JournalProgressRules.stepPath(run.map((vertex) => ({ x: xFor(vertex.index), y: yFor(vertex.value) })), marginLeft, width - marginRight)}
                fill="none"
                className="stroke-ink"
                strokeOpacity={0.5}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            ))}
          </g>
          <g
            data-testid="chart-series-average"
            data-visible={showAverage}
            aria-hidden={!showAverage}
            className="transition-opacity duration-150 ease-out"
            style={{ opacity: showAverage ? 1 : 0 }}
          >
            {JournalProgressRules.lineRuns(averageValues).map((run) =>
              run.length > 1 ? (
                <path
                  key={run[0].index}
                  data-testid="chart-line"
                  d={JournalProgressRules.monotonePath(run.map((vertex) => ({ x: xFor(vertex.index), y: yFor(vertex.value) })))}
                  fill="none"
                  className="stroke-muted"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                />
              ) : null,
            )}
          </g>
          {students.map((student) => {
            const visible: boolean = visibleIds.has(student.studentId);
            const scores: (number | null)[] = student.results.map((result) => (result ? result.score : null));
            return (
              <g
                key={student.studentId}
                data-testid="chart-series-student"
                data-student-id={student.studentId}
                data-visible={visible}
                aria-hidden={!visible}
                className="transition-opacity duration-150 ease-out"
                style={{ opacity: visible ? 1 : 0, pointerEvents: "none" }}
              >
                {JournalProgressRules.lineRuns(scores).map((run) =>
                  run.length > 1 ? (
                    <path
                      key={run[0].index}
                      data-testid="chart-line"
                      d={JournalProgressRules.monotonePath(run.map((vertex) => ({ x: xFor(vertex.index), y: yFor(vertex.value) })))}
                      fill="none"
                      className={SERIES_STROKE[student.slot]}
                      strokeWidth={student.studentId === selfStudentId ? 3.5 : 2}
                      strokeDasharray={JournalProgressRules.dashPattern(student.dashVariant)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null,
                )}
                {scores.map((value, index) =>
                  value === null ? null : (
                    <circle
                      key={periods[index].period.id}
                      data-testid="chart-point"
                      data-value={value}
                      cx={xFor(index)}
                      cy={yFor(value)}
                      r={pointRadius}
                      className={`${SERIES_FILL[student.slot]} stroke-card origin-center [transform-box:fill-box] motion-safe:transition-transform motion-safe:duration-150 ease-out`}
                      style={{ transform: activeIndex === index ? "scale(1.4)" : "scale(1)" }}
                      strokeWidth={1.5}
                    />
                  ),
                )}
              </g>
            );
          })}
          {showAverage &&
            averageValues.map((value, index) =>
              value === null || activeIndex !== index ? null : (
                <circle key={periods[index].period.id} cx={xFor(index)} cy={yFor(value)} r={pointRadius * 1.4} className="fill-muted stroke-card" strokeWidth={1.5} />
              ),
            )}
        </g>
        <rect
          x={marginLeft}
          y={0}
          width={plotWidth}
          height={height}
          fill="transparent"
          data-testid="chart-hit-area"
          onPointerMove={(event) => activate(indexFromPointer(event.clientX, event.currentTarget))}
          onPointerDown={(event) => activate(indexFromPointer(event.clientX, event.currentTarget))}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") activate(null);
          }}
        />
      </svg>
      <span id="progress-chart-hint" className="sr-only">
        {t("progress.chart.hint")}
      </span>
      <p role="status" className="sr-only" data-testid="chart-live">
        {liveSummary}
      </p>
      <div
        data-testid="chart-tooltip"
        data-active={isActive}
        data-side={flipped ? "left" : "right"}
        aria-hidden="true"
        style={{ left: 0, top: marginTop, width: tooltipWidth, transform: `translateX(${tooltipLeft}px)`, opacity: isActive ? 1 : 0 }}
        className={`pointer-events-none absolute z-10 rounded-[10px] bg-card shadow-lg ring-1 ring-border ${narrow ? "p-2 text-xs" : "p-2.5 text-sm"} ${GLIDE_TRANSITION}`}
      >
        <div className="mb-1 text-xs font-semibold text-muted" data-testid="chart-tooltip-period">{shownSpan}</div>
        {activeEntries.length === 0 ? (
          <div className="text-xs text-muted">{t("progress.chart.noValues")}</div>
        ) : (
          <ul className="flex flex-col gap-1">
            {activeEntries.map((entry) => (
              <li key={entry.key} data-testid="chart-tooltip-entry" className="flex items-center gap-2 text-ink">
                {entry.swatch}
                <span className="min-w-0 flex-1 break-words" title={entry.name}>{entry.name}</span>
                <span className="font-semibold tabular-nums" data-testid="chart-tooltip-score">{entry.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
