import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { Button } from "../ui/Button";
import { formatDate } from "../../i18n/formatters";
import { formatTjs } from "../../lib/money";
import type { EnrollmentPreviewResponse } from "../../lib/enrollments/types";

interface EnrollmentPreviewPanelProps {
  preview: EnrollmentPreviewResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  studentCount?: number;
}

export function EnrollmentPreviewPanel({ preview, isLoading, isError, onRetry, studentCount = 1 }: EnrollmentPreviewPanelProps) {
  const { t, i18n } = useTranslation("enrollments");
  const money = (amount: string): string => formatTjs(amount);

  if (isLoading) {
    return (
      <div data-testid="enroll-preview-loading" aria-busy="true" aria-label={t("billing.preview.loading")} className="flex flex-col gap-2 rounded-[10px] bg-strip px-3 py-3 motion-safe:animate-pulse">
        <div className="h-4 w-56 max-w-full rounded bg-border" />
        <div className="h-3 w-40 max-w-full rounded bg-border" />
      </div>
    );
  }

  if (isError) {
    return (
      <div data-testid="enroll-preview-error" className="flex items-center justify-between gap-3 rounded-[10px] bg-strip px-3 py-3">
        <p role="alert" className="flex min-w-0 items-center gap-2 text-sm text-destructive">
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          {t("billing.preview.error")}
        </p>
        <Button type="button" variant="secondary" className="shrink-0" onClick={onRetry}>{t("retry", { ns: "common" })}</Button>
      </div>
    );
  }

  if (!preview) return null;

  if (preview.billing_mode === "grant" || preview.first_charge === null) {
    return (
      <p data-testid="enroll-preview" className="rounded-[10px] bg-strip px-3 py-3 text-sm text-ink">{t("billing.preview.grantNoCharges")}</p>
    );
  }

  return (
    <div data-testid="enroll-preview" className="flex flex-col gap-0.5 rounded-[10px] bg-strip px-3 py-3 text-sm">
      <p className="font-medium tabular-nums text-ink">
        {t("billing.preview.firstCharge", { amount: money(preview.first_charge.amount), date: formatDate(preview.first_charge.due_date, i18n.language) })}
      </p>
      <p className="text-xs tabular-nums text-muted">
        {t("billing.preview.summary", { months: preview.billed_months, total: money(preview.total_amount) })}
      </p>
      {studentCount > 1 ? <p className="text-xs text-muted">{t("billing.preview.sameForEach", { count: studentCount })}</p> : null}
    </div>
  );
}
