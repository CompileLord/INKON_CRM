import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCourseStaffProgress } from "../../lib/courses/hooks";
import type { CourseStaffProgressResponse } from "../../lib/courses/types";
import {
  JournalProgressRules,
  type ProgressChartStudent,
  type ProgressPeriodRow,
  type StoredPeriodResult,
} from "../../lib/journals/JournalProgressRules";
import { formatNumber, formatPercentage, formatSchoolLessonDate, getSchoolCalendarDate } from "../../i18n/formatters";
import { useDesktop } from "../shell/useDesktop";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";
import { InfoTooltip } from "../ui/InfoTooltip";
import { JournalNotice, JournalPanelMessage } from "./JournalWorkspaceStates";

interface JournalProgressViewProps {
  courseId: number;
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

const CHART_GRID_VALUES: readonly number[] = [0, 25, 50, 75, 100];
const GLIDE_EASING: string = "ease-[cubic-bezier(0.16,1,0.3,1)]";
const GLIDE_TRANSITION: string = `transition-opacity duration-150 ${GLIDE_EASING} motion-safe:transition-[transform,opacity]`;
const FADE_DURATION_MILLISECONDS: number = 200;
const FADE_EASING: string = "cubic-bezier(0.16, 1, 0.3, 1)";

interface StudentSwatchProps {
  student: ProgressChartStudent;
  muted?: boolean;
}

const StudentSwatch: React.FC<StudentSwatchProps> = ({ student, muted = false }) => {
  const dash: string | undefined = JournalProgressRules.dashPattern(student.dashVariant);
  if (dash === undefined) {
    return <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${muted ? "border border-muted" : SERIES_BACKGROUND[student.slot]}`} />;
  }
  return (
    <svg aria-hidden="true" width="18" height="10" className="shrink-0" data-testid="swatch-dashed">
      <line x1="1" x2="17" y1="5" y2="5" strokeWidth={2} strokeDasharray={dash} className={muted ? "stroke-muted" : SERIES_STROKE[student.slot]} />
      <circle cx="9" cy="5" r="2.5" className={muted ? "fill-muted" : SERIES_FILL[student.slot]} />
    </svg>
  );
};

interface TooltipEntry {
  key: string;
  name: string;
  value: number;
  swatch: React.ReactNode;
}

interface ProgressChartProps {
  periods: ProgressPeriodRow[];
  students: ProgressChartStudent[];
  visibleIds: Set<number>;
  showAverage: boolean;
}

const ProgressChart: React.FC<ProgressChartProps> = ({ periods, students, visibleIds, showAverage }) => {
  const { t } = useTranslation("journals");
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

  const dataSignature: string = periods.map((row) => `${row.period.id}:${row.averagePercentage}`).join("|") + students.map((student) => student.studentId).join(",");

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
  const height: number = compact ? 240 : 300;
  const marginLeft: number = compact ? 30 : 38;
  const marginRight: number = compact ? 16 : 24;
  const marginTop: number = 16;
  const marginBottom: number = 30;
  const plotWidth: number = width - marginLeft - marginRight;
  const plotHeight: number = height - marginTop - marginBottom;
  const pointRadius: number = compact ? 3.5 : 3;
  const visibleStudents: ProgressChartStudent[] = students.filter((student) => visibleIds.has(student.studentId));
  const averageValues: (number | null)[] = periods.map((row) => row.averagePercentage);
  const drawn: (number | null)[] = [
    ...(showAverage ? averageValues : []),
    ...visibleStudents.flatMap((student) => student.results.map((result) => (result ? result.percentage : null))),
  ];
  const domainMaximum: number = JournalProgressRules.domainMaximum(drawn);
  const xFor = (index: number): number =>
    periods.length === 1 ? marginLeft + plotWidth / 2 : marginLeft + (plotWidth * index) / (periods.length - 1);
  const yFor = (value: number): number => marginTop + plotHeight * (1 - value / domainMaximum);
  const spacing: number = periods.length > 1 ? plotWidth / (periods.length - 1) : plotWidth;
  const labelStep: number = Math.max(1, Math.ceil((compact ? 64 : 84) / spacing));

  const entriesAt = (index: number): TooltipEntry[] => {
    const entries: TooltipEntry[] = visibleStudents.flatMap((student) => {
      const result: StoredPeriodResult | null = student.results[index];
      return result
        ? [{
            key: `s${student.studentId}`,
            name: student.name,
            value: result.percentage,
            swatch: <StudentSwatch student={student} />,
          }]
        : [];
    });
    const average: number | null = averageValues[index];
    if (showAverage && average !== null) {
      entries.push({
        key: "average",
        name: t("progress.classAverage"),
        value: average,
        swatch: <span aria-hidden="true" className="h-0 w-3 shrink-0 border-t-2 border-dashed border-muted" />,
      });
    }
    return entries.sort((first, second) => second.value - first.value);
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
  const tooltipWidth: number = narrow ? 168 : 244;
  const guideX: number = xFor(shownIndex);
  const flipped: boolean = narrow ? guideX > width / 2 : guideX + 12 + tooltipWidth > width - 4;
  const tooltipLeft: number = Math.min(
    Math.max(flipped ? guideX - 12 - tooltipWidth : guideX + 12, 0),
    Math.max(width - tooltipWidth, 0),
  );
  const liveSummary: string = !isActive
    ? ""
    : `${periods[shownIndex].period.period_label}: ${
        activeEntries.length === 0
          ? t("progress.chart.noValues")
          : activeEntries.map((entry) => t("progress.chart.entry", { name: entry.name, value: formatPercentage(entry.value) })).join(", ")
      }`;

  return (
    <div ref={containerRef} className="relative min-w-0" data-testid="progress-chart">
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
        {CHART_GRID_VALUES.map((gridValue) => (
          <g key={gridValue}>
            <line
              x1={marginLeft}
              x2={width - marginRight}
              y1={yFor(gridValue)}
              y2={yFor(gridValue)}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray={gridValue === 0 ? undefined : "2 4"}
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
              {row.period.period_label}
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
          data-testid="chart-crosshair"
          data-active={isActive}
          style={{ transform: `translateX(${guideX}px)`, opacity: isActive ? 1 : 0 }}
        />
        <g ref={linesRef} data-testid="chart-lines">
          <g
            data-testid="chart-series-average"
            data-visible={showAverage}
            aria-hidden={!showAverage}
            className="transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
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
          const percentages: (number | null)[] = student.results.map((result) => (result ? result.percentage : null));
          return (
            <g
              key={student.studentId}
              data-testid="chart-series-student"
              data-student-id={student.studentId}
              data-visible={visible}
              aria-hidden={!visible}
              className="transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ opacity: visible ? 1 : 0, pointerEvents: "none" }}
            >
              {JournalProgressRules.lineRuns(percentages).map((run) =>
                run.length > 1 ? (
                  <path
                    key={run[0].index}
                    data-testid="chart-line"
                    d={JournalProgressRules.monotonePath(run.map((vertex) => ({ x: xFor(vertex.index), y: yFor(vertex.value) })))}
                    fill="none"
                    className={SERIES_STROKE[student.slot]}
                    strokeWidth={2}
                    strokeDasharray={JournalProgressRules.dashPattern(student.dashVariant)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null,
              )}
              {percentages.map((value, index) =>
                value === null ? null : (
                  <circle
                    key={periods[index].period.id}
                    data-testid="chart-point"
                    data-value={value}
                    cx={xFor(index)}
                    cy={yFor(value)}
                    r={pointRadius}
                    className={`${SERIES_FILL[student.slot]} stroke-card origin-center [transform-box:fill-box] motion-safe:transition-transform motion-safe:duration-150 ${GLIDE_EASING}`}
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
        <div className="mb-1 text-xs font-semibold text-muted">{periods[shownIndex].period.period_label}</div>
        {activeEntries.length === 0 ? (
          <div className="text-xs text-muted">{t("progress.chart.noValues")}</div>
        ) : (
          <ul className="flex flex-col gap-1">
            {activeEntries.map((entry) => (
              <li key={entry.key} data-testid="chart-tooltip-entry" className="flex items-center gap-2 text-ink">
                {entry.swatch}
                <span className="min-w-0 flex-1 truncate" title={entry.name}>{entry.name}</span>
                <span className="font-semibold tabular-nums">{formatPercentage(entry.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

interface MoreStudentsMenuProps {
  students: ProgressChartStudent[];
  hiddenCount: number;
  visibleIds: Set<number>;
  onToggle: (studentId: number) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  showBulkActions: boolean;
  chipClassName: string;
}

const MoreStudentsMenu: React.FC<MoreStudentsMenuProps> = ({
  students,
  hiddenCount,
  visibleIds,
  onToggle,
  onShowAll,
  onHideAll,
  showBulkActions,
  chipClassName,
}) => {
  const { t } = useTranslation("journals");
  const [open, setOpen] = useState<boolean>(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event: PointerEvent): void => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  const firstSelectedIndex: number = Math.max(students.findIndex((student) => visibleIds.has(student.studentId)), 0);

  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveFocus = (from: number, delta: number): void => {
    const next: number = Math.min(Math.max(from + delta, 0), students.length - 1);
    optionRefs.current[next]?.focus();
  };

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={chipClassName}
        data-testid="legend-more"
      >
        {hiddenCount > 0 ? t("progress.moreCount", { count: hiddenCount }) : t("progress.moreList")}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 flex w-[min(18rem,calc(100vw-2rem))] origin-top-right flex-col rounded-[12px] bg-card p-2 shadow-lg ring-1 ring-border motion-safe:animate-[card-scale-in_150ms_cubic-bezier(0.16,1,0.3,1)]"
          data-testid="legend-more-popover"
        >
          {showBulkActions && (
            <div className="mb-1 flex gap-1 border-b border-border pb-1">
              <button type="button" onClick={onShowAll} className="min-h-11 rounded-[8px] px-2 text-sm font-semibold text-maroon hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-accent lg:min-h-9">
                {t("progress.showAll")}
              </button>
              <button type="button" onClick={onHideAll} className="min-h-11 rounded-[8px] px-2 text-sm font-semibold text-maroon hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-accent lg:min-h-9">
                {t("progress.hideAll")}
              </button>
            </div>
          )}
          <div
            role="listbox"
            aria-multiselectable="true"
            aria-label={t("progress.moreListLabel")}
            className="flex max-h-64 flex-col overflow-y-auto overscroll-contain"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
            }}
          >
            {students.map((student, index) => {
              const selected: boolean = visibleIds.has(student.studentId);
              return (
                <button
                  key={student.studentId}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  autoFocus={index === firstSelectedIndex}
                  onClick={() => onToggle(student.studentId)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      moveFocus(index, 1);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      moveFocus(index, -1);
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      moveFocus(0, 0);
                    } else if (event.key === "End") {
                      event.preventDefault();
                      moveFocus(students.length - 1, 0);
                    }
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-left text-sm text-ink hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
                >
                  <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${selected ? "border-ink bg-ink text-card" : "border-control-border"}`}>
                    {selected && <Check size={12} strokeWidth={3} />}
                  </span>
                  <StudentSwatch student={student} muted={!selected} />
                  <span className="min-w-0 flex-1 truncate" title={student.name}>{student.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const SkeletonBar: React.FC<{ className: string }> = ({ className }) => (
  <div className={`rounded-md bg-beige-dark motion-safe:animate-pulse ${className}`} />
);

export const JournalProgressView: React.FC<JournalProgressViewProps> = ({ courseId }) => {
  const { t } = useTranslation("journals");
  const isDesktop: boolean = useDesktop();
  const query = useCourseStaffProgress(courseId);
  const [visibleOverride, setVisibleOverride] = useState<Set<number> | null>(null);
  const [showAverage, setShowAverage] = useState<boolean>(true);

  const data: CourseStaffProgressResponse | undefined = query.data;
  const rows: ProgressPeriodRow[] = useMemo(
    () => (data ? JournalProgressRules.buildPeriodRows(data, getSchoolCalendarDate()) : []),
    [data],
  );
  const started: ProgressPeriodRow[] = useMemo(() => JournalProgressRules.startedRows(rows), [rows]);
  const students: ProgressChartStudent[] = useMemo(
    () => (data ? JournalProgressRules.chartStudents(data, started) : []),
    [data, started],
  );
  const visibleIds: Set<number> = useMemo(
    () => visibleOverride ?? JournalProgressRules.defaultVisibleIds(students),
    [visibleOverride, students],
  );

  if (query.isLoading) {
    return (
      <div role="status" aria-busy="true" data-testid="journal-progress-skeleton" className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border bg-beige px-4 py-3 text-sm text-muted">
          <BrandActivityIndicator size={18} aria-hidden="true" />
          <span>{t("loading")}</span>
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex min-h-[72px] items-center gap-4 border-b border-border px-4 last:border-b-0">
            <SkeletonBar className="h-4 w-40" />
            <SkeletonBar className="ml-auto h-4 w-20" />
            <SkeletonBar className="hidden h-4 w-28 lg:block" />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError && !data) {
    return (
      <JournalPanelMessage
        tone="error"
        title={t("workspace.progressLoadFailed")}
        body={t("progress.loadFailedBody")}
        retryLabel={t("common:retry")}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!data) return null;

  if (data.periods.length === 0) {
    return <JournalPanelMessage tone="empty" title={t("progress.noPeriodsTitle")} body={t("progress.noPeriodsBody")} />;
  }
  if (data.students.length === 0) {
    return <JournalPanelMessage tone="empty" title={t("progress.noStudentsTitle")} body={t("progress.noStudentsBody")} />;
  }

  const visibleStudents: ProgressChartStudent[] = students.filter((student) => visibleIds.has(student.studentId));
  const manyStudents: boolean = students.length > JournalProgressRules.TOGGLE_ALL_THRESHOLD;
  const toggleStudent = (studentId: number): void => {
    const next: Set<number> = new Set(visibleIds);
    if (next.has(studentId)) next.delete(studentId);
    else next.add(studentId);
    setVisibleOverride(next);
  };

  const percentageText = (percentage: number | null): string =>
    percentage === null ? t("progress.unavailable") : formatPercentage(percentage);
  const totalText = (result: StoredPeriodResult | null): string =>
    result ? t("progress.totalOfMax", { score: formatNumber(result.score), max: formatNumber(result.maxScore) }) : t("progress.unavailable");
  const rangeText = (row: ProgressPeriodRow): string =>
    `${formatSchoolLessonDate(row.period.period_start)} – ${formatSchoolLessonDate(row.period.period_end)}`;
  const storedText = (row: ProgressPeriodRow): string =>
    t("progress.storedOf", { stored: row.storedCount, roster: row.rosterCount });
  const startedIndex = (row: ProgressPeriodRow): number => started.findIndex((candidate) => candidate.period.id === row.period.id);
  const upcomingTag = (row: ProgressPeriodRow) =>
    row.upcoming ? (
      <span className="ml-2 inline-block rounded-full border border-info/30 bg-info-surface px-2 py-0.5 align-middle text-xs font-semibold text-info">
        {t("period.upcoming")}
      </span>
    ) : null;
  const notStarted = <span className="text-muted">{t("period.stateEmpty")}</span>;

  const chipClass = (pressed: boolean): string =>
    `inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9 motion-safe:transition-colors motion-safe:duration-150 ${
      pressed ? "border-border bg-card text-ink" : "border-transparent bg-transparent text-muted"
    }`;

  const plottedStudents: ProgressChartStudent[] = students.filter((student) => visibleIds.has(student.studentId));
  const hiddenStudents: ProgressChartStudent[] = students.filter((student) => !visibleIds.has(student.studentId));

  const legend = (
    <div className="relative flex min-w-0 items-center gap-1" data-testid="progress-legend">
      <ul className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain lg:flex-wrap lg:overflow-visible" aria-label={t("progress.legendLabel")}>
        <li className="shrink-0">
          <button type="button" aria-pressed={showAverage} onClick={() => setShowAverage((current) => !current)} className={chipClass(showAverage)}>
            <span aria-hidden="true" className="h-0 w-4 shrink-0 border-t-2 border-dashed border-muted" />
            {t("progress.classAverage")}
          </button>
        </li>
        {plottedStudents.map((student) => (
          <li key={student.studentId} className="shrink-0">
            <button type="button" aria-pressed onClick={() => toggleStudent(student.studentId)} className={chipClass(true)}>
              <StudentSwatch student={student} />
              {student.name}
            </button>
          </li>
        ))}
      </ul>
      {(hiddenStudents.length > 0 || manyStudents) && (
        <MoreStudentsMenu
          students={students}
          hiddenCount={hiddenStudents.length}
          visibleIds={visibleIds}
          onToggle={toggleStudent}
          onShowAll={() => setVisibleOverride(new Set(students.map((student) => student.studentId)))}
          onHideAll={() => setVisibleOverride(new Set())}
          showBulkActions={manyStudents}
          chipClassName={chipClass(true)}
        />
      )}
    </div>
  );

  const studentCell = (student: ProgressChartStudent, row: ProgressPeriodRow) => {
    const result: StoredPeriodResult | null = student.results[startedIndex(row)] ?? null;
    return (
      <>
        <div className="font-semibold tabular-nums text-ink">{percentageText(result ? result.percentage : null)}</div>
        <div className="text-xs tabular-nums text-muted">{totalText(result)}</div>
      </>
    );
  };

  const table = (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full border-collapse text-left text-sm" aria-label={t("progress.tableLabel")}>
        <thead>
          <tr className="border-b border-border bg-beige text-xs font-semibold uppercase tracking-wide text-muted">
            <th scope="col" className="px-4 py-3">{t("progress.columns.period")}</th>
            <th scope="col" className="px-4 py-3">{t("progress.columns.stored")}</th>
            <th scope="col" className="px-4 py-3">{t("progress.columns.average")}</th>
            {visibleStudents.map((student) => (
              <th key={student.studentId} scope="col" className="px-4 py-3">{student.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.period.id} data-upcoming={row.upcoming} className="border-b border-border last:border-b-0">
              <th scope="row" className="min-w-0 px-4 py-3 align-top font-semibold text-ink">
                <span className="block break-words">
                  {row.period.period_label}
                  {upcomingTag(row)}
                </span>
                <span className="block text-xs font-normal tabular-nums text-muted">{rangeText(row)}</span>
              </th>
              {row.upcoming ? (
                <td colSpan={2 + visibleStudents.length} className="px-4 py-3 align-top">{notStarted}</td>
              ) : (
                <>
                  <td className="px-4 py-3 align-top tabular-nums text-ink">
                    {storedText(row)}
                    {row.unavailableCount > 0 && (
                      <span className="block text-xs text-muted">{t("progress.unavailableCount", { count: row.unavailableCount })}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top font-semibold tabular-nums text-ink">{percentageText(row.averagePercentage)}</td>
                  {visibleStudents.map((student) => (
                    <td key={student.studentId} className="px-4 py-3 align-top">{studentCell(student, row)}</td>
                  ))}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const list = (
    <ul data-testid="progress-results" className="divide-y divide-border border-y border-border" aria-label={t("progress.tableLabel")}>
      {rows.map((row) => (
        <li key={row.period.id} data-upcoming={row.upcoming} className="flex flex-col gap-1.5 py-3">
          <div className="min-w-0">
            <div className="break-words text-sm font-semibold text-ink">
              {row.period.period_label}
              {upcomingTag(row)}
            </div>
            <div className="text-xs tabular-nums text-muted">{rangeText(row)}</div>
          </div>
          {row.upcoming ? (
            <div className="text-sm">{notStarted}</div>
          ) : (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">{t("progress.columns.stored")}</dt>
              <dd className="text-right tabular-nums text-ink">
                {storedText(row)}
                {row.unavailableCount > 0 && (
                  <span className="block text-xs text-muted">{t("progress.unavailableCount", { count: row.unavailableCount })}</span>
                )}
              </dd>
              <dt className="text-muted">{t("progress.classAverage")}</dt>
              <dd className="text-right font-semibold tabular-nums text-ink">{percentageText(row.averagePercentage)}</dd>
              {visibleStudents.map((student) => {
                const result: StoredPeriodResult | null = student.results[startedIndex(row)] ?? null;
                return (
                  <React.Fragment key={student.studentId}>
                    <dt className="flex min-w-0 items-center gap-2 text-muted">
                      <StudentSwatch student={student} />
                      <span className="min-w-0 break-words">{student.name}</span>
                    </dt>
                    <dd className="text-right font-semibold tabular-nums text-ink">{percentageText(result ? result.percentage : null)}</dd>
                  </React.Fragment>
                );
              })}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="journal-progress">
      {query.isError && (
        <JournalNotice tone="warning" action={{ label: t("common:retry"), onClick: () => void query.refetch() }}>
          {t("progress.refreshFailed")}
        </JournalNotice>
      )}
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-ink lg:text-lg" data-testid="progress-scope">
          {t("progress.scope")}
        </h2>
        <InfoTooltip label={t("progress.infoLabel")}>{t("progress.scopeNote")}</InfoTooltip>
      </div>
      {started.length > 0 && (
        <>
          <ProgressChart periods={started} students={students} visibleIds={visibleIds} showAverage={showAverage} />
          {legend}
        </>
      )}
      {isDesktop ? table : list}
    </div>
  );
};
