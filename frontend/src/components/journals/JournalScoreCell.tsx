import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, MessageSquare } from "lucide-react";
import { JournalSaveMarker } from "./JournalSaveMarker";
import { JournalScorePicker } from "./JournalScorePicker";
import { JournalCommentEditor } from "./JournalCommentEditor";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import type { JournalEntryCommand } from "../../lib/journals/journalCommands";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";

export type CellNavDirection = "up" | "down" | "left" | "right";
export type JournalCellControl = "cell" | "attendance" | "score" | "comment";

interface JournalScoreCellProps {
  studentId?: number;
  studentName: string;
  lessonDate: string;
  attendance: boolean;
  score: number;
  comment: string | null;
  status?: CellSaveStatus;
  isFocused: boolean;
  autoFocus?: boolean;
  onFocus: (control: JournalCellControl) => void;
  onNavigate?: (direction: CellNavDirection) => void;
  onCommand: (command: JournalEntryCommand) => void;
}

const NAVIGATION_KEYS: Record<string, CellNavDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const STATUS_RING: Record<CellSaveStatus, string> = {
  dirty: "ring-1 ring-warning",
  saving: "ring-1 ring-warning",
  saved: "ring-1 ring-success",
  error: "ring-2 ring-destructive",
  conflict: "ring-2 ring-destructive",
};

function controlOf(target: EventTarget): JournalCellControl {
  const marker: string | null = target instanceof HTMLElement ? target.getAttribute("data-control") : null;
  if (marker === "attendance" || marker === "score" || marker === "comment") return marker;
  return "cell";
}

export const JournalScoreCell: React.FC<JournalScoreCellProps> = ({
  studentId,
  studentName,
  lessonDate,
  attendance,
  score,
  comment,
  status,
  isFocused,
  autoFocus = false,
  onFocus,
  onNavigate,
  onCommand,
}) => {
  const { t } = useTranslation("journals");
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);
  const [commentOpen, setCommentOpen] = useState<boolean>(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const scoreButtonRef = useRef<HTMLButtonElement>(null);

  const hasComment: boolean = Boolean(comment && comment.trim().length > 0);
  const formattedDate: string = formatSchoolLessonDate(lessonDate);
  const controlTabIndex: number = isFocused ? 0 : -1;

  useEffect(() => {
    if (isFocused && autoFocus && cellRef.current && !cellRef.current.contains(document.activeElement)) {
      cellRef.current.focus();
    }
  }, [isFocused, autoFocus]);

  const openCommentEditor = (): void => {
    setPopoverOpen(false);
    setCommentOpen(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const direction: CellNavDirection | undefined = NAVIGATION_KEYS[event.key];
    if (direction) {
      event.preventDefault();
      setPopoverOpen(false);
      onNavigate?.(direction);
    } else if (event.key.length === 1 && event.key >= "0" && event.key <= "5") {
      event.preventDefault();
      onCommand({ kind: "score", score: parseInt(event.key, 10) });
      onNavigate?.("down");
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      onCommand({ kind: "score", score: 0 });
    } else if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      onCommand({ kind: "attendance", attended: !attendance });
      onNavigate?.("down");
    } else if (event.key === "c" || event.key === "C") {
      event.preventDefault();
      openCommentEditor();
    }
  };

  const ringStyle: string = status ? STATUS_RING[status] : "";

  return (
    <div
      ref={cellRef}
      tabIndex={controlTabIndex}
      data-control="cell"
      data-anchor={`${studentId}:${lessonDate}`}
      onFocus={(event) => onFocus(controlOf(event.target))}
      onKeyDown={handleKeyDown}
      className={`relative group/cell flex items-center justify-center gap-1 rounded-[10px] p-1 outline-none scroll-ml-[216px] scroll-mt-16 focus-visible:ring-2 focus-visible:ring-ring ${ringStyle}`}
      aria-label={t("table.scoreCellLabel", { name: studentName, date: formattedDate })}
    >
      {status && <JournalSaveMarker status={status} className="absolute -top-1.5 -right-1.5" />}

      <label className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] hover:bg-row-hover">
        <input
          type="checkbox"
          data-control="attendance"
          tabIndex={controlTabIndex}
          checked={attendance}
          onChange={(event) => onCommand({ kind: "attendance", attended: event.target.checked })}
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-[6px] border-2 border-control-border bg-card checked:border-maroon checked:bg-maroon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card"
          aria-label={t("table.attendanceCellLabel", { name: studentName, date: formattedDate })}
        />
        <Check className="pointer-events-none absolute h-3.5 w-3.5 text-on-primary opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden="true" />
      </label>

      <button
        type="button"
        ref={scoreButtonRef}
        data-control="score"
        tabIndex={controlTabIndex}
        onClick={() => setPopoverOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={popoverOpen}
        className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-[10px] border px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] ${
          score > 0
            ? "border-control-border bg-card font-semibold text-ink hover:bg-row-hover"
            : "border-border bg-card text-muted hover:bg-beige hover:text-ink"
        }`}
      >
        {score > 0 ? score : "—"}
      </button>

      <button
        type="button"
        data-control="comment"
        tabIndex={controlTabIndex}
        onClick={openCommentEditor}
        aria-haspopup="dialog"
        aria-expanded={commentOpen}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] ${
          hasComment ? "text-maroon hover:bg-row-hover" : "text-muted hover:bg-row-hover hover:text-ink"
        }`}
        title={hasComment ? (comment as string) : t("table.addComment")}
        aria-label={
          hasComment
            ? t("table.commentCellLabel", { name: studentName, date: formattedDate })
            : t("table.addCommentCellLabel", { name: studentName, date: formattedDate })
        }
      >
        <MessageSquare className={`h-4 w-4 ${hasComment ? "fill-current" : ""}`} aria-hidden="true" />
      </button>

      {popoverOpen && (
        <JournalScorePicker
          studentName={studentName}
          formattedDate={formattedDate}
          score={score}
          attended={attendance}
          anchorRef={cellRef}
          onChoose={(chosen) => onCommand({ kind: "score", score: chosen })}
          onClose={(reason) => {
            setPopoverOpen(false);
            if (reason !== "outside") scoreButtonRef.current?.focus();
          }}
        />
      )}

      {commentOpen && (
        <JournalCommentEditor
          studentName={studentName}
          formattedDate={formattedDate}
          initialComment={comment}
          onSave={(saved) => onCommand({ kind: "comment", comment: saved })}
          onClose={() => setCommentOpen(false)}
        />
      )}
    </div>
  );
};
