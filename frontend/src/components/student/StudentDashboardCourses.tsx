import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { StudentCourseProfile } from "../../lib/users/types";
import { EmptyState } from "../ui/EmptyState";
import { SectionCard } from "../ui/SectionCard";
import { StudentCourseListRow } from "./StudentCourseListRow";

const DASHBOARD_COURSE_LIMIT: number = 3;

interface StudentDashboardCoursesProps {
  activeCourses: StudentCourseProfile[];
}

export function StudentDashboardCourses({ activeCourses }: StudentDashboardCoursesProps) {
  const { t } = useTranslation("student");
  return (
    <SectionCard
      title={t("myCourses")}
      actions={<Link to="/my/courses" className="text-sm font-medium text-maroon-text hover:underline">{t("allCoursesLink")}</Link>}
    >
      {activeCourses.length === 0 ? (
        <EmptyState title={t("noCoursesTitle")} description={t("noCoursesBody")} />
      ) : (
        <div className="flex flex-col">
          {activeCourses.slice(0, DASHBOARD_COURSE_LIMIT).map((entry: StudentCourseProfile) => (
            <StudentCourseListRow key={entry.course.id} entry={entry} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
