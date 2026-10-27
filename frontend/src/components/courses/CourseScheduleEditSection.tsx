import { useTranslation } from "react-i18next";
import { CourseScheduleTimesEditor } from "./CourseScheduleTimesEditor";
import type { ScheduleTimeEdit, ScheduleTimeEdits } from "../../lib/courses/formMapping";
import type { CourseScheduleResponse } from "../../lib/courses/types";

interface CourseScheduleEditSectionProps {
  rows: readonly CourseScheduleResponse[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  edits: ScheduleTimeEdits;
  showMissingErrors: boolean;
  disabled: boolean;
  onChange: (scheduleId: number, times: ScheduleTimeEdit) => void;
}

export function CourseScheduleEditSection({ rows, isLoading, isError, onRetry, edits, showMissingErrors, disabled, onChange }: CourseScheduleEditSectionProps) {
  const { t } = useTranslation("courses");

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink">{t("form.scheduleSection")}</h3>
      {isLoading ? (
        <p className="text-sm text-muted">{t("form.scheduleLoading")}</p>
      ) : isError ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-destructive">{t("form.scheduleLoadError")}</span>
          <button type="button" onClick={onRetry} disabled={disabled} className="inline-flex min-h-11 items-center text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("form.scheduleRetry")}
          </button>
        </div>
      ) : rows && rows.length > 0 ? (
        <CourseScheduleTimesEditor rows={rows} edits={edits} showMissingErrors={showMissingErrors} disabled={disabled} onChange={onChange} />
      ) : (
        <p className="text-sm text-muted">{t("form.noScheduleData")}</p>
      )}
    </div>
  );
}
