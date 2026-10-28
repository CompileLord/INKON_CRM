import { useTranslation } from "react-i18next";
import { PersonAvatar } from "../ui/PersonAvatar";
import { Badge } from "../ui/Badge";
import { InitialTile } from "../ui/InitialTile";
import { ListRow } from "../ui/ListRow";
import { resolveMediaUrl } from "../../lib/users/media";
import { usePeriodName } from "../ui/periodName";
import { formatDate } from "../../i18n/formatters";
import type { CourseListItemResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";

export type JournalRowMentorState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; mentor: User };

interface JournalListRowProps {
  course: CourseListItemResponse;
  mentorState: JournalRowMentorState;
  onNavigateOut: () => void;
}

const ROW_COLUMNS_WITH_MENTOR: string = "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]";

export function JournalListRow({ course, mentorState, onNavigateOut }: JournalListRowProps) {
  const { t, i18n } = useTranslation(["journals", "common"]);
  const periodName: (label: string) => string = usePeriodName();
  const hasMentorColumn: boolean = mentorState.kind !== "hidden";
  const hasProgress: boolean =
    course.current_period_label !== null || course.last_graded_lesson_date !== null || course.ungraded_lessons_count > 0;

  return (
    <li onClickCapture={(event) => { if ((event.target as HTMLElement).closest("a") !== null) onNavigateOut(); }}>
      <ListRow to={`/journals/${course.id}`}>
        <span className={`grid items-center gap-x-6 gap-y-1 ${hasMentorColumn ? ROW_COLUMNS_WITH_MENTOR : ""}`}>
          <span className="flex min-w-0 items-center gap-3">
            <InitialTile name={course.title} />
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                <span className="min-w-0 break-words text-sm font-semibold text-ink [overflow-wrap:anywhere]">{course.title}</span>
                {course.status === "archived" && <Badge status="archived" />}
              </span>
              {hasProgress && (
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                  {course.current_period_label !== null && <span data-testid="journal-period">{periodName(course.current_period_label)}</span>}
                  {course.last_graded_lesson_date !== null && (
                    <span data-testid="journal-last-graded" className="tabular-nums">
                      {t("hub.lastGraded", { date: formatDate(course.last_graded_lesson_date, i18n.language) })}
                    </span>
                  )}
                  {course.ungraded_lessons_count > 0 && (
                    <span
                      data-testid="journal-ungraded"
                      title={t("hub.ungradedLabel")}
                      className="rounded-full bg-warning-surface px-2 py-0.5 font-medium tabular-nums text-warning"
                    >
                      {t("hub.ungraded", { count: course.ungraded_lessons_count })}
                    </span>
                  )}
                </span>
              )}
            </span>
          </span>
          {mentorState.kind === "ready" ? (
            <span className="flex min-w-0 items-center gap-2">
              <PersonAvatar
                firstName={mentorState.mentor.first_name}
                lastName={mentorState.mentor.last_name}
                photoUrl={resolveMediaUrl(mentorState.mentor.thumbnail_path ?? mentorState.mentor.photo_path) ?? undefined}
                size={24}
              />
              <span className="min-w-0 break-words text-sm text-muted [overflow-wrap:anywhere]">
                {mentorState.mentor.first_name} {mentorState.mentor.last_name}
              </span>
            </span>
          ) : mentorState.kind === "loading" ? (
            <span aria-hidden="true" className="h-4 w-32 rounded bg-border motion-safe:animate-pulse" />
          ) : mentorState.kind === "unavailable" ? (
            <span className="text-sm text-muted">{t("hub.mentorUnavailable")}</span>
          ) : null}
        </span>
      </ListRow>
    </li>
  );
}

export function JournalListRowSkeleton({ showMentor }: { showMentor: boolean }) {
  return (
    <li aria-hidden="true" className="px-3 py-2 motion-safe:animate-pulse">
      <div className={`grid items-center gap-x-6 gap-y-1 py-1 ${showMentor ? ROW_COLUMNS_WITH_MENTOR : ""}`}>
        <div className="flex items-center gap-3">
          <div className="size-10 shrink-0 rounded-[10px] bg-border" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-2/3 rounded bg-border" />
            <div className="h-3 w-1/2 rounded bg-border" />
          </div>
        </div>
        {showMentor && <div className="hidden h-4 w-40 rounded bg-border md:block" />}
      </div>
    </li>
  );
}
