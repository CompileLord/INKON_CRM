import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { formatNumber, formatPercentage } from "../../i18n/formatters";
import { JournalScoringRules } from "../../lib/journals/JournalScoringRules";
import type { JournalEmbeddedSummary } from "../../lib/journals/types";

interface JournalCalculationDisclosureProps {
  summary: JournalEmbeddedSummary;
  examMaximum: number;
}

export const JournalCalculationDisclosure: React.FC<JournalCalculationDisclosureProps> = ({ summary, examMaximum }) => {
  const { t } = useTranslation("journals");
  const [open, setOpen] = useState<boolean>(false);
  const panelId: string = useId();
  const derivesDenominator: boolean = JournalScoringRules.maximumPeriodScore(summary.total_lessons, examMaximum) === summary.max_period_score;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((previous) => !previous)}
        className="inline-flex min-h-11 w-fit items-center gap-1 rounded-[10px] px-2 text-sm font-medium text-maroon hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("calculation.toggle")}
        <ChevronDown className={`h-4 w-4 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-2 rounded-[10px] border border-border bg-strip p-3 text-sm text-ink">
          <p className="tabular-nums">
            {t("calculation.sum", {
              homework: formatNumber(summary.homework_score),
              attendance: formatNumber(summary.attendance_score),
              exam: formatNumber(summary.exam_score),
              bonus: formatNumber(summary.bonus_score),
              total: formatNumber(summary.sum_score),
            })}
          </p>
          <p className="tabular-nums">
            {derivesDenominator
              ? t("calculation.denominator", {
                  lessons: formatNumber(summary.total_lessons),
                  perLesson: JournalScoringRules.MAXIMUM_HOMEWORK_PER_LESSON + JournalScoringRules.ATTENDANCE_POINT_PER_LESSON,
                  examMax: formatNumber(examMaximum),
                  max: formatNumber(summary.max_period_score),
                })
              : t("calculation.denominatorServer", { max: formatNumber(summary.max_period_score) })}
          </p>
          <p className="tabular-nums">
            {t("calculation.percentage", {
              total: formatNumber(summary.sum_score),
              max: formatNumber(summary.max_period_score),
              percentage: formatPercentage(summary.percentage),
            })}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>{t("calculation.ruleHomework", { max: JournalScoringRules.MAXIMUM_HOMEWORK_PER_LESSON })}</li>
            <li>{t("calculation.ruleAttendance", { points: JournalScoringRules.ATTENDANCE_POINT_PER_LESSON })}</li>
            <li>{t("calculation.ruleBonus", { max: JournalScoringRules.MAXIMUM_BONUS_SCORE })}</li>
            <li>{t("calculation.ruleOver100")}</li>
          </ul>
        </div>
      )}
    </div>
  );
};
