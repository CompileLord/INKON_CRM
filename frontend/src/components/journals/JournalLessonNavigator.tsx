import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatSchoolLessonDate, formatSchoolLessonWeekday } from "../../i18n/formatters";
import { JournalWorkspaceSelection } from "../../lib/journals/JournalWorkspaceSelection";

interface JournalLessonNavigatorProps {
  lessonDates: string[];
  selectedLesson: string | undefined;
  today: string;
  onSelect: (lessonDate: string) => void;
}

const STEP_BUTTON_CLASS: string =
  "flex h-11 w-11 items-center justify-center rounded-[10px] border border-control-border bg-card text-ink hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-border disabled:text-muted disabled:hover:bg-card motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] disabled:active:scale-100";

export const JournalLessonNavigator: React.FC<JournalLessonNavigatorProps> = ({
  lessonDates,
  selectedLesson,
  today,
  onSelect,
}) => {
  const { t } = useTranslation("journals");
  const previous: string | undefined = JournalWorkspaceSelection.neighbourLesson(lessonDates, selectedLesson, -1);
  const next: string | undefined = JournalWorkspaceSelection.neighbourLesson(lessonDates, selectedLesson, 1);

  return (
    <div role="group" aria-label={t("workspace.lessonNav.label")} className="flex items-center gap-2">
      <button
        type="button"
        className={STEP_BUTTON_CLASS}
        disabled={previous === undefined}
        onClick={() => previous && onSelect(previous)}
        aria-label={t("workspace.lessonNav.previous")}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="min-w-[10.5rem] px-1 text-center" aria-live="polite">
        {selectedLesson ? (
          <>
            <div className="text-sm font-semibold tabular-nums text-ink">
              {formatSchoolLessonWeekday(selectedLesson)}, {formatSchoolLessonDate(selectedLesson)}
            </div>
            {selectedLesson === today && <div className="text-xs font-medium text-maroon">{t("workspace.lessonNav.today")}</div>}
          </>
        ) : (
          <div className="text-sm text-muted">{t("workspace.lessonNav.none")}</div>
        )}
      </div>
      <button
        type="button"
        className={STEP_BUTTON_CLASS}
        disabled={next === undefined}
        onClick={() => next && onSelect(next)}
        aria-label={t("workspace.lessonNav.next")}
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
};
