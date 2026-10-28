import { useTranslation } from "react-i18next";
import { useDeliveryLog, useRetryDelivery } from "../../lib/notifications/hooks";
import { NotificationPresentation } from "../../lib/notifications/NotificationPresentation";
import type { DeliveryLogItem, DeliveryRetryFailure } from "../../lib/notifications/types";
import { useAuthStore } from "../../store/authStore";
import { FilterChip } from "../finance/FilterChip";
import { useTransientToast } from "../settings/useTransientToast";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Pagination } from "../ui/Pagination";
import { Toast } from "../ui/Toast";
import { DeliveryItemCard } from "./DeliveryItemCard";

export { DeliveryStatusChip } from "./DeliveryStatusChip";

interface DeliveryLogProps {
  failedOnly: boolean;
  page: number;
  onFailedOnlyChange: (failedOnly: boolean) => void;
  onPageChange: (page: number) => void;
}

function DeliverySkeleton() {
  const { t } = useTranslation("common");
  return (
    <ul aria-busy="true" aria-label={t("loading")} className="space-y-2">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="size-8 shrink-0 rounded-full bg-border motion-safe:animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-border motion-safe:animate-pulse" />
            <div className="h-3 w-28 rounded bg-border motion-safe:animate-pulse" />
            <div className="h-3 w-48 max-w-full rounded bg-border motion-safe:animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DeliveryLog({ failedOnly, page, onFailedOnlyChange, onPageChange }: DeliveryLogProps) {
  const { t } = useTranslation(["notifications", "common"]);
  const role = useAuthStore((state) => state.role);
  const userId = useAuthStore((state) => state.userId);
  const log = useDeliveryLog(true, page, failedOnly ? "failed" : undefined);
  const retry = useRetryDelivery();
  const { toast, announce } = useTransientToast();
  const items: DeliveryLogItem[] = log.data?.items ?? [];

  const retryItem = (id: number): void => {
    retry.mutate(id, {
      onSuccess: () => announce(t("notifications:deliveryLog.retryQueued")),
      onError: (error: unknown) => {
        const failure: DeliveryRetryFailure = NotificationPresentation.retryFailure(error);
        announce(t(`notifications:deliveryLog.retryError.${failure}`), "error");
      },
    });
  };

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
          <EmptyState
            title={failedOnly ? t("notifications:deliveryLog.emptyFailed") : t("notifications:deliveryLog.empty")}
            description={failedOnly ? t("notifications:deliveryLog.emptyFailedNext") : t("notifications:deliveryLog.emptyNext")}
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <DeliveryItemCard key={item.id} item={item} role={role} userId={userId} retrying={retry.isPending && retry.variables === item.id} onRetry={retryItem} />
          ))}
        </ul>
      )}
      {(log.data?.total_pages ?? 1) > 1 && (
        <div className="flex justify-end">
          <Pagination page={page} totalPages={log.data?.total_pages ?? 1} onPageChange={onPageChange} />
        </div>
      )}
      {toast.message !== "" && <Toast message={toast.message} show={toast.show} variant={toast.variant} />}
    </div>
  );
}
