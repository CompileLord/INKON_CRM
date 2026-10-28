import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { formatTjs } from "../../lib/money";
import { Tooltip } from "../ui/Tooltip";
import type { CourseResponse } from "../../lib/courses/types";

interface CourseTermsSummaryProps {
  course: CourseResponse;
}

export function CourseTermsSummary({ course }: CourseTermsSummaryProps) {
  const { t, i18n } = useTranslation(["courses", "common"]);
  const examTypeLabel: string = t(`common:enums.examType.${course.exam_type}`);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        {t("form.courseTermsSection")}
        <Tooltip content={t("form.courseTermsLocked")} focusable>
          <Lock className="size-3.5 text-muted" aria-label={t("form.courseTermsLocked")} role="img" />
        </Tooltip>
      </h3>
      <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted">{t("form.examTypeLabel")}</dt>
          <dd className="text-sm font-medium text-ink">{examTypeLabel}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted">{t("form.priceLabel")}</dt>
          <dd className="text-sm font-medium tabular-nums text-ink">{formatTjs(course.price, { lng: i18n.language })}</dd>
        </div>
      </dl>
    </div>
  );
}
