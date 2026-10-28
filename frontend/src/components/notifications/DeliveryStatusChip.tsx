import { useTranslation } from "react-i18next";
import { NotificationPresentation, type DeliveryStatusPresentation } from "../../lib/notifications/NotificationPresentation";
import type { NotificationStatus } from "../../lib/notifications/types";
import { Badge } from "../ui/Badge";

export function DeliveryStatusChip({ status, attempts }: { status: NotificationStatus; attempts: number }) {
  const { t } = useTranslation("notifications");
  const presentation: DeliveryStatusPresentation = NotificationPresentation.deliveryStatus(status);
  return (
    <span data-testid="delivery-status" data-status={status} className="inline-flex w-fit tabular-nums">
      <Badge status={presentation.badgeStatus} label={t(presentation.labelKey, { count: attempts })} />
    </span>
  );
}
