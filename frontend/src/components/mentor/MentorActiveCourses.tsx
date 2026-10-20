import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useCourses } from "../../lib/courses/hooks";
import type { CourseListItemResponse } from "../../lib/courses/types";
import { EmptyState } from "../ui/EmptyState";
import { InitialTile } from "../ui/InitialTile";
import { ListRow } from "../ui/ListRow";
import { SectionCard } from "../ui/SectionCard";
import { Pane } from "../pane/PaneStates";

export function MentorActiveCourses() {
  const { t } = useTranslation(["dashboard", "journals", "common"]);
  const { data, isLoading, isError, refetch } = useCourses({ status: "active" });
  const courses: CourseListItemResponse[] = data?.items ?? [];

  return (
    <SectionCard
      title={t("dashboard:myActiveCourses")}
      actions={<Link to="/journals" className="text-sm font-medium text-maroon-text hover:underline">{t("journals:hubTitle")}</Link>}
    >
      <Pane
        isLoadingInitial={data === undefined && isLoading}
        isFailedInitial={data === undefined && isError}
        isStaleFailure={data !== undefined && isError}
        isEmpty={courses.length === 0}
        errorMessage={t("journals:loadFailedCourse")}
        staleMessage={t("dashboard:coursesUpdateFailed")}
        emptyContent={<EmptyState title={t("dashboard:noActiveGroups")} description={t("dashboard:noActiveGroupsHelp")} />}
        onRetry={() => { void refetch(); }}
      >
        <div className="flex flex-col">
          {courses.map((course: CourseListItemResponse) => (
            <ListRow key={course.id} to={`/journals/${course.id}`}>
              <div className="flex items-center gap-3">
                <InitialTile name={course.title} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <span className="break-words text-sm font-medium text-ink">{course.title}</span>
                  <span className="break-words text-sm text-muted">{t(`common:enums.examType.${course.exam_type}`)}</span>
                </div>
              </div>
            </ListRow>
          ))}
        </div>
      </Pane>
    </SectionCard>
  );
}
