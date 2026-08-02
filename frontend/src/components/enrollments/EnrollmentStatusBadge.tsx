import { useTranslation } from "react-i18next";
import type { EnrollmentStatus } from "../../lib/enrollments/types";

const STATUS_STYLE: Record<EnrollmentStatus, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-950/70 dark:text-green-300",
  withdrawn: "bg-red-100 text-red-600 dark:bg-red-950/70 dark:text-red-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300",
};

export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  const { t } = useTranslation("enrollments");
  const className = STATUS_STYLE[status];

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {t(`status.${status}`, status)}
    </span>
  );
}
