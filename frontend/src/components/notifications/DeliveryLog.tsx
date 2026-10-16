import { AlertTriangle, CheckCircle2, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, formatDateTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { useDeliveryLog } from "../../lib/notifications/hooks";
import { NotificationPresentation } from "../../lib/notifications/NotificationPresentation";
import type { DeliveryLogItem } from "../../lib/notifications/types";
import { FilterChip } from "../finance/FilterChip";
import { Button } from "../ui/Button";
import { Pagination } from "../ui/Pagination";

interface DeliveryLogProps {
  failedOnly: boolean;
  page: number;
  onFailedOnlyChange: (failedOnly: boolean) => void;
  onPageChange: (page: number) => void;
}

const ROW_GRID: string = "lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_9rem_8rem_12rem] lg:items-center lg:gap-4";

function StatusChip({ item }: { item: DeliveryLogItem }) {
  const { t } = useTranslation("notifications");
  const sent: boolean = item.status === "sent";
  return (
    <span
      data-testid="delivery-status"
      data-status={item.status}
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${sent ? "bg-success-surface text-success" : "bg-danger-surface text-destructive"}`}
    >
      {sent ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
      {sent ? t("deliveryLog.sent") : t("deliveryLog.failed", { count: item.attempts })}
    </span>
  );
}

function DeliveryRow({ item }: { item: DeliveryLogItem }) {
  const { t, i18n } = useTranslation("notifications");
  const kind = NotificationPresentation.eventKind(item.type);
  return (
    <li data-testid="delivery-item" className={`flex flex-col gap-1 px-4 py-3 ${ROW_GRID}`}>
      <p className="break-words text-sm font-medium text-ink">{item.recipient_name ?? t("deliveryLog.unknownRecipient")}</p>
      <p className="break-words text-sm text-muted">{t(`events.${kind}.title`)}</p>
      <p className="text-sm text-muted tabular-nums">{formatDate(`${item.notification_date}T12:00:00+05:00`, i18n.language, SCHOOL_TIMEZONE)}</p>
      <StatusChip item={item} />
      <p className="text-xs text-label tabular-nums lg:text-sm">{item.sent_at ? formatDateTime(item.sent_at, i18n.language, SCHOOL_TIMEZONE) : t("deliveryLog.notSent")}</p>
    </li>
  );
}

function DeliverySkeleton() {
  const { t } = useTranslation("common");
  return (
    <ul aria-busy="true" aria-label={t("loading")} className="divide-y divide-border rounded-[14px] border border-border bg-card">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className={`flex flex-col gap-2 px-4 py-3 ${ROW_GRID}`}>
          <div className="h-4 w-36 rounded bg-strip motion-safe:animate-pulse" />
          <div className="h-4 w-28 rounded bg-strip motion-safe:animate-pulse" />
          <div className="h-4 w-20 rounded bg-strip motion-safe:animate-pulse" />
          <div className="h-5 w-20 rounded-full bg-strip motion-safe:animate-pulse" />
          <div className="h-4 w-32 rounded bg-strip motion-safe:animate-pulse" />
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
      <div className="flex flex-wrap items-center gap-2">
        {failedOnly ? (
          <FilterChip label={t("notifications:deliveryLog.failedOnly")} removeLabel={t("common:clearFilter")} onRemove={() => onFailedOnlyChange(false)} />
        ) : (
          <Button type="button" variant="secondary" aria-pressed="false" onClick={() => onFailedOnlyChange(true)}>
            <AlertTriangle size={16} aria-hidden="true" />
            {t("notifications:deliveryLog.failedOnly")}
          </Button>
        )}
      </div>
      {log.isLoading ? (
        <DeliverySkeleton />
      ) : log.isError && !log.data ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-4 py-4">
          <p className="text-sm text-destructive">{t("notifications:loadFailed")}</p>
          <Button type="button" variant="secondary" onClick={() => void log.refetch()}>{t("common:retry")}</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-border bg-card px-6 py-12 text-center">
          <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-strip text-muted"><ScrollText size={28} /></span>
          <p className="max-w-sm text-sm text-muted">{failedOnly ? t("notifications:deliveryLog.emptyFailed") : t("notifications:deliveryLog.empty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <div aria-hidden="true" className={`hidden border-b border-border bg-strip px-4 py-2 text-xs font-semibold uppercase tracking-wide text-label ${ROW_GRID}`}>
            <span>{t("notifications:deliveryLog.recipient")}</span>
            <span>{t("notifications:deliveryLog.event")}</span>
            <span>{t("notifications:deliveryLog.date")}</span>
            <span>{t("notifications:deliveryLog.status")}</span>
            <span>{t("notifications:deliveryLog.sentAt")}</span>
          </div>
          <ul className="divide-y divide-border">
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
