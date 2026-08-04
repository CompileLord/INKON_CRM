import { useTranslation } from "react-i18next";
import type { JournalEmbeddedSummary } from "../../lib/journals/types";

interface ScoreBreakdownProps {
  summary: JournalEmbeddedSummary;
  myRank?: number;
  classSize?: number;
  classAvgPercentage?: number;
}

export function ScoreBreakdown({ summary, myRank, classSize, classAvgPercentage }: ScoreBreakdownProps) {
  const { t } = useTranslation(["student", "journals", "common"]);
  const { homework_score, attendance_score, exam_score, bonus_score, sum_score, max_period_score, percentage } = summary;

  const totalMax = max_period_score > 0 ? max_period_score : 1;
  const hwPct = Math.min(100, Math.max(0, (homework_score / totalMax) * 100));
  const attPct = Math.min(100, Math.max(0, (attendance_score / totalMax) * 100));
  const examPct = Math.min(100, Math.max(0, (exam_score / totalMax) * 100));
  const bonusPct = Math.min(100, Math.max(0, (bonus_score / totalMax) * 100));

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border-warm bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-xs uppercase tracking-wide text-muted">{t("totalScore", "Итоговый балл")}</span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-3xl font-bold tabular-nums text-ink">{sum_score}</span>
            <span className="text-sm text-muted tabular-nums">/ {max_period_score}</span>
            <span className="ml-2 rounded-full bg-beige px-2.5 py-0.5 text-xs font-bold tabular-nums text-ink">
              {percentage.toFixed(1)}%
            </span>
          </div>
        </div>

        {myRank !== undefined && classSize !== undefined && (
          <div className="rounded-xl border border-border-warm bg-strip px-3 py-1.5 text-right">
            <span className="text-xs text-muted block">{t("rankInClass", "Ранг в группе")}</span>
            <span className="text-sm font-bold tabular-nums text-ink">
              {myRank} {t("of", "из")} {classSize}
            </span>
            {classAvgPercentage !== undefined && (
              <span className="text-[11px] text-muted block tabular-nums">
                {t("classAvg", "средний")} {classAvgPercentage.toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-strip p-0.5 gap-0.5">
        {hwPct > 0 && <div style={{ width: `${hwPct}%` }} className="h-full rounded-l-full bg-blue-500 transition-all duration-300" />}
        {attPct > 0 && <div style={{ width: `${attPct}%` }} className="h-full bg-emerald-500 transition-all duration-300" />}
        {examPct > 0 && <div style={{ width: `${examPct}%` }} className="h-full bg-amber-500 transition-all duration-300" />}
        {bonusPct > 0 && <div style={{ width: `${bonusPct}%` }} className="h-full rounded-r-full bg-purple-500 transition-all duration-300" />}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
          <span className="text-muted">{t("homework", "Д/З")}:</span>
          <span className="font-semibold tabular-nums text-ink">{homework_score}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-muted">{t("attendance", "Посещаемость")}:</span>
          <span className="font-semibold tabular-nums text-ink">{attendance_score}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
          <span className="text-muted">{t("exam", "Экзамен")}:</span>
          <span className="font-semibold tabular-nums text-ink">{exam_score}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 rounded-full bg-purple-500 shrink-0" />
          <span className="text-muted">{t("bonus", "Бонус")}:</span>
          <span className="font-semibold tabular-nums text-ink">{bonus_score}</span>
        </div>
      </div>
    </div>
  );
}
