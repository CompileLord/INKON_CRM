import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { formatDateTime } from "../../i18n/formatters";
import { usePasswordSmsDeliveries } from "../../lib/users/hooks";
import type { PasswordSmsDelivery, PasswordSmsDeliveryStatus } from "../../lib/users/types";

interface PasswordSmsDeliveriesProps {
  userId: number;
  enabled: boolean;
}

const STATUS_CLASSES: Record<PasswordSmsDeliveryStatus, string> = {
  pending: "bg-info-surface text-info",
  claimed: "bg-info-surface text-info",
  delivered: "bg-success-surface text-success",
  failed: "bg-danger-surface text-destructive",
  expired: "bg-strip text-muted",
};

const SKELETON_ROW_COUNT: number = 3;

export function PasswordSmsDeliveries({ userId, enabled }: PasswordSmsDeliveriesProps) {
  const { t, i18n } = useTranslation("passwordSms");
  const { data, isLoading, isError, refetch } = usePasswordSmsDeliveries(userId, enabled);

  if (isLoading) {
    return (
      <ul aria-busy="true" aria-label={t("deliveries.listLabel")} className="divide-y divide-border">
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, index: number) => (
          <li key={index} className="grid grid-cols-1 gap-3 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
            <div className="h-6 w-20 rounded-full bg-strip motion-safe:animate-pulse" />
            <div className="h-6 rounded bg-strip motion-safe:animate-pulse" />
          </li>
        ))}
      </ul>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-destructive">{t("deliveries.loadFailed")}</p>
        <Button type="button" variant="secondary" onClick={() => void refetch()} className="min-h-11">{t("deliveries.retry")}</Button>
      </div>
    );
  }

  const deliveries: PasswordSmsDelivery[] = data ?? [];
  if (deliveries.length === 0) {
    return <p className="text-sm text-muted">{t("deliveries.empty")}</p>;
  }

  return (
    <ul aria-label={t("deliveries.listLabel")} className="divide-y divide-border">
      {deliveries.map((delivery: PasswordSmsDelivery) => (
        <li key={delivery.id} data-delivery-status={delivery.status} className="grid grid-cols-1 items-start gap-x-3 sm:grid-cols-[5.5rem_minmax(0,1fr)] gap-y-1 py-3 text-sm">
          <span className={`inline-flex w-fit whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[delivery.status]}`}>
            {t(`status.${delivery.status}`)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 text-ink">
              <span className="font-mono tabular-nums">{delivery.masked_phone ?? t("deliveries.noPhone")}</span>
              <span className="text-xs text-muted tabular-nums">{formatDateTime(delivery.created_at, i18n.language)}</span>
            </div>
            <p className="text-xs text-muted tabular-nums">{t("deliveries.attempts", { count: delivery.attempt_count, max: delivery.max_attempts })}</p>
            {delivery.last_error ? (
              <p className="mt-1 break-words text-xs text-destructive">{t("deliveries.lastError", { message: delivery.last_error })}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
