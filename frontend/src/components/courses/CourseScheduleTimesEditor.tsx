import { useTranslation } from "react-i18next";
import {
  isScheduleTimeRangeValid,
  resolveScheduleTimes,
  type ScheduleTimeEdit,
  type ScheduleTimeEdits,
} from "../../lib/courses/formMapping";
import type { CourseScheduleResponse } from "../../lib/courses/types";

interface CourseScheduleTimesEditorProps {
  rows: readonly CourseScheduleResponse[];
  edits: ScheduleTimeEdits;
  showMissingErrors: boolean;
  disabled: boolean;
  onChange: (scheduleId: number, times: ScheduleTimeEdit) => void;
}

const DAY_KEYS: readonly string[] = ["monFull", "tueFull", "wedFull", "thuFull", "friFull", "satFull", "sunFull"];

const timeInputClass: string =
  "w-full min-w-0 min-h-11 rounded-[10px] border bg-card px-3 py-2.5 text-base md:text-sm text-ink tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out disabled:pointer-events-none disabled:bg-strip disabled:cursor-not-allowed";

export function CourseScheduleTimesEditor({ rows, edits, showMissingErrors, disabled, onChange }: CourseScheduleTimesEditorProps) {
  const { t } = useTranslation("courses");

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const times: ScheduleTimeEdit = resolveScheduleTimes(row, edits);
        const dayLabel: string = t(`days.${DAY_KEYS[row.day_of_week] ?? "monFull"}`);
        const bothFilled: boolean = Boolean(times.time_start) && Boolean(times.time_end);
        const hasRangeError: boolean = bothFilled ? !isScheduleTimeRangeValid(times) : showMissingErrors;
        const errorId: string = `schedule-times-error-${row.id}`;
        const borderClass: string = hasRangeError ? "border-destructive" : "border-control-border";

        return (
          <li key={row.id} className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 items-center gap-x-2 gap-y-1.5 md:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
              <span className="col-span-2 text-sm font-medium text-ink md:col-span-1">{dayLabel}</span>
              <input
                type="time"
                aria-label={t("form.dayTimeStartLabel", { day: dayLabel })}
                aria-invalid={hasRangeError}
                aria-describedby={hasRangeError ? errorId : undefined}
                disabled={disabled}
                value={times.time_start}
                onChange={(event) => onChange(row.id, { ...times, time_start: event.target.value })}
                className={`${timeInputClass} ${borderClass}`}
              />
              <input
                type="time"
                aria-label={t("form.dayTimeEndLabel", { day: dayLabel })}
                aria-invalid={hasRangeError}
                aria-describedby={hasRangeError ? errorId : undefined}
                disabled={disabled}
                value={times.time_end}
                onChange={(event) => onChange(row.id, { ...times, time_end: event.target.value })}
                className={`${timeInputClass} ${borderClass}`}
              />
            </div>
            {hasRangeError && (
              <p id={errorId} role="alert" className="text-xs text-destructive">
                {t("form.timeOrderError")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
