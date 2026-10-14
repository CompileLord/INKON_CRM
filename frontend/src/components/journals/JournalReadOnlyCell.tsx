import React from "react";
import { useTranslation } from "react-i18next";
import { Check, Minus, MessageSquare } from "lucide-react";
import { JournalSaveMarker } from "./JournalSaveMarker";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";

interface JournalReadOnlyCellProps {
  studentName: string;
  lessonDate: string;
  attendance: boolean;
  score: number;
  comment: string | null;
  status?: CellSaveStatus;
}

export const JournalReadOnlyCell: React.FC<JournalReadOnlyCellProps> = ({
  studentName,
  lessonDate,
  attendance,
  score,
  comment,
  status,
}) => {
  const { t } = useTranslation("journals");
  const hasComment: boolean = Boolean(comment && comment.trim().length > 0);
  const formattedDate: string = formatSchoolLessonDate(lessonDate);

  return (
    <div
      role="group"
      className="relative flex min-h-11 items-center justify-center gap-3 text-sm"
      aria-label={t("table.readOnlyCellLabel", { name: studentName, date: formattedDate })}
    >
      {status && <JournalSaveMarker status={status} className="absolute -top-1.5 -right-1.5" />}
      {attendance ? (
        <span className="inline-flex items-center gap-1 text-ink">
          <Check className="h-4 w-4 text-success" aria-hidden="true" />
          <span className="text-xs text-muted">{t("table.present")}</span>
        </span>
      ) : (
        <span className="inline-flex items-center text-muted">
          <Minus className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t("table.absent")}</span>
        </span>
      )}
      <span className={`min-w-6 text-center tabular-nums ${score > 0 ? "font-semibold text-ink" : "text-muted"}`}>
        {score > 0 ? score : "—"}
      </span>
      {hasComment && (
        <span title={comment as string} className="inline-flex text-maroon">
          <MessageSquare className="h-4 w-4 fill-current" aria-hidden="true" />
          <span className="sr-only">{t("table.hasComment")}</span>
        </span>
      )}
    </div>
  );
};
