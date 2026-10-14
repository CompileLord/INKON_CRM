import React from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/formatters";
import type { JournalStudentResponse } from "../../lib/journals/types";

interface JournalSummaryListProps {
  students: JournalStudentResponse[];
  periodLabel: string;
}

export const JournalSummaryList: React.FC<JournalSummaryListProps> = ({ students, periodLabel }) => {
  const { t } = useTranslation("journals");
  return (
    <ul
      aria-label={t("summary.listLabel", { period: periodLabel })}
      className="divide-y divide-border rounded-2xl border border-border bg-card"
    >
      {students.map((student) => {
        const summary = student.summary;
        return (
          <li key={student.student_id} className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
            <span className="min-w-0 break-words text-sm font-semibold text-ink">
              {student.first_name} {student.last_name}
            </span>
            {summary ? (
              <span className="flex items-baseline gap-3 text-sm tabular-nums">
                <span className="font-semibold text-ink">
                  {t("summary.total", {
                    sum: formatNumber(summary.sum_score),
                    max: formatNumber(summary.max_period_score),
                  })}
                </span>
                <span className="text-muted">
                  {formatNumber(summary.percentage, undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                </span>
              </span>
            ) : (
              <span className="text-sm text-muted">{t("summary.unavailable")}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
};
