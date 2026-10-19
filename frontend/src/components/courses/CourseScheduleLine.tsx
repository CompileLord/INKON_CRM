import { Clock } from "lucide-react";
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
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Clock size={13} className="shrink-0" aria-hidden="true" />
        <span>{t("noSchedule")}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1.5 text-xs text-nav tabular-nums min-w-0">
      <Clock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
      <ul className="flex min-w-0 flex-col gap-0.5">
        {groups.map((group) => (
          <li key={`${group.days.join("-")}-${group.timeStart}-${group.timeEnd}`} className="break-words">
            {group.days.map((day) => t(`weekdayShort.${day}`)).join(", ")}
            {" · "}
            {group.timeStart}–{group.timeEnd}
          </li>
        ))}
      </ul>
    </div>
  );
}
