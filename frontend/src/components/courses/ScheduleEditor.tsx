import { Plus, Trash2, Clock, Sparkles } from "lucide-react";
import { Controller, useFieldArray, type Control, type FieldErrors, useWatch } from "react-hook-form";
import { emptyScheduleRow } from "../../lib/courses/formMapping";
import type { CourseFormValues } from "../../lib/courseFormSchema";

const DAYS = [
  { value: "0", label: "Пн", fullLabel: "Понедельник" },
  { value: "1", label: "Вт", fullLabel: "Вторник" },
  { value: "2", label: "Ср", fullLabel: "Среда" },
  { value: "3", label: "Чт", fullLabel: "Четверг" },
  { value: "4", label: "Пт", fullLabel: "Пятница" },
  { value: "5", label: "Сб", fullLabel: "Суббота" },
  { value: "6", label: "Вс", fullLabel: "Воскресенье" },
];

const PRESETS = [
  { label: "Утро", start: "09:00", end: "11:00" },
  { label: "День", start: "14:00", end: "16:00" },
  { label: "Вечер", start: "18:00", end: "20:00" },
];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

const inputClass = `w-full rounded-lg border border-border-warm bg-card px-3 py-2 text-sm text-ink focus:outline-none ${FOCUS_RING}`;

interface ScheduleEditorProps {
  control: Control<CourseFormValues>;
  errors: FieldErrors<CourseFormValues>;
}

export function ScheduleEditor({ control, errors }: ScheduleEditorProps) {
  const { fields, append, remove, update } = useFieldArray({ control, name: "schedules" });
  const schedulesValues = useWatch({ control, name: "schedules" });

  const getDurationText = (start: string, end: string) => {
    if (!start || !end) return null;
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    const startMins = startH * 60 + (startM || 0);
    const endMins = endH * 60 + (endM || 0);
    const diff = endMins - startMins;
    if (diff <= 0) return null;

    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    if (hours > 0 && mins > 0) return `${hours} ч ${mins} мин`;
    if (hours > 0) return `${hours} ч`;
    return `${mins} мин`;
  };

  const getSelectedDays = () => {
    return new Set(schedulesValues?.map((s) => String(s?.day_of_week)) ?? []);
  };

  const selectedDays = getSelectedDays();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border border-border-warm bg-beige/30">
        <span className="text-xs font-semibold text-muted mr-1">Быстрый выбор дней:</span>
        {DAYS.map((day) => {
          const isSelected = selectedDays.has(day.value);
          return (
            <button
              key={day.value}
              type="button"
              onClick={() => {
                if (isSelected) {
                  const idx = schedulesValues.findIndex((s) => String(s?.day_of_week) === day.value);
                  if (idx !== -1 && fields.length > 1) {
                    remove(idx);
                  }
                } else {
                  append({
                    day_of_week: day.value,
                    time_start: "09:00",
                    time_end: "11:00",
                  });
                }
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                isSelected
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-card border border-border-warm text-ink hover:bg-strip"
              }`}
            >
              {day.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const rowValue = schedulesValues?.[index];
          const duration = rowValue ? getDurationText(rowValue.time_start, rowValue.time_end) : null;

          return (
            <div
              key={field.id}
              className="group relative flex flex-col gap-2.5 rounded-xl border border-border-warm bg-card p-3.5 shadow-xs transition-all hover:border-blue-200"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Controller
                    control={control}
                    name={`schedules.${index}.day_of_week`}
                    render={({ field: dayField }) => (
                      <select
                        className={`${inputClass} font-semibold w-36 bg-beige/40 text-blue-700 border-blue-200`}
                        {...dayField}
                      >
                        {DAYS.map((day) => (
                          <option key={day.value} value={day.value}>
                            {day.fullLabel}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                  {duration && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-[11px] font-medium text-blue-700">
                      <Clock size={12} /> {duration}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Удалить день"
                    onClick={() => remove(index)}
                    disabled={fields.length <= 1}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30 ${FOCUS_RING}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="text-[11px] font-medium text-muted mb-1 block">Начало занятия</label>
                  <Controller
                    control={control}
                    name={`schedules.${index}.time_start`}
                    render={({ field: timeField }) => (
                      <input type="time" className={inputClass} {...timeField} />
                    )}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted mb-1 block">Конец занятия</label>
                  <Controller
                    control={control}
                    name={`schedules.${index}.time_end`}
                    render={({ field: timeField }) => (
                      <input type="time" className={inputClass} {...timeField} />
                    )}
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[11px] text-muted flex items-center gap-1">
                  <Sparkles size={11} className="text-amber-500" /> Шаблон:
                </span>
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      update(index, {
                        day_of_week: String(rowValue?.day_of_week ?? "0"),
                        time_start: preset.start,
                        time_end: preset.end,
                      });
                    }}
                    className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-strip text-ink hover:bg-beige transition-colors"
                  >
                    {preset.label} ({preset.start}-{preset.end})
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {errors.schedules?.message && (
        <p className="text-xs font-medium text-red-600">{errors.schedules.message}</p>
      )}
      {errors.schedules?.root?.message && (
        <p className="text-xs font-medium text-red-600">{errors.schedules.root.message}</p>
      )}

      <button
        type="button"
        onClick={() => append({ ...emptyScheduleRow })}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 py-2.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100/60 ${FOCUS_RING}`}
      >
        <Plus size={15} /> Добавить день и время занятий
      </button>
    </div>
  );
}
