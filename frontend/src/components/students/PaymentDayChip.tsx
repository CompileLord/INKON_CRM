import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/formatters";

interface PaymentDayChipProps {
  day: number | null;
}

export function PaymentDayChip({ day }: PaymentDayChipProps) {
  const { t, i18n } = useTranslation("students");

  if (!day) {
    return (
      <span className="text-sm text-muted" aria-label={t("table.paymentDayNone")}>
        —
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-strip px-2.5 py-1 text-xs font-medium text-ink tabular-nums">
      <CalendarDays size={13} aria-hidden="true" className="text-muted" />
      {t("table.paymentDayChip", { day: formatNumber(day, i18n.language) })}
    </span>
  );
}
