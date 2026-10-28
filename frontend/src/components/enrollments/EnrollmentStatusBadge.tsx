import { useTranslation } from "react-i18next";
import { Badge } from "../ui/Badge";
import type { EnrollmentStatus } from "../../lib/enrollments/types";

export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  const { t } = useTranslation("enrollments");
  if (status === "active") return null;
  if (status === "completed") return <Badge status={status} />;
  return (
    <span data-badge-status="withdrawn" className="inline-flex items-center whitespace-nowrap rounded-full bg-strip px-2.5 py-0.5 text-xs font-medium text-muted">
      {t(`status.${status}`)}
    </span>
  );
}
