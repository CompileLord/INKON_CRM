import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { formatNumber } from "../../i18n/formatters";
import { formatMoney, isPositiveMoney } from "../../lib/money";
import type { WithdrawalPreviewResponse } from "../../lib/enrollments/types";

interface WithdrawalPreviewPanelProps {
  preview: WithdrawalPreviewResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function WithdrawalPreviewPanel({ preview, isLoading, isError, onRetry }: WithdrawalPreviewPanelProps) {
  const { t } = useTranslation("courseDetail");

  if (isLoading) {
    return (
      <div data-testid="withdraw-preview-loading" aria-busy="true" className="flex flex-col gap-2 rounded-[10px] bg-strip px-3 py-3 motion-safe:animate-pulse">
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-36 rounded bg-border" />
          <div className="h-4 w-24 rounded bg-border" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-28 rounded bg-border" />
          <div className="h-4 w-32 rounded bg-border" />
        </div>
        <div className="h-3 w-full rounded bg-border" />
        <div className="h-3 w-2/3 rounded bg-border" />
      </div>
    );
  }

  if (isError) {
    return (
      <div data-testid="withdraw-preview-error" className="flex items-center justify-between gap-3 rounded-[10px] bg-strip px-3 py-3">
        <p role="alert" className="min-w-0 text-sm text-destructive">{t("students.withdrawPreview.error")}</p>
        <Button type="button" variant="secondary" className="shrink-0" onClick={onRetry}>{t("students.withdrawPreview.retry")}</Button>
      </div>
    );
  }

  if (!preview) return null;

  const hasCancellation: boolean = preview.months_cancelled > 0 || isPositiveMoney(preview.cancelled_amount);

  return (
    <dl data-testid="withdraw-preview" className="flex flex-col gap-2 rounded-[10px] bg-strip px-3 py-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted">{t("students.withdrawPreview.stillOwed")}</dt>
        <dd className="font-medium tabular-nums text-ink">{t("students.withdrawPreview.amount", { amount: formatMoney(preview.still_owed) })}</dd>
      </div>
      {hasCancellation ? (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">{t("students.withdrawPreview.cancelled")}</dt>
          <dd className="text-right font-medium tabular-nums text-ink">
            {t("students.withdrawPreview.months", { count: preview.months_cancelled, formatted: formatNumber(preview.months_cancelled) })}
            {" · "}
            {t("students.withdrawPreview.amount", { amount: formatMoney(preview.cancelled_amount) })}
          </dd>
        </div>
      ) : null}
      {hasCancellation ? <p className="text-xs text-muted">{t("students.withdrawPreview.creditNote")}</p> : null}
    </dl>
  );
}
