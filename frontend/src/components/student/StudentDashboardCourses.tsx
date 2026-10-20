import { useTranslation } from "react-i18next";
import type { StudentCourseProfile } from "../../lib/users/types";
import { EmptyState } from "../ui/EmptyState";
import { StudentCourseCard } from "./StudentCourseCard";

interface StudentDashboardCoursesProps {
  activeCourses: StudentCourseProfile[];
  isLoading: boolean;
}

const SKELETON_CARD_COUNT: number = 2;

export function StudentDashboardCourses({ activeCourses, isLoading }: StudentDashboardCoursesProps) {
  const { t } = useTranslation(["student", "common"]);
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" data-testid="student-courses-skeleton" className="grid gap-4 md:grid-cols-2">
        <span className="sr-only">{t("common:loading")}</span>
        {Array.from({ length: SKELETON_CARD_COUNT }, (_: unknown, index: number) => (
          <div key={index} className="h-64 rounded-2xl border border-border bg-card motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }
  if (activeCourses.length === 0) return <EmptyState title={t("student:noCoursesTitle")} description={t("student:noCoursesBody")} />;
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="student-course-cards">
      {activeCourses.map((entry: StudentCourseProfile) => (
        <StudentCourseCard key={entry.course.id} entry={entry} />
      ))}
    </div>
  );
}
