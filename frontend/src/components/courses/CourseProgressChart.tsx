import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, BookOpen, LayoutGrid, Search, Table as TableIcon } from "lucide-react";
import type { CourseProgressChartResponse } from "../../lib/courses/types";
import { PersonAvatar } from "../ui/PersonAvatar";

type SortOption = "avg_desc" | "name_asc" | "latest_desc";
type ViewMode = "matrix" | "table";

interface CourseProgressChartProps {
  data: CourseProgressChartResponse;
  courseId?: number;
}

export function CourseProgressChart({ data, courseId }: CourseProgressChartProps) {
  const { t } = useTranslation(["courses", "common"]);
  const navigate = useNavigate();

  const [sortOption, setSortOption] = useState<SortOption>("avg_desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("matrix");

  const filterId = useId();

  const periodLabels = useMemo(() => {
    if (!data.labels || data.labels.length === 0) return [];
    return data.labels.slice(0, -1);
  }, [data.labels]);

  const hasJournals = periodLabels.length > 0;
  const hasDatasets = data.datasets && data.datasets.length > 0;

  const periodClassAverages = useMemo(() => {
    if (!hasJournals || !hasDatasets) return [];
    const totals = new Array(periodLabels.length).fill(0);
    const counts = new Array(periodLabels.length).fill(0);

    data.datasets.forEach((dataset) => {
      if (dataset.percentages) {
        dataset.percentages.slice(0, -1).forEach((pct, idx) => {
          if (pct !== undefined && pct !== null) {
            totals[idx] += pct;
            counts[idx]++;
          }
        });
      }
    });

    return totals.map((tot, idx) => (counts[idx] > 0 ? Math.round(tot / counts[idx]) : 0));
  }, [data.datasets, periodLabels.length, hasJournals, hasDatasets]);

  const processedDatasets = useMemo(() => {
    if (!data.datasets) return [];

    let list = [...data.datasets];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      const aPcts = a.percentages || [];
      const bPcts = b.percentages || [];

      const aAvg = aPcts.length > 0 ? aPcts[aPcts.length - 1] : 0;
      const bAvg = bPcts.length > 0 ? bPcts[bPcts.length - 1] : 0;

      if (sortOption === "avg_desc") {
        return bAvg - aAvg;
      }
      if (sortOption === "name_asc") {
        return a.name.localeCompare(b.name, "ru");
      }
      if (sortOption === "latest_desc") {
        const aLatest = aPcts.length > 1 ? aPcts[aPcts.length - 2] : aAvg;
        const bLatest = bPcts.length > 1 ? bPcts[bPcts.length - 2] : bAvg;
        return bLatest - aLatest;
      }
      return 0;
    });

    return list;
  }, [data.datasets, searchQuery, sortOption]);

  if (!hasJournals || !hasDatasets) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-strip text-muted">
          <BookOpen size={22} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-ink">
            {t("noProgressData", "Пока нет данных для графика прогресса")}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {t("noProgressSub", "Создайте журналы и оцените работы студентов, чтобы увидеть матрицу успеваемости")}
          </p>
        </div>
        {courseId && (
          <Link
            to={`/journals/${courseId}`}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-maroon px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-maroon-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon/40"
          >
            <BookOpen size={16} />
            <span>{t("openJournal", "Перейти к журналу")}</span>
          </Link>
        )}
      </div>
    );
  }

  const getCellRampStyle = (pct?: number) => {
    if (pct === undefined || pct === null) {
      return {
        className: "bg-strip/40 border border-dashed border-border/50 text-muted opacity-60",
        style: {},
      };
    }

    if (pct === 0) {
      return {
        className: "bg-red-500/15 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200/50 dark:border-red-900/40 font-semibold",
        style: {},
      };
    }

    const clamped = Math.min(100, Math.max(0, pct));

    if (clamped < 25) {
      return {
        className: "bg-amber-500/10 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border border-amber-200/30 dark:border-amber-900/30 font-medium",
        style: {},
      };
    }
    if (clamped < 45) {
      return {
        className: "bg-orange-500/20 dark:bg-orange-950/40 text-amber-950 dark:text-orange-200 border border-orange-300/40 dark:border-orange-900/40 font-medium",
        style: {},
      };
    }
    if (clamped < 60) {
      return {
        className: "bg-orange-600/35 dark:bg-orange-900/50 text-white dark:text-orange-100 border border-orange-400/40 dark:border-orange-800/50 font-semibold",
        style: {},
      };
    }
    if (clamped < 70) {
      return {
        className: "bg-amber-600/55 dark:bg-orange-800/70 text-white border border-amber-500/50 font-semibold",
        style: {},
      };
    }
    if (clamped < 80) {
      return {
        className: "bg-maroon/75 dark:bg-maroon/80 text-white border border-maroon/50 font-semibold",
        style: {},
      };
    }
    if (clamped < 90) {
      return {
        className: "bg-maroon/90 dark:bg-maroon text-white border border-maroon-dark font-bold",
        style: {},
      };
    }
    return {
      className: "bg-maroon dark:bg-maroon-dark text-white border border-maroon-dark font-bold shadow-xs",
      style: {},
    };
  };

  const handleCellClick = () => {
    if (courseId) {
      navigate(`/journals/${courseId}`);
    }
  };

  return (
    <div className="rounded-2xl border border-border-warm bg-card p-5 transition-opacity duration-200">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-warm pb-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{t("courseProgress", "Успеваемость курса")}</h2>
          <p className="text-xs text-muted">
            {t("progressMatrixDesc", "Матрица результатов по периодам и динамика группы")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id={filterId}
              type="text"
              placeholder={t("searchStudent", "Поиск студента…")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 rounded-lg border border-border bg-strip pl-8 pr-3 text-xs text-ink placeholder:text-muted focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
            />
          </div>

          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="h-8 rounded-lg border border-border bg-strip px-2.5 text-xs text-ink focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
          >
            <option value="avg_desc">{t("sortAvgDesc", "Сначала высокий балл")}</option>
            <option value="name_asc">{t("sortNameAsc", "По имени (А-Я)")}</option>
            <option value="latest_desc">{t("sortLatestDesc", "Сначала последний балл")}</option>
          </select>

          <div className="flex items-center rounded-lg border border-border bg-strip p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("matrix")}
              aria-label={t("matrixView", "Вид матрицы")}
              className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
                viewMode === "matrix" ? "bg-card text-maroon shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <LayoutGrid size={14} />
              <span>{t("matrix", "Тепловая")}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              aria-label={t("tableView", "Вид таблицы")}
              className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
                viewMode === "table" ? "bg-card text-maroon shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              <TableIcon size={14} />
              <span>{t("table", "Таблица")}</span>
            </button>
          </div>
        </div>
      </div>

      {periodClassAverages.length > 1 && (
        <div className="mt-4 rounded-xl border border-border-warm/60 bg-strip/40 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-muted">
            <span>{t("cohortTrend", "Тренд среднего балла группы")}</span>
            <span className="tabular-nums font-bold text-ink">
              {periodClassAverages.length > 0
                ? `${Math.round(periodClassAverages.reduce((a, b) => a + b, 0) / periodClassAverages.length)}%`
                : "—"}
            </span>
          </div>

          <div className="relative mt-2 h-14 w-full">
            <svg className="h-full w-full overflow-visible" viewBox="0 0 1000 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {(() => {
                const points = periodClassAverages.map((val, idx) => {
                  const x = (idx / (periodClassAverages.length - 1)) * 1000;
                  const y = 90 - (val / 100) * 80;
                  return `${x},${y}`;
                });
                const d = `M 0,90 L ${points.join(" L ")} L 1000,90 Z`;
                return <path d={d} fill="url(#trendGradient)" />;
              })()}

              {(() => {
                const points = periodClassAverages.map((val, idx) => {
                  const x = (idx / (periodClassAverages.length - 1)) * 1000;
                  const y = 90 - (val / 100) * 80;
                  return `${x},${y}`;
                });
                return (
                  <polyline
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    points={points.join(" ")}
                  />
                );
              })()}
            </svg>

            {periodClassAverages.map((val, idx) => {
              const leftPct = (idx / (periodClassAverages.length - 1)) * 100;
              const bottomPct = (val / 100) * 80 + 10;
              return (
                <div
                  key={idx}
                  style={{ left: `${leftPct}%`, bottom: `${bottomPct}%` }}
                  className="group/dot absolute flex -translate-x-1/2 translate-y-1/2 items-center justify-center"
                >
                  <div className="h-2.5 w-2.5 rounded-full border-2 border-accent bg-card shadow-xs transition-transform group-hover/dot:scale-125" />
                  <div className="pointer-events-none absolute bottom-full mb-1.5 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[10px] font-medium text-white shadow-md group-hover/dot:block z-30">
                    {periodLabels[idx]}: {Math.round(val)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border-warm text-xs font-semibold text-muted">
              <th scope="col" className="w-64 pb-3 pl-2 pr-4 font-semibold text-ink">
                {t("student", "Студент")}
              </th>
              {periodLabels.map((label, idx) => (
                <th key={idx} scope="col" className="px-1.5 pb-3 text-center min-w-20 font-medium text-nav">
                  {label}
                </th>
              ))}
              <th scope="col" className="border-l-2 border-border-warm bg-strip/30 px-3 pb-3 text-center w-24 font-bold text-ink">
                {t("average", "Средний")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 text-sm">
            {processedDatasets.map((dataset) => {
              const percentages = dataset.percentages || [];
              const scores = dataset.scores || [];
              const maxScores = dataset.max_scores || [];
              const avgPct = percentages.length > 0 ? percentages[percentages.length - 1] : 0;
              const avgScore = scores.length > 0 ? scores[scores.length - 1] : 0;
              const avgMax = maxScores.length > 0 ? maxScores[maxScores.length - 1] : 0;

              const isAtRisk = avgPct !== undefined && avgPct < 60;
              const firstName = dataset.name.split(" ")[0] || "";
              const lastName = dataset.name.split(" ").slice(1).join(" ") || "";

              return (
                <tr key={dataset.student_id} className="group hover:bg-strip/40 transition-colors duration-150">
                  <th scope="row" className="py-2.5 pl-2 pr-4 font-normal">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        to={`/students/${dataset.student_id}`}
                        className="flex items-center gap-2.5 group-hover:text-maroon transition-colors"
                      >
                        <PersonAvatar firstName={firstName} lastName={lastName} size={28} />
                        <span className="truncate text-xs font-medium text-ink group-hover:text-maroon">
                          {dataset.name}
                        </span>
                      </Link>

                      {isAtRisk && (
                        <span
                          title={t("atRiskTip", "Средний балл ниже 60% — требуется внимание")}
                          className="inline-flex items-center gap-1 rounded-full bg-red-500/10 dark:bg-red-950/40 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400 border border-red-500/20"
                        >
                          <AlertCircle size={11} className="shrink-0" />
                          <span className="hidden sm:inline">{t("atRisk", "Риск")}</span>
                        </span>
                      )}
                    </div>
                  </th>

                  {periodLabels.map((_, periodIdx) => {
                    const pct = percentages[periodIdx];
                    const score = scores[periodIdx];
                    const maxScore = maxScores[periodIdx];
                    const cellRamp = getCellRampStyle(pct);

                    if (viewMode === "table") {
                      return (
                        <td key={periodIdx} className="p-1 text-center text-xs tabular-nums text-ink">
                          {score !== undefined && maxScore !== undefined ? (
                            <span>
                              {score} <span className="text-muted text-[11px]">/ {maxScore}</span>
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      );
                    }

                    return (
                      <td key={periodIdx} className="p-1 text-center">
                        <button
                          type="button"
                          onClick={handleCellClick}
                          style={cellRamp.style}
                          className={`group/cell relative h-8 w-full rounded-md text-xs transition-all duration-150 hover:ring-2 hover:ring-maroon/40 focus:outline-none focus:ring-2 focus:ring-maroon ${cellRamp.className}`}
                        >
                          <span className="tabular-nums">
                            {pct !== undefined && pct !== null ? `${Math.round(pct)}%` : "—"}
                          </span>

                          <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-center text-[11px] font-normal text-white shadow-lg group-hover/cell:block">
                            <p className="font-semibold">{dataset.name}</p>
                            <p className="text-[10px] text-gray-300">{periodLabels[periodIdx]}</p>
                            <p className="mt-0.5 tabular-nums font-semibold text-amber-300">
                              {score ?? 0} / {maxScore ?? 0} ({pct !== undefined ? `${pct.toFixed(1)}%` : "0%"})
                            </p>
                          </div>
                        </button>
                      </td>
                    );
                  })}

                  <td className="border-l-2 border-border-warm bg-strip/30 p-2 text-center">
                    {viewMode === "table" ? (
                      <span className="text-xs font-bold tabular-nums text-ink">
                        {avgScore} / {avgMax} ({Math.round(avgPct)}%)
                      </span>
                    ) : (
                      <span className="inline-flex h-8 w-full items-center justify-center rounded-md bg-maroon/10 dark:bg-maroon/20 text-xs font-bold tabular-nums text-maroon dark:text-maroon-dark border border-maroon/20">
                        {Math.round(avgPct)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
