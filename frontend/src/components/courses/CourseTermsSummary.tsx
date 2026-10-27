import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import type { CourseResponse } from "../../lib/courses/types";

interface CourseTermsSummaryProps {
  course: CourseResponse;
}

export function CourseTermsSummary({ course }: CourseTermsSummaryProps) {
  const { t } = useTranslation(["courses", "common"]);
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
    </div>
  );
}
