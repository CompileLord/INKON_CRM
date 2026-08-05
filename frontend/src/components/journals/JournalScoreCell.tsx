import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import type { CellSaveStatus } from "../../lib/journals/useJournalAutosave";

export type CellNavDirection = "up" | "down" | "left" | "right";

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
  autoFocus?: boolean;
  onFocus: () => void;
  onNavigate?: (direction: CellNavDirection) => void;
  onChange: (patch: { attendance: boolean; score: number; comment?: string | null }) => void;
}

function useAnchoredOverlay(
  anchorRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  width: number
) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPosition(null);
      return;
    }

    const rect = anchorRef.current.getBoundingClientRect();
    const overlayHeight = overlayRef.current?.offsetHeight ?? 40;
    const margin = 8;

    let top = rect.bottom + 4;
    if (top + overlayHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - overlayHeight - 4);
    }

    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);

    setPosition({ top, left });
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (overlayRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose, anchorRef]);

  return { overlayRef, position };
}

export const JournalScoreCell: React.FC<JournalScoreCellProps> = ({
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
  onChange,
}) => {
  const { t } = useTranslation("journals");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(comment ?? "");
  const cellRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const hasComment = Boolean(comment && comment.trim().length > 0);

  const closeScorePopover = useCallback(() => setPopoverOpen(false), []);
  const closeCommentPopover = useCallback(() => setCommentOpen(false), []);

  const scoreOverlay = useAnchoredOverlay(cellRef, popoverOpen, closeScorePopover, 190);
  const commentOverlay = useAnchoredOverlay(cellRef, commentOpen, closeCommentPopover, 232);

  useEffect(() => {
    if (isFocused && autoFocus && cellRef.current && !cellRef.current.contains(document.activeElement)) {
      cellRef.current.focus({ preventScroll: false });
    }
  }, [isFocused, autoFocus]);

  useEffect(() => {
    setCommentDraft(comment ?? "");
  }, [comment]);

  const openCommentEditor = () => {
    setCommentDraft(comment ?? "");
    setPopoverOpen(false);
    setCommentOpen((prev) => !prev);
  };

  useEffect(() => {
    if (commentOpen) commentInputRef.current?.focus();
  }, [commentOpen]);

  const saveComment = () => {
    const next = commentDraft.trim();
    onChange({ attendance, score, comment: next.length > 0 ? next : null });
    setCommentOpen(false);
    cellRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (commentOpen) return;

    const navKeys: Record<string, CellNavDirection> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };

    if (navKeys[e.key]) {
      e.preventDefault();
      setPopoverOpen(false);
      onNavigate?.(navKeys[e.key]);
    } else if (e.key >= "0" && e.key <= "5") {
      e.preventDefault();
      const val = parseInt(e.key, 10);
      onChange({ attendance: val > 0 ? true : attendance, score: val });
      onNavigate?.("down");
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onChange({ attendance, score: 0 });
    } else if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      onChange({ attendance: !attendance, score });
      onNavigate?.("down");
    } else if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      openCommentEditor();
    }
  };

  let ringStyle = "";
  if (status === "dirty") ringStyle = "ring-1 ring-amber-400/70";
  else if (status === "saving") ringStyle = "ring-1 ring-amber-400/70 opacity-70";
  else if (status === "saved") ringStyle = "ring-1 ring-emerald-500/70 transition-all duration-500";
  else if (status === "conflict") ringStyle = "ring-2 ring-destructive";

  return (
    <div
      ref={cellRef}
      tabIndex={isFocused ? 0 : -1}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      className={`relative group/cell flex items-center justify-center gap-1 p-1 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent ${ringStyle}`}
      aria-label={t("table.scoreCellLabel", { name: studentName, date: lessonDate })}
    >
      <input
        type="checkbox"
        checked={attendance}
        onChange={(e) => onChange({ attendance: e.target.checked, score: e.target.checked ? score : 0 })}
        className="w-3.5 h-3.5 rounded border-border accent-accent cursor-pointer"
        aria-label={t("table.attendanceCellLabel", { name: studentName, date: lessonDate })}
      />

      <button
        type="button"
        onClick={() => {
          setCommentOpen(false);
          setPopoverOpen((prev) => !prev);
        }}
        aria-haspopup="menu"
        aria-expanded={popoverOpen}
        className={`min-w-[26px] h-7 px-1.5 text-xs rounded flex items-center justify-center border transition-colors ${
          score > 0
            ? "border-accent/40 bg-accent/10 text-accent font-bold"
            : "border-border bg-card text-muted hover:bg-beige hover:text-ink"
        }`}
      >
        {score > 0 ? score : "—"}
      </button>

      <button
        type="button"
        onClick={openCommentEditor}
        aria-haspopup="dialog"
        aria-expanded={commentOpen}
        className={`shrink-0 rounded p-0.5 transition-opacity outline-none focus-visible:ring-1 focus-visible:ring-accent ${
          hasComment
            ? "text-amber-500 hover:text-amber-600 opacity-100"
            : "text-muted hover:text-ink opacity-0 group-hover/cell:opacity-70 group-focus-within/cell:opacity-70 focus-visible:opacity-100"
        }`}
        title={hasComment ? (comment as string) : t("table.addComment")}
        aria-label={
          hasComment
            ? t("table.commentCellLabel", { name: studentName, date: lessonDate })
            : t("table.addCommentCellLabel", { name: studentName, date: lessonDate })
        }
      >
        <MessageSquare className={`w-3 h-3 ${hasComment ? "fill-amber-500/25" : ""}`} />
      </button>

      {popoverOpen &&
        createPortal(
          <div
            ref={scoreOverlay.overlayRef}
            role="menu"
            style={{
              position: "fixed",
              top: scoreOverlay.position?.top ?? -9999,
              left: scoreOverlay.position?.left ?? -9999,
              width: 190,
              visibility: scoreOverlay.position ? "visible" : "hidden",
            }}
            className="z-50 bg-card text-ink border border-border rounded-lg shadow-lg p-1 flex justify-between gap-1"
          >
            {[0, 1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                role="menuitemradio"
                aria-checked={score === num}
                onClick={() => {
                  onChange({ attendance: num > 0 ? true : attendance, score: num });
                  setPopoverOpen(false);
                  cellRef.current?.focus();
                }}
                className={`w-7 h-7 rounded text-xs font-semibold flex items-center justify-center transition-colors ${
                  score === num
                    ? "bg-accent text-white"
                    : "text-ink hover:bg-beige"
                }`}
              >
                {num}
              </button>
            ))}
          </div>,
          document.body
        )}

      {commentOpen &&
        createPortal(
          <div
            ref={commentOverlay.overlayRef}
            role="dialog"
            aria-label={t("table.comment")}
            style={{
              position: "fixed",
              top: commentOverlay.position?.top ?? -9999,
              left: commentOverlay.position?.left ?? -9999,
              width: 232,
              visibility: commentOverlay.position ? "visible" : "hidden",
            }}
            className="z-50 bg-card text-ink border border-border rounded-lg shadow-lg p-2.5"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                saveComment();
              }
            }}
          >
            <label className="block text-[11px] font-medium text-muted mb-1">
              {t("table.comment")} — {studentName}
            </label>
            <textarea
              ref={commentInputRef}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              rows={3}
              placeholder={t("table.commentPlaceholder")}
              className="w-full text-xs p-1.5 border border-border rounded bg-card text-ink placeholder:text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent mb-2"
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setCommentOpen(false);
                  cellRef.current?.focus();
                }}
                className="px-2 py-1 text-[11px] font-medium border border-border rounded text-muted hover:bg-beige hover:text-ink transition-colors"
              >
                {t("table.commentCancel")}
              </button>
              <button
                type="button"
                onClick={saveComment}
                className="px-2 py-1 text-[11px] font-semibold bg-accent text-white rounded hover:bg-accent-dark transition-colors"
              >
                {t("table.commentSave")}
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
