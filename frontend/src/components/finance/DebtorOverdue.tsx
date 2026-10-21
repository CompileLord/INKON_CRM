import { useTranslation } from "react-i18next";

interface DebtorOverdueProps {
  days: number | null | undefined;
}

export function DebtorOverdue({ days }: DebtorOverdueProps) {
  const { t } = useTranslation("finance");
  if (typeof days !== "number" || !Number.isFinite(days)) {
    return <span className="text-sm text-muted">{t("unavailable")}</span>;
  }
  return <span className={`text-sm tabular-nums ${days > 0 ? "text-destructive" : "text-muted"}`}>{t("overdueDaysCount", { count: days })}</span>;
}
