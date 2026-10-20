import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMyMentorProfile } from "../../lib/users/hooks";
import { useMentorGradingQueue } from "../../lib/journals/hooks";
import { useCourses } from "../../lib/courses/hooks";
import { StatGroup, StatTile } from "../ui/StatGroup";

interface MentorStatValueProps {
  value: number | undefined;
  isLoading: boolean;
  isError: boolean;
  unavailableMessage: string;
  retryLabel: string;
  staleMessage: string;
  onRetry: () => void;
}

function MentorStatValue({ value, isLoading, isError, unavailableMessage, retryLabel, staleMessage, onRetry }: MentorStatValueProps): ReactNode {
  const { t } = useTranslation("common");
  const retryButton: ReactNode = (
    <button
      type="button"
      onClick={onRetry}
      aria-label={retryLabel}
      className="min-h-11 rounded-[10px] px-2 text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {t("retry")}
    </button>
  );
  if (value === undefined && isLoading) return <span className="inline-block h-8 w-12 rounded bg-strip motion-safe:animate-pulse" />;
  if (value === undefined && isError) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 text-sm font-normal text-muted">
        <span>{unavailableMessage}</span>
        {retryButton}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span>{value}</span>
      {isError && (
        <span className="flex items-center gap-x-1 text-sm font-normal text-muted">
          <span>{staleMessage}</span>
          {retryButton}
        </span>
      )}
    </span>
  );
}

export function MentorStatsStrip() {
  const { t } = useTranslation(["journals", "dashboard", "common"]);
  const profile = useMyMentorProfile();
  const courses = useCourses({ status: "active" });
  const queue = useMentorGradingQueue();

  const activeCoursesCount: number | undefined = courses.data ? (courses.data.total ?? courses.data.items.length) : undefined;
  const needsGradingCount: number | undefined = queue.data ? queue.data.length : undefined;
  const staleMessage: string = t("dashboard:staleFailedNotice");

  return (
    <StatGroup>
      <StatTile
        label={t("journals:mentorStats.myCourses")}
        value={<MentorStatValue value={activeCoursesCount} isLoading={courses.isLoading} isError={courses.isError} unavailableMessage={t("journals:mentorStats.coursesUnavailable")} retryLabel={`${t("common:retry")} ${t("journals:mentorStats.myCourses")}`} staleMessage={staleMessage} onRetry={() => { void courses.refetch(); }} />}
      />
      <StatTile
        label={t("journals:mentorStats.periodsNeedingGrading")}
        value={<MentorStatValue value={needsGradingCount} isLoading={queue.isLoading} isError={queue.isError} unavailableMessage={t("journals:mentorStats.queueUnavailable")} retryLabel={`${t("common:retry")} ${t("journals:mentorStats.periodsNeedingGrading")}`} staleMessage={staleMessage} onRetry={() => { void queue.refetch(); }} />}
      />
      <StatTile
        label={t("journals:mentorStats.myStudents")}
        value={<MentorStatValue value={profile.data?.active_students_count} isLoading={profile.isLoading} isError={profile.isError} unavailableMessage={t("journals:mentorStats.studentsUnavailable")} retryLabel={`${t("common:retry")} ${t("journals:mentorStats.myStudents")}`} staleMessage={staleMessage} onRetry={() => { void profile.refetch(); }} />}
      />
    </StatGroup>
  );
}
