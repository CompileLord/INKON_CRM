import { useTranslation } from "react-i18next";
import type { StudentCourseProfile } from "../../lib/users/types";

interface StudentCourseStagePillProps {
  course: StudentCourseProfile;
}

export function StudentCourseStagePill({ course }: StudentCourseStagePillProps) {
  const { t } = useTranslation("students");
  const stageKey: string = course.enrollment_status !== "active" ? course.enrollment_status : course.course.status;
  const isActiveStage: boolean = stageKey === "active";

  return (
    <span
      data-testid="course-stage-pill"
      className={[
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        isActiveStage ? "bg-success-surface text-success" : "bg-strip text-muted",
      ].join(" ")}
    >
      {t(`courseStatus.${stageKey}`)}
    </span>
  );
}
