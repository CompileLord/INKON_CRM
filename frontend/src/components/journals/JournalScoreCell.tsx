import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import type { CellSaveStatus } from "../../lib/journals/useJournalAutosave";

interface JournalScoreCellProps {
  studentId: number;
  studentName: string;
  lessonDate: string;
  attendance: boolean;
  score: number;
  comment: string | null;
  version: number;
  status?: CellSaveStatus;
  isFocused: boolean;
  onFocus: () => void;
  onChange: (patch: { attendance: boolean; score: number; comment?: string | null }) => void;
}

export const JournalScoreCell: React.FC<JournalScoreCellProps> = ({
  studentName,
  lessonDate,
  attendance,
  score,
  comment,
  status,
  isFocused,
  onFocus,
  onChange,
}) => {
  const { t } = useTranslation("journals");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(comment || "");
  const cellRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key >= "0" && e.key <= "5") {
      e.preventDefault();
      const val = parseInt(e.key, 10);
      onChange({ attendance: val > 0 ? true : attendance, score: val });
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onChange({ attendance, score: 0 });
    } else if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      onChange({ attendance: !attendance, score });
    } else if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      setCommentOpen((prev) => !prev);
    }
  };

  let ringStyle = "";
  if (status === "dirty") ringStyle = "ring-1 ring-amber-400/60 dark:ring-amber-500/50";
  else if (status === "saving") ringStyle = "ring-1 ring-amber-400/60 dark:ring-amber-500/50 opacity-70";
  else if (status === "saved") ringStyle = "ring-1 ring-emerald-400/60 transition-all duration-500";
  else if (status === "conflict") ringStyle = "ring-2 ring-red-500";

  return (
    <div
      ref={cellRef}
      tabIndex={isFocused ? 0 : -1}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      className={`relative group flex items-center justify-center gap-1 p-1 rounded-md transition-colors outline-none focus:ring-2 focus:ring-primary ${ringStyle}`}
      aria-label={t("table.scoreCellLabel", { name: studentName, date: lessonDate })}
    >
      <input
        type="checkbox"
        checked={attendance}
        onChange={(e) => onChange({ attendance: e.target.checked, score: e.target.checked ? score : 0 })}
        className="w-3.5 h-3.5 rounded border-input text-primary focus:ring-primary cursor-pointer"
        aria-label={t("table.attendanceCellLabel", { name: studentName, date: lessonDate })}
      />

      <button
        type="button"
        onClick={() => setPopoverOpen((prev) => !prev)}
        className={`min-w-[24px] h-7 px-1.5 text-xs font-medium rounded flex items-center justify-center border transition-colors ${
          score > 0
            ? "border-primary/30 bg-primary/10 text-primary font-bold"
            : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        {score > 0 ? score : "—"}
      </button>

      {comment && comment.trim().length > 0 && (
        <button
          type="button"
          onClick={() => setCommentOpen((prev) => !prev)}
          className="text-amber-500 hover:text-amber-600 focus:outline-none"
          title={comment}
          aria-label={t("table.commentCellLabel", { name: studentName, date: lessonDate })}
        >
          <MessageSquare className="w-3 h-3 fill-amber-500/20" />
        </button>
      )}

      {popoverOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-30 bg-popover text-popover-foreground border border-border rounded-lg shadow-md p-1 flex gap-1 animate-in fade-in zoom-in-95 duration-100">
          {[0, 1, 2, 3, 4, 5].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => {
                onChange({ attendance: num > 0 ? true : attendance, score: num });
                setPopoverOpen(false);
              }}
              className={`w-6 h-6 rounded text-xs font-semibold flex items-center justify-center ${
                score === num ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      )}

      {commentOpen && (
        <div className="absolute top-full right-0 mt-1 z-30 bg-popover text-popover-foreground border border-border rounded-lg shadow-lg p-2.5 w-56 animate-in fade-in zoom-in-95 duration-100">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t("table.comment")}
          </label>
          <textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            rows={2}
            className="w-full text-xs p-1.5 border border-input rounded bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary mb-2"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setCommentOpen(false)}
              className="px-2 py-1 text-[10px] font-medium border border-input rounded hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onChange({ attendance, score, comment: commentDraft });
                setCommentOpen(false);
              }}
              className="px-2 py-1 text-[10px] font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
