import { useTranslation } from "react-i18next";
import { useCourseSchedule } from "../../lib/courses/hooks";
import { formatMoney } from "../../lib/money";
import { formatTime } from "../../i18n/formatters";
import type { CourseResponse } from "../../lib/courses/types";

interface CourseTermsSummaryProps {
  course: CourseResponse;
  disabled: boolean;
}

const DAY_KEYS: readonly string[] = ["monFull", "tueFull", "wedFull", "thuFull", "friFull", "satFull", "sunFull"];

export function CourseTermsSummary({ course, disabled }: CourseTermsSummaryProps) {
  const { t } = useTranslation(["courses", "common"]);
  const { data: scheduleList, isLoading, isError, refetch } = useCourseSchedule(course.id);
  const examTypeLabel: string = t(`common:enums.examType.${course.exam_type}`);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-ink">{t("form.courseTermsSection")}</h3>
        <p className="text-sm text-muted">{t("form.immutableNotice")}</p>
      </div>
      <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted">{t("form.examTypeLabel")}</dt>
          <dd className="text-sm font-medium text-ink">{examTypeLabel}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted">{t("form.priceLabel")}</dt>
          <dd className="text-sm font-medium tabular-nums text-ink">{formatMoney(course.price)}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t("form.scheduleLabel")}</span>
        {isLoading ? (
          <p className="text-sm text-muted">{t("form.scheduleLoading")}</p>
        ) : isError ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-destructive">{t("form.scheduleLoadError")}</span>
            <button type="button" onClick={() => refetch()} disabled={disabled} className="inline-flex min-h-11 items-center text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t("form.scheduleRetry")}
            </button>
          </div>
        ) : scheduleList && scheduleList.length > 0 ? (
          <ul className="flex flex-col gap-0.5 text-sm text-ink">
            {scheduleList.map((item) => (
              <li key={item.id}>
                <span className="font-medium">{t(`days.${DAY_KEYS[item.day_of_week] ?? "monFull"}`)}:</span>{" "}
                <span className="tabular-nums">{formatTime(item.time_start)}–{formatTime(item.time_end)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("form.noScheduleData")}</p>
        )}
      </div>
    </div>
  );
}
