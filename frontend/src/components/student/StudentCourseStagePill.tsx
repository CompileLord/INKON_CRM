import { useTranslation } from "react-i18next";
import { Badge } from "../ui/Badge";
import type { StudentCourseProfile } from "../../lib/users/types";

interface StudentCourseStagePillProps {
  course: StudentCourseProfile;
}

export function StudentCourseStagePill({ course }: StudentCourseStagePillProps) {
  const { t } = useTranslation("studentProfile");
  const stageKey: string = course.enrollment_status !== "active" ? course.enrollment_status : course.course.status;
  return (
    <span data-testid="course-stage-pill" className="inline-flex shrink-0">
      {stageKey === "withdrawn" ? (
        <span data-badge-status="withdrawn" className="inline-flex items-center whitespace-nowrap rounded-full bg-strip px-2.5 py-0.5 text-xs font-medium text-muted">{t("courseStatus.withdrawn")}</span>
      ) : (
        <Badge status={stageKey === "completed" ? "completed" : stageKey === "archived" ? "archived" : "active"} />
      )}
    </span>
  );
}
