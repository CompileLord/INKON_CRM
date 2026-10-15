import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DebtorOverdueProps {
  days: number | null | undefined;
}

export function DebtorOverdue({ days }: DebtorOverdueProps) {
  const { t } = useTranslation("finance");
  if (typeof days !== "number" || !Number.isFinite(days)) {
    return <span className="text-sm text-muted">{t("unavailable")}</span>;
  }
  const isOverdue: boolean = days > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums ${
        isOverdue ? "bg-warning-surface text-warning" : "bg-strip text-muted"
      }`}
    >
      <Clock size={12} aria-hidden="true" />
      {t("overdueDaysCount", { count: days })}
    </span>
  );
}
