import { CourseTermsSummary } from "./CourseTermsSummary";
import { CourseScheduleEditSection } from "./CourseScheduleEditSection";
import type { CourseScheduleEdits } from "./useCourseScheduleEdits";
import type { CourseResponse } from "../../lib/courses/types";

interface CourseEditTermsProps {
  course: CourseResponse;
  schedule: CourseScheduleEdits;
  disabled: boolean;
}

export function CourseEditTerms({ course, schedule, disabled }: CourseEditTermsProps) {
  return (
    <>
      <CourseTermsSummary course={course} />
      <CourseScheduleEditSection
        rows={schedule.rows}
        isLoading={schedule.query.isLoading}
        isError={schedule.query.isError}
        onRetry={() => void schedule.query.refetch()}
        edits={schedule.edits}
        showMissingErrors={schedule.showMissingErrors}
        disabled={disabled}
        onChange={schedule.setTimes}
      />
    </>
  );
}
