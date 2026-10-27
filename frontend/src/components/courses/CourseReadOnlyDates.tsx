import { useTranslation } from "react-i18next";
import { formatDate } from "../../i18n/formatters";

interface CourseReadOnlyDatesProps {
  startDate: string;
  endDate: string;
}

export function CourseReadOnlyDates({ startDate, endDate }: CourseReadOnlyDatesProps) {
  const { t } = useTranslation("courses");

  return (
    <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-0.5">
        <dt className="text-sm text-muted">{t("form.startDateLabel")}</dt>
        <dd className="text-sm font-medium tabular-nums text-ink">{formatDate(startDate)}</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-sm text-muted">{t("form.endDateLabel")}</dt>
        <dd className="text-sm font-medium tabular-nums text-ink">{formatDate(endDate)}</dd>
      </div>
    </dl>
  );
}
