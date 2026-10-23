import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X, MessageSquare } from "lucide-react";
import { Modal } from "../ui/Modal";
import { JournalSaveMarker } from "./JournalSaveMarker";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";

interface JournalReadOnlyCellProps {
  studentName: string;
  lessonDate: string;
  attendance: boolean;
  score: number;
  graded?: boolean;
  comment: string | null;
  status?: CellSaveStatus;
  recorded?: boolean;
}

export const JournalReadOnlyCell: React.FC<JournalReadOnlyCellProps> = ({
  studentName,
  lessonDate,
  attendance,
  score,
  graded = false,
  comment,
  status,
  recorded = true,
}) => {
  const { t } = useTranslation("journals");
  const hasComment: boolean = Boolean(comment && comment.trim().length > 0);
  const [commentOpen, setCommentOpen] = useState<boolean>(false);
  const formattedDate: string = formatSchoolLessonDate(lessonDate);

  return (
    <div
      role="group"
      className="relative flex min-h-11 items-center justify-center gap-3 text-sm"
      aria-label={t("table.readOnlyCellLabel", { name: studentName, date: formattedDate })}
    >
      {status && <JournalSaveMarker status={status} className="absolute -top-1.5 -right-1.5" />}
      {!recorded ? (
        <span className="text-muted" data-testid="not-recorded-cell">
          <span aria-hidden="true">—</span>
          <span className="sr-only">{t("table.notRecorded")}</span>
        </span>
      ) : attendance ? (
        <span role="img" aria-label={t("table.present")} title={t("table.present")} className="inline-flex items-center text-success" data-testid="attendance-present">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : (
        <span role="img" aria-label={t("table.absent")} title={t("table.absent")} className="inline-flex items-center text-destructive" data-testid="attendance-absent">
          <X className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
      {recorded && (
        <span className={`min-w-6 text-center tabular-nums ${graded || score > 0 ? "font-semibold text-ink" : "text-muted"}`}>
          {graded || score > 0 ? score : "—"}
        </span>
      )}
      {hasComment && (
        <>
          <button
            type="button"
            aria-label={t("table.openComment", { date: formattedDate })}
            onClick={() => setCommentOpen(true)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-maroon-text hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
          >
            <MessageSquare className="h-4 w-4 fill-current" aria-hidden="true" />
          </button>
          <Modal open={commentOpen} onClose={() => setCommentOpen(false)} title={t("table.commentDialogTitle", { date: formattedDate })}>
            <p data-testid="own-comment-text" className="select-text whitespace-pre-wrap break-words text-sm text-ink">{comment}</p>
          </Modal>
        </>
      )}
    </div>
  );
};
