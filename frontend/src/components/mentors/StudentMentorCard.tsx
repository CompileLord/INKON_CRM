import type { ReactElement } from "react";
import type { StudentMentorCardResponse, StudentMentorCourseResponse } from "../../lib/users/types";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMentorProfile } from "../../lib/users/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import { PageContainer } from "../ui/PageContainer";
import { PageHeader } from "../ui/PageHeader";
import { PersonAvatar } from "../ui/PersonAvatar";
import { CourseThumb } from "../student/CourseThumb";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { JournalRouteErrors } from "../journals/JournalRouteErrors";

export function StudentMentorCard({ id }: { id: number | undefined }): ReactElement {
  const { t } = useTranslation(["mentorProfile", "common"]);
  const profile: ReturnType<typeof useMentorProfile> = useMentorProfile(id);
  const denial: ReturnType<typeof JournalRouteErrors.denialOf> = profile.isError ? JournalRouteErrors.denialOf(profile.error) : null;
  const card: StudentMentorCardResponse | undefined = profile.data !== undefined && profile.data.user.id === id && !("active_students_count" in profile.data) ? profile.data : undefined;
  return (
    <PageContainer>
      <PageHeader title={t("studentCard.title")} backTo="/my/courses" backLabel={t("studentCard.back")} />
      {id === undefined || denial ? (
        <EmptyState title={t(denial === "forbidden" ? "state.forbiddenTitle" : "state.notFoundTitle")} description={t(denial === "forbidden" ? "state.forbiddenBody" : "state.notFoundBody")} />
      ) : profile.isLoading ? (
        <div role="status" aria-label={t("common:loading")} className="space-y-4 motion-safe:animate-pulse">
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4"><div className="size-14 shrink-0 rounded-full bg-strip" /><div className="h-7 w-48 max-w-full rounded bg-strip" /></div>
          <div className="h-20 rounded-2xl border border-border bg-strip" />
        </div>
      ) : profile.isError || !card ? (
        <ErrorState title={t("state.failedTitle")} message={t("state.failedBody")} onRetry={() => void profile.refetch()} />
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-border bg-card p-4">
            <PersonAvatar firstName={card.user.first_name} lastName={card.user.last_name} photoUrl={resolveMediaUrl(card.user.thumbnail_path ?? card.user.photo_path) ?? undefined} size={56} />
            <h2 className="min-w-0 break-words text-xl font-semibold text-ink">{card.user.first_name} {card.user.last_name}</h2>
          </div>
          <h2 className="text-base font-medium text-ink">{t("studentCard.courses")}</h2>
          {card.active_courses.length === 0 ? (
            <EmptyState title={t("studentCard.emptyTitle")} description={t("studentCard.emptyBody")} />
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {card.active_courses.map((course: StudentMentorCourseResponse) => (
                <li key={course.id}><Link to={`/my/courses/${course.id}`} className="flex min-w-0 items-center gap-3 p-4 text-ink hover:bg-strip focus-visible:outline-accent">
                  <CourseThumb title={course.title} photoPath={course.photo_path ?? null} />
                  <span className="min-w-0 break-words">{course.title}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </>
      )}
    </PageContainer>
  );
}
