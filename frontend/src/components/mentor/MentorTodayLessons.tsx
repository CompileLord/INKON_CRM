import { useTranslation } from "react-i18next";
import { useCourses } from "../../lib/courses/hooks";
import { TodayLessonsSelector, type TodayLesson } from "../../lib/courses/TodayLessonsSelector";
import { formatTime, getSchoolCalendarDate, getSchoolWeekdayIndex } from "../../i18n/formatters";
import { ListRow } from "../ui/ListRow";
import { SectionCard } from "../ui/SectionCard";
import { EmptyState } from "../ui/EmptyState";
import { MentorPane } from "./MentorPaneStates";

export function MentorTodayLessons() {
  const { t } = useTranslation(["dashboard", "courses"]);
  const { data, isLoading, isError, refetch } = useCourses({ status: "active", page_size: 100 });
  const now: Date = new Date();
  const lessons: TodayLesson[] = TodayLessonsSelector.select(data?.items ?? [], getSchoolCalendarDate(now), getSchoolWeekdayIndex(now));

  return (
    <SectionCard title={t("dashboard:todayLessons")}>
      <MentorPane
        isLoadingInitial={data === undefined && isLoading}
        isFailedInitial={data === undefined && isError}
        isStaleFailure={data !== undefined && isError}
        isEmpty={lessons.length === 0}
        errorMessage={t("dashboard:todayLessonsLoadFailed")}
        staleMessage={t("dashboard:todayLessonsUpdateFailed")}
        emptyContent={<EmptyState title={t("dashboard:noLessonsToday")} description={t("dashboard:noLessonsTodayHelp")} />}
        onRetry={() => { void refetch(); }}
      >
        <ul className="flex flex-col">
          {lessons.map((lesson: TodayLesson) => (
            <li key={`${lesson.courseId}-${lesson.timeStart}`}>
              <ListRow to={`/journals/${lesson.courseId}`}>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="w-28 shrink-0 text-sm font-medium tabular-nums text-ink">
                    {formatTime(lesson.timeStart)}–{formatTime(lesson.timeEnd)}
                  </span>
                  <span className="min-w-0 break-words text-sm text-ink">{lesson.title}</span>
                  <span className="text-sm tabular-nums text-muted">{t("courses:studentsCount", { count: lesson.activeStudentCount })}</span>
                </div>
              </ListRow>
            </li>
          ))}
        </ul>
      </MentorPane>
    </SectionCard>
  );
}
