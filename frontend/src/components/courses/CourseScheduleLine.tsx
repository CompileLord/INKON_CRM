import { useTranslation } from "react-i18next";
import { CourseScheduleGrouper, type ScheduleGroup } from "../../lib/courses/CourseScheduleGrouper";
import type { CourseScheduleResponse } from "../../lib/courses/types";

interface CourseScheduleLineProps {
  schedules: CourseScheduleResponse[];
}

export function CourseScheduleLine({ schedules }: CourseScheduleLineProps) {
  const { t } = useTranslation("courses");
  const groups: ScheduleGroup[] = CourseScheduleGrouper.group(schedules);

  if (groups.length === 0) {
    return <span className="text-sm text-muted">{t("noSchedule")}</span>;
  }

  return (
    <ul className="flex min-w-0 flex-col text-sm text-ink tabular-nums">
      {groups.map((group) => (
        <li key={`${group.days.join("-")}-${group.timeStart}-${group.timeEnd}`} className="break-words">
          {group.days.map((day) => t(`weekdayShort.${day}`)).join(", ")}
          {" · "}
          {group.timeStart}–{group.timeEnd}
        </li>
      ))}
    </ul>
  );
}
