import { useTranslation } from "react-i18next";
import { useMentorProfile } from "../../lib/users/hooks";
import type { CourseResponse } from "../../lib/courses/types";
import { formatSchoolLessonDate, formatSchoolLessonTime, formatSchoolLessonWeekday } from "../../i18n/formatters";
import { EmptyState } from "../ui/EmptyState";
import { ListRow } from "../ui/ListRow";
import { SectionCard } from "../ui/SectionCard";

interface StudentNextLessonProps {
  course: CourseResponse | undefined;
  nextLessonAt: string | null | undefined;
}

export function StudentNextLesson({ course, nextLessonAt }: StudentNextLessonProps) {
  const { t } = useTranslation("student");
  const mentorQuery = useMentorProfile(course?.mentor_id);
  const mentor = mentorQuery.data?.user;

  if (!course || !nextLessonAt) {
    return (
      <SectionCard title={t("nextLesson")}>
        <EmptyState title={t("noUpcomingLessonTitle")} description={t("noUpcomingLessonBody")} />
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("nextLesson")}>
      <ListRow to={`/my/courses/${course.id}`}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums text-ink">{formatSchoolLessonTime(nextLessonAt)}</span>
          <span className="text-sm tabular-nums text-muted">
            {formatSchoolLessonWeekday(nextLessonAt)}, {formatSchoolLessonDate(nextLessonAt)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="break-words font-medium text-ink">{course.title}</span>
          {mentor !== undefined && <span className="text-muted">{mentor.first_name} {mentor.last_name}</span>}
        </div>
      </ListRow>
    </SectionCard>
  );
}
