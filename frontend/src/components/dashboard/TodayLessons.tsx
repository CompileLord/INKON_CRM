import { useTranslation } from "react-i18next";
import { useCourses } from "../../lib/courses/hooks";
import { useMentors } from "../../lib/users/hooks";
import { TodayLessonsSelector, type TodayLesson } from "../../lib/courses/TodayLessonsSelector";
import { formatTime, getSchoolCalendarDate, getSchoolWeekdayIndex } from "../../i18n/formatters";
import type { User } from "../../lib/users/types";
import { ErrorState } from "../ui/ErrorState";
import { ListRow } from "../ui/ListRow";
import { SectionCard } from "../ui/SectionCard";
import { StaleNotice } from "./StaleNotice";
import { useNextLessonText } from "./useNextLessonText";

interface TodayLessonsProps {
  showMentor: boolean;
}

function LessonsSkeleton() {
  const { t } = useTranslation("common");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-1">
      <span className="sr-only">{t("loading")}</span>
      {[0, 1].map((index) => (
        <div key={index} className="flex items-center gap-4 px-3 py-3 motion-safe:animate-pulse">
          <div className="h-4 w-24 rounded bg-border" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-40 max-w-full rounded bg-border" />
            <div className="h-3 w-24 rounded bg-border" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TodayLessons({ showMentor }: TodayLessonsProps) {
  const { t } = useTranslation(["dashboard", "courses", "common"]);
  const { data, isLoading, isError, refetch } = useCourses({ status: "active", page_size: 100 });
  const { data: mentorsPage } = useMentors({ page_size: 100 }, showMentor);

  const nextLessonText: string | null = useNextLessonText();
  const now: Date = new Date();
  const lessons: TodayLesson[] = TodayLessonsSelector.select(
    data?.items ?? [],
    getSchoolCalendarDate(now),
    getSchoolWeekdayIndex(now),
  );
  const mentorNameById: Map<number, string> = new Map(
    (mentorsPage?.items ?? []).map((mentor: User): [number, string] => [
      mentor.id,
      `${mentor.first_name} ${mentor.last_name}`.trim(),
    ]),
  );

  if (data !== undefined && lessons.length === 0) {
    return (
      <p data-no-lessons-today className="px-1 text-sm text-muted">
        {nextLessonText === null ? t("dashboard:noLessonsTodaySlim") : t("dashboard:noLessonsTodayNext", { when: nextLessonText })}
      </p>
    );
  }

  return (
    <SectionCard title={t("dashboard:todayLessons")}>
      {data === undefined && isLoading ? (
        <LessonsSkeleton />
      ) : data === undefined && isError ? (
        <ErrorState message={t("dashboard:todayLessonsLoadFailed")} onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col">
              {lessons.map((lesson) => (
                <li key={`${lesson.courseId}-${lesson.timeStart}`}>
                  <ListRow to={`/journals/${lesson.courseId}`}>
                    <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                        {formatTime(lesson.timeStart)}–{formatTime(lesson.timeEnd)}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="break-words text-sm font-medium text-ink">{lesson.title}</span>
                        <span className="break-words text-sm text-muted">
                          {showMentor && mentorNameById.get(lesson.mentorId) ? `${mentorNameById.get(lesson.mentorId)} · ` : ""}
                          <span className="tabular-nums">{t("courses:studentsCount", { count: lesson.activeStudentCount })}</span>
                        </span>
                      </span>
                    </span>
                  </ListRow>
                </li>
              ))}
          </ul>
          {isError && <StaleNotice onRetry={() => refetch()} />}
        </div>
      )}
    </SectionCard>
  );
}
