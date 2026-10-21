import { Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, type Control, type FieldErrors, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Select } from "../ui/Select";
import type { ListboxOption } from "../ui/ListboxPicker";
import { emptyScheduleRow } from "../../lib/courses/formMapping";
import type { CourseFormValues } from "../../lib/courseFormSchema";

const DAY_VALUES = ["0", "1", "2", "3", "4", "5", "6"] as const;

const DAY_KEY_MAP: Record<string, { full: string }> = {
  "0": { full: "monFull" },
  "1": { full: "tueFull" },
  "2": { full: "wedFull" },
  "3": { full: "thuFull" },
  "4": { full: "friFull" },
  "5": { full: "satFull" },
  "6": { full: "sunFull" },
};

const inputClass =
  "w-full min-h-11 rounded-[10px] border border-control-border bg-card px-3 py-2.5 text-base md:text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out disabled:pointer-events-none disabled:opacity-100 disabled:bg-strip disabled:cursor-not-allowed";

interface ScheduleEditorProps {
  control: Control<CourseFormValues>;
  errors: FieldErrors<CourseFormValues>;
  disabled?: boolean;
}

export function ScheduleEditor({ control, errors, disabled = false }: ScheduleEditorProps) {
  const { t } = useTranslation(["courses", "common"]);
  const { fields, append, remove } = useFieldArray({ control, name: "schedules" });
  const schedulesValues = useWatch({ control, name: "schedules" });

  const formatDuration = (start: string, end: string): string | null => {
    if (!start || !end) return null;
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    const startMins = startH * 60 + (startM || 0);
    const endMins = endH * 60 + (endM || 0);
    const diff = endMins - startMins;
    if (diff <= 0) return null;

    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    if (hours > 0 && mins > 0) {
      return t("form.durationHoursMins", { hours, mins });
    }
    if (hours > 0) {
      return t("form.durationHours", { hours });
    }
    return t("form.durationMins", { mins });
  };

  const dayCounts = (schedulesValues || []).reduce<Record<string, number>>((acc, row) => {
    if (row?.day_of_week) {
      acc[row.day_of_week] = (acc[row.day_of_week] || 0) + 1;
    }
    return acc;
  }, {});

  const dayOptions: readonly ListboxOption[] = DAY_VALUES.map((value) => ({ value, label: t(`days.${DAY_KEY_MAP[value].full}`) }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const rowValue = schedulesValues?.[index];
          const duration = rowValue ? formatDuration(rowValue.time_start, rowValue.time_end) : null;
          const isDuplicate = rowValue?.day_of_week && (dayCounts[rowValue.day_of_week] || 0) > 1;
          const rowErrors = errors.schedules?.[index];

          return (
            <div
              key={field.id}
              className={`flex flex-col gap-3 rounded-[10px] border p-3 ${isDuplicate ? "border-destructive" : "border-border"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Controller
                    control={control}
                    name={`schedules.${index}.day_of_week`}
                    render={({ field: dayField }) => (
                      <div className="w-52 max-w-full">
                        <Select
                          id={`schedule-day-${index}`}
                          label={t("form.dayOfWeek")}
                          options={dayOptions}
                          value={dayField.value}
                          onChange={dayField.onChange}
                          disabled={disabled}
                          invalid={Boolean(rowErrors?.day_of_week)}
                        />
                      </div>
                    )}
                  />
                  {duration && (
                    <span className="text-sm text-muted tabular-nums">{duration}</span>
                  )}
                </div>

                <button
                  type="button"
                  aria-label={t("form.removeScheduleRow")}
                  onClick={() => remove(index)}
                  disabled={disabled || fields.length <= 1}
                  className="flex size-11 items-center justify-center rounded-[10px] text-muted hover:bg-strip hover:text-ink disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                <div>
                  <label htmlFor={`schedule-time-start-${index}`} className="text-xs font-medium text-label mb-1.5 block">
                    {t("form.timeStart")}
                  </label>
                  <Controller
                    control={control}
                    name={`schedules.${index}.time_start`}
                    render={({ field: timeField }) => (
                      <input
                        id={`schedule-time-start-${index}`}
                        type="time"
                        aria-label={t("form.timeStart")}
                        aria-invalid={Boolean(rowErrors?.time_start)}
                        aria-describedby={rowErrors?.time_start ? `schedule-time-start-error-${index}` : undefined}
                        disabled={disabled}
                        className={`${inputClass} ${rowErrors?.time_start ? "border-destructive/60" : ""}`}
                        {...timeField}
                      />
                    )}
                  />
                  {rowErrors?.time_start && (
                    <p id={`schedule-time-start-error-${index}`} role="alert" className="mt-1 text-xs text-destructive">
                      {t(rowErrors.time_start.message ?? "form.requiredFieldError")}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={`schedule-time-end-${index}`} className="text-xs font-medium text-label mb-1.5 block">
                    {t("form.timeEnd")}
                  </label>
                  <Controller
                    control={control}
                    name={`schedules.${index}.time_end`}
                    render={({ field: timeField }) => (
                      <input
                        id={`schedule-time-end-${index}`}
                        type="time"
                        aria-label={t("form.timeEnd")}
                        aria-invalid={Boolean(rowErrors?.time_end)}
                        aria-describedby={rowErrors?.time_end ? `schedule-time-end-error-${index}` : undefined}
                        disabled={disabled}
                        className={`${inputClass} ${rowErrors?.time_end ? "border-destructive/60" : ""}`}
                        {...timeField}
                      />
                    )}
                  />
                  {rowErrors?.time_end && (
                    <p id={`schedule-time-end-error-${index}`} role="alert" className="mt-1 text-xs text-destructive">
                      {t(rowErrors.time_end.message ?? "form.timeOrderError")}
                    </p>
                  )}
                </div>
              </div>

              {isDuplicate && (
                <p role="alert" className="text-xs text-destructive">
                  {t("form.duplicateDayError")}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {errors.schedules?.message && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {t(errors.schedules.message)}
        </p>
      )}
      {errors.schedules?.root?.message && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {t(errors.schedules.root.message)}
        </p>
      )}

      <button
        type="button"
        onClick={() => append({ ...emptyScheduleRow })}
        disabled={disabled}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[10px] px-3 text-sm font-medium text-maroon-text hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus size={16} aria-hidden="true" /> {t("form.addScheduleRow")}
      </button>
    </div>
  );
}
