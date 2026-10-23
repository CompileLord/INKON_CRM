import { useTranslation } from "react-i18next";
import { formatDate, formatDateTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { useDeliveryLog } from "../../lib/notifications/hooks";
import { NotificationPresentation, type DeliveryStatusPresentation } from "../../lib/notifications/NotificationPresentation";
import type { DeliveryLogItem, NotificationStatus } from "../../lib/notifications/types";
import { FilterChip } from "../finance/FilterChip";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Pagination } from "../ui/Pagination";

interface DeliveryLogProps {
  failedOnly: boolean;
  page: number;
  onFailedOnlyChange: (failedOnly: boolean) => void;
  onPageChange: (page: number) => void;
}

const ROW_GRID: string = "lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_9rem_8rem_12rem] lg:items-center lg:gap-4";

export function DeliveryStatusChip({ status, attempts }: { status: NotificationStatus; attempts: number }) {
  const { t } = useTranslation("notifications");
  const presentation: DeliveryStatusPresentation = NotificationPresentation.deliveryStatus(status);
  return (
    <span
      data-testid="delivery-status"
      data-status={status}
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${presentation.toneClassName}`}
    >
      {t(presentation.labelKey, { count: attempts })}
    </span>
  );
}

function DeliveryRow({ item }: { item: DeliveryLogItem }) {
  const { t, i18n } = useTranslation("notifications");
  const kind = NotificationPresentation.eventKind(item.type);
  return (
    <li data-testid="delivery-item" className={`flex flex-col gap-1 rounded-[10px] px-3 py-3 hover:bg-row-hover ${ROW_GRID}`}>
      <p className="break-words text-sm font-medium text-ink">{item.recipient_name ?? t("deliveryLog.unknownRecipient")}</p>
      <p className="break-words text-sm text-muted">{t(`events.${kind}.title`)}</p>
      <p className="text-sm text-muted tabular-nums">{formatDate(`${item.notification_date}T12:00:00+05:00`, i18n.language, SCHOOL_TIMEZONE)}</p>
      <DeliveryStatusChip status={item.status} attempts={item.attempts} />
      <p className="text-sm text-muted tabular-nums">{item.sent_at ? formatDateTime(item.sent_at, i18n.language, SCHOOL_TIMEZONE) : t("deliveryLog.notSent")}</p>
    </li>
  );
}

function DeliverySkeleton() {
  const { t } = useTranslation("common");
  return (
    <ul aria-busy="true" aria-label={t("loading")} className="flex flex-col rounded-2xl border border-border bg-card p-1">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className={`flex flex-col gap-2 px-3 py-3 ${ROW_GRID}`}>
          <div className="h-4 w-36 rounded bg-border motion-safe:animate-pulse" />
          <div className="h-4 w-28 rounded bg-border motion-safe:animate-pulse" />
          <div className="h-4 w-20 rounded bg-border motion-safe:animate-pulse" />
          <div className="h-5 w-20 rounded-full bg-border motion-safe:animate-pulse" />
          <div className="h-4 w-32 rounded bg-border motion-safe:animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

export function DeliveryLog({ failedOnly, page, onFailedOnlyChange, onPageChange }: DeliveryLogProps) {
  const { t } = useTranslation(["notifications", "common"]);
  const log = useDeliveryLog(true, page, failedOnly ? "failed" : undefined);
  const items: DeliveryLogItem[] = log.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm text-muted">
          {t("notifications:deliveryLog.scope")}
          <InfoTooltip label={t("notifications:deliveryLog.scopeInfo")}>{t("notifications:deliveryLog.scopeInfo")}</InfoTooltip>
        </p>
        {failedOnly ? (
          <FilterChip label={t("notifications:deliveryLog.failedOnly")} removeLabel={t("common:clearFilter")} onRemove={() => onFailedOnlyChange(false)} />
        ) : (
          <Button type="button" variant="secondary" aria-pressed="false" onClick={() => onFailedOnlyChange(true)}>
            {t("notifications:deliveryLog.failedOnly")}
          </Button>
        )}
      </div>
      {log.isLoading ? (
        <DeliverySkeleton />
      ) : log.isError && !log.data ? (
        <div className="rounded-2xl border border-border bg-card">
          <ErrorState message={t("notifications:loadFailed")} onRetry={() => void log.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <EmptyState title={failedOnly ? t("notifications:deliveryLog.emptyFailed") : t("notifications:deliveryLog.empty")} />
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-1">
          <div aria-hidden="true" className={`hidden px-3 py-2 text-sm text-muted ${ROW_GRID}`}>
            <span>{t("notifications:deliveryLog.recipient")}</span>
            <span>{t("notifications:deliveryLog.event")}</span>
            <span>{t("notifications:deliveryLog.date")}</span>
            <span>{t("notifications:deliveryLog.status")}</span>
            <span>{t("notifications:deliveryLog.sentAt")}</span>
          </div>
          <ul>
            {items.map((item) => <DeliveryRow key={item.id} item={item} />)}
          </ul>
        </div>
      )}
      {(log.data?.total_pages ?? 1) > 1 && (
        <div className="flex justify-end">
          <Pagination page={page} totalPages={log.data?.total_pages ?? 1} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  );
}
