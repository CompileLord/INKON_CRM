import { useTranslation } from "react-i18next";
import type { BillingMode } from "../../lib/enrollments/types";

export function GrantBadge({ billingMode }: { billingMode: BillingMode | null | undefined }) {
  const { t } = useTranslation("enrollments");
  if (billingMode !== "grant") return null;
  return (
    <span data-testid="grant-badge" className="inline-flex items-center whitespace-nowrap rounded-full bg-strip px-2.5 py-0.5 text-xs font-medium text-muted">
      {t("grantBadge")}
    </span>
  );
}
