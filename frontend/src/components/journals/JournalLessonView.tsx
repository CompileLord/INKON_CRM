import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { JournalLessonRow } from "./JournalLessonRow";
import { JournalPanelMessage } from "./JournalWorkspaceStates";
import type { JournalRowEditing } from "./JournalStudentRow";
import { useJournalSlideTransition } from "./useJournalSlideTransition";
import { JournalMotion, type MotionDirection } from "../../lib/journals/JournalMotion";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalStudentResponse } from "../../lib/journals/types";

interface JournalLessonViewProps {
  students: JournalStudentResponse[];
  visibleStudentIds: Set<number> | null;
  lessonDate: string;
  periodLabel: string;
  cellStatus: Map<string, CellSaveStatus>;
  editing: JournalRowEditing | null;
  onClearSearch: () => void;
  searchQuery: string;
  onAnchor: (studentId: number, control: string) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

export const JournalLessonView: React.FC<JournalLessonViewProps> = ({
  students,
  visibleStudentIds,
  lessonDate,
  periodLabel,
  cellStatus,
  editing,
  onClearSearch,
  searchQuery,
  onAnchor,
  headingRef,
}) => {
  const { t } = useTranslation("journals");
  const [track, setTrack] = useState<{ lesson: string; direction: MotionDirection }>({ lesson: lessonDate, direction: "later" });
  if (lessonDate !== track.lesson) setTrack({ lesson: lessonDate, direction: lessonDate < track.lesson ? "earlier" : "later" });
  const listRef = useJournalSlideTransition<HTMLUListElement>(
    track.lesson,
    track.direction,
    JournalMotion.LESSON_SLIDE_PIXELS,
    JournalMotion.FEEDBACK_MILLISECONDS,
  );
  const visibleStudents: JournalStudentResponse[] = visibleStudentIds
    ? students.filter((student) => visibleStudentIds.has(student.student_id))
    : students;
  const onCommand = useCallback(
    (...args: Parameters<JournalRowEditing["onEntryCommand"]>): void => editing?.onEntryCommand(...args),
    [editing],
  );

  return (
    <section aria-labelledby="journal-lesson-heading" className="flex flex-col gap-3">
      <h2 id="journal-lesson-heading" ref={headingRef} tabIndex={-1} className="sr-only">
        {t("lesson.heading", { period: periodLabel })}
      </h2>
      {visibleStudents.length === 0 ? (
        <JournalPanelMessage
          tone="empty"
          title={t("search.noMatchTitle")}
          body={t("search.noMatchBody", { query: searchQuery.trim() })}
          retryLabel={t("search.clear")}
          onRetry={onClearSearch}
        />
      ) : (
        <ul ref={listRef} data-direction={track.direction} className="rounded-2xl border border-border bg-card" aria-label={t("lesson.listLabel")}>
          {visibleStudents.map((student) => (
            <JournalLessonRow
              key={`${lessonDate}:${student.student_id}`}
              student={student}
              lessonDate={lessonDate}
              status={cellStatus.get(`${student.student_id}:${lessonDate}`)}
              onCommand={editing ? onCommand : null}
              onAnchor={onAnchor}
            />
          ))}
        </ul>
      )}
    </section>
  );
};
