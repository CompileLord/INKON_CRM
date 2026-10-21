import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCourse } from "../../lib/courses/hooks";
import { useAuthStore } from "../../store/authStore";
import { JournalRouteErrors } from "../../components/journals/JournalRouteErrors";
import { StudentCourseJournal } from "../../components/student/StudentCourseJournal";
import { PanelSkeleton } from "../../components/pane/PaneStates";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { PageContainer } from "../../components/ui/PageContainer";
import { PageHeader } from "../../components/ui/PageHeader";

export function MyCourseJournal() {
  const { courseId: rawCourseId } = useParams<{ courseId: string }>();
  const courseId: number | undefined = rawCourseId !== undefined && /^[1-9]\d*$/.test(rawCourseId) ? Number(rawCourseId) : undefined;
  const { t } = useTranslation(["student", "journals", "common"]);
  const userId: number | null = useAuthStore((state) => state.userId);
  const courseQuery = useCourse(courseId);
  const course = courseQuery.data;
  const denial = courseQuery.isError ? JournalRouteErrors.denialOf(courseQuery.error) : null;
  const backTo: string = courseId !== undefined ? `/my/courses/${courseId}` : "/my/courses";

  const renderBody = () => {
    if (courseId === undefined || denial === "notFound") return <EmptyState title={t("student:courseNotFoundTitle")} description={t("student:courseNotFoundBody")} />;
    if (denial === "forbidden") return <EmptyState title={t("student:courseForbiddenTitle")} description={t("student:courseForbiddenBody")} />;
    if (courseQuery.isError) return <ErrorState title={t("student:courseLoadFailed")} onRetry={() => void courseQuery.refetch()} />;
    if (courseQuery.isLoading || userId === null) return <PanelSkeleton label={t("common:loading")} rows={4} />;
    return <StudentCourseJournal courseId={courseId} selfStudentId={userId} />;
  };

  return (
    <PageContainer>
      <PageHeader title={course?.title ?? t("student:myCoursesTitle")} backTo={backTo} backLabel={t("student:backToCourse")} />
      {renderBody()}
    </PageContainer>
  );
}
