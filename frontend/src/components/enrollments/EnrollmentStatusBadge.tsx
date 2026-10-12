import { useTranslation } from "react-i18next";
import type { EnrollmentStatus } from "../../lib/enrollments/types";

const STATUS_STYLE: Record<EnrollmentStatus, string> = {
  active: "bg-success-surface text-success",
  withdrawn: "bg-danger-surface text-destructive",
  completed: "bg-info-surface text-info",
};

export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  const { t } = useTranslation("enrollments");
  const className = STATUS_STYLE[status];

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {t(`status.${status}`)}
    </span>
  );
}
