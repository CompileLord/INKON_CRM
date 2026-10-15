import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, MessageSquare } from "lucide-react";
import { JournalSaveMarker } from "./JournalSaveMarker";
import { JournalScoreChoices } from "./JournalScorePicker";
import { JournalCommentEditor } from "./JournalCommentEditor";
import { JournalMotion } from "../../lib/journals/JournalMotion";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import type { JournalEntryCommand } from "../../lib/journals/journalCommands";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalStudentResponse } from "../../lib/journals/types";

interface JournalLessonRowProps {
  student: JournalStudentResponse;
  lessonDate: string;
  status: CellSaveStatus | undefined;
  onCommand: ((studentId: number, lessonDate: string, command: JournalEntryCommand) => void) | null;
  onAnchor: (studentId: number, control: string) => void;
}

const ACTION_BUTTON_CLASS: string =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[10px] border border-control-border bg-card px-3 text-base text-ink hover:bg-row-hover select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]";

export const JournalLessonRow: React.FC<JournalLessonRowProps> = React.memo(
  ({ student, lessonDate, status, onCommand, onAnchor }) => {
    const { t } = useTranslation("journals");
    const [pickerOpen, setPickerOpen] = useState<boolean>(false);
    const [commentOpen, setCommentOpen] = useState<boolean>(false);
    const scoreButtonRef = useRef<HTMLButtonElement>(null);
    const rowRef = useRef<HTMLLIElement>(null);

    useEffect(() => {
      if (!pickerOpen) return undefined;
      const collapseOnOutsidePress = (event: PointerEvent): void => {
        if (rowRef.current && event.target instanceof Node && rowRef.current.contains(event.target)) return;
        setPickerOpen(false);
      };
      document.addEventListener("pointerdown", collapseOnOutsidePress);
      return () => document.removeEventListener("pointerdown", collapseOnOutsidePress);
    }, [pickerOpen]);

    const studentName: string = `${student.first_name} ${student.last_name}`;
    const entry = student.entries.find((candidate) => candidate.lesson_date === lessonDate);
    const attended: boolean = entry ? entry.attendance : false;
    const score: number = entry ? entry.score : 0;
    const comment: string | null = entry ? entry.comment : null;
    const hasComment: boolean = Boolean(comment && comment.trim().length > 0);
    const formattedDate: string = formatSchoolLessonDate(lessonDate);
    const scoreText: string = score > 0 ? String(score) : "—";
    const needsAttention: boolean = status === "error" || status === "conflict";

    return (
      <li
        ref={rowRef}
        data-lesson-row={student.student_id}
        className="scroll-mt-36 border-b border-border px-4 py-2 last:border-b-0"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 select-text break-words text-base font-semibold leading-6 text-ink">{studentName}</span>
          <span className="relative mt-1 h-5 w-5 shrink-0" data-testid="lesson-marker-slot">
            {status && <JournalSaveMarker status={status} className="absolute inset-0 h-5 w-5" />}
          </span>
        </div>
        {onCommand ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <label className={`${ACTION_BUTTON_CLASS} cursor-pointer`}>
              <span className="relative flex h-5 w-5 items-center justify-center">
                <input
                  type="checkbox"
                  data-control="attendance"
                  checked={attended}
                  onFocus={() => onAnchor(student.student_id, "attendance")}
                  onChange={(event) =>
                    onCommand(student.student_id, lessonDate, { kind: "attendance", attended: event.target.checked })
                  }
                  aria-label={t("lesson.attendanceAria", { name: studentName })}
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded-[6px] border-2 border-control-border bg-card checked:border-maroon checked:bg-maroon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card"
                />
                <Check className="pointer-events-none absolute h-3.5 w-3.5 text-on-primary opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden="true" />
              </span>
              <span>{t("lesson.present")}</span>
            </label>
            <button
              ref={scoreButtonRef}
              type="button"
              data-control="score"
              aria-haspopup="menu"
              aria-expanded={pickerOpen}
              onFocus={() => onAnchor(student.student_id, "score")}
              onClick={() => setPickerOpen((previous) => !previous)}
              aria-label={t("lesson.scoreAria", { name: studentName, value: scoreText })}
              className={`${ACTION_BUTTON_CLASS} tabular-nums ${score > 0 ? "font-semibold" : "text-muted"}`}
            >
              {t("lesson.scoreValue", { value: scoreText })}
            </button>
            <button
              type="button"
              data-control="comment"
              aria-haspopup="dialog"
              aria-expanded={commentOpen}
              onFocus={() => onAnchor(student.student_id, "comment")}
              onClick={() => setCommentOpen(true)}
              aria-label={hasComment ? t("lesson.editCommentAria", { name: studentName }) : t("lesson.addCommentAria", { name: studentName })}
              className={`${ACTION_BUTTON_CLASS} relative w-11 px-0 sm:w-auto sm:px-3`}
            >
              <MessageSquare className={`h-5 w-5 sm:h-4 sm:w-4 ${hasComment ? "fill-current text-maroon" : "text-muted"}`} aria-hidden="true" />
              {hasComment && <span data-testid="comment-dot" className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-maroon sm:hidden" aria-hidden="true" />}
              <span className="hidden sm:inline">{hasComment ? t("lesson.editComment") : t("lesson.addComment")}</span>
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-base" role="group" aria-label={t("table.readOnlyCellLabel", { name: studentName, date: formattedDate })}>
            <span className="inline-flex items-center gap-1">
              {attended ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : null}
              <span className="text-muted">{attended ? t("table.present") : t("table.absent")}</span>
            </span>
            <span className="tabular-nums text-ink">{t("lesson.scoreValue", { value: scoreText })}</span>
            {hasComment && (
              <span className="inline-flex items-center gap-1 text-maroon" title={comment as string}>
                <MessageSquare className="h-4 w-4 fill-current" aria-hidden="true" />
                <span>{t("table.hasComment")}</span>
              </span>
            )}
          </div>
        )}
        {pickerOpen && onCommand && (
          <div className="mt-2" data-testid="lesson-score-choices">
            <JournalScoreChoices
              ariaLabel={t("picker.title", { name: studentName, date: formattedDate })}
              score={score}
              size="touch"
              focusOnMount
              onChoose={(chosen) => {
                onCommand(student.student_id, lessonDate, { kind: "score", score: chosen });
                JournalMotion.settle(scoreButtonRef.current);
                setPickerOpen(false);
                scoreButtonRef.current?.focus();
              }}
              onEscape={() => {
                setPickerOpen(false);
                scoreButtonRef.current?.focus();
              }}
            />
          </div>
        )}
        {needsAttention && (
          <p role="status" className="mt-2 text-sm font-medium text-destructive">
            {status === "conflict" ? t("lesson.conflictLine") : t("lesson.errorLine")}
          </p>
        )}
        {commentOpen && onCommand && (
          <JournalCommentEditor
            studentName={studentName}
            formattedDate={formattedDate}
            initialComment={comment}
            onSave={(saved) => onCommand(student.student_id, lessonDate, { kind: "comment", comment: saved })}
            onClose={() => setCommentOpen(false)}
          />
        )}
      </li>
    );
  },
);
