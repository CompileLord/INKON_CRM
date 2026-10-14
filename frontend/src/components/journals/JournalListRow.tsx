import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "../ui/PersonAvatar";
import { formatDate } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import type { CourseResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";

export type JournalRowMentorState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; mentor: User };

interface JournalListRowProps {
  course: CourseResponse;
  mentorState: JournalRowMentorState;
  onNavigateOut: () => void;
}

export function JournalListRow({ course, mentorState, onNavigateOut }: JournalListRowProps) {
  const { t } = useTranslation(["journals", "common"]);
  const isActive = course.status === "active";

  return (
    <li>
      <Link
        to={`/journals/${course.id}`}
        onClick={onNavigateOut}
        className="group flex min-h-[80px] items-center gap-3 px-4 py-4 text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-maroon dark:focus-visible:ring-accent md:gap-6 md:px-5"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-center md:gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 break-words text-base font-semibold text-ink [overflow-wrap:anywhere]">
                {course.title}
              </span>
              <span
                className={[
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  isActive ? "bg-success-surface text-success" : "bg-strip text-muted",
                ].join(" ")}
              >
                {t(isActive ? "common:enums.courseStatus.active" : "common:enums.courseStatus.archived")}
              </span>
            </div>
            <p className="text-[13px] text-muted">
              <span>{t(`common:enums.examType.${course.exam_type}`)}</span>
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums">
                {formatDate(course.start_date)} – {formatDate(course.end_date)}
              </span>
            </p>
          </div>

          {mentorState.kind === "hidden" ? null : (
            <div className="flex min-w-0 items-center gap-2 md:w-56 md:shrink-0">
              {mentorState.kind === "ready" ? (
                <>
                  <PersonAvatar
                    firstName={mentorState.mentor.first_name}
                    lastName={mentorState.mentor.last_name}
                    photoUrl={
                      resolveMediaUrl(mentorState.mentor.thumbnail_path ?? mentorState.mentor.photo_path) ?? undefined
                    }
                    size={24}
                  />
                  <span className="min-w-0 break-words text-[13px] text-nav [overflow-wrap:anywhere]">
                    {mentorState.mentor.first_name} {mentorState.mentor.last_name}
                  </span>
                </>
              ) : mentorState.kind === "loading" ? (
                <span aria-hidden="true" className="h-4 w-32 rounded-[10px] bg-strip motion-safe:animate-pulse" />
              ) : (
                <span className="text-[13px] text-muted">{t("hub.mentorUnavailable")}</span>
              )}
            </div>
          )}
        </div>

        <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-maroon dark:text-accent md:inline-flex">
          {t("openJournal")}
        </span>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center text-muted" aria-hidden="true">
          <ChevronRight size={20} />
        </span>
      </Link>
    </li>
  );
}

export function JournalListRowSkeleton({ showMentor }: { showMentor: boolean }) {
  return (
    <li
      aria-hidden="true"
      className="flex min-h-[80px] items-center gap-3 px-4 py-4 motion-safe:animate-pulse md:gap-6 md:px-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-center md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="h-5 w-2/3 rounded-[10px] bg-strip" />
          <div className="h-4 w-1/2 rounded-[10px] bg-strip" />
        </div>
        {showMentor ? <div className="h-5 w-40 rounded-[10px] bg-strip md:w-56" /> : null}
      </div>
      <div className="hidden h-5 w-24 rounded-[10px] bg-strip md:block" />
      <div className="h-11 w-11 shrink-0" />
    </li>
  );
}
